-- Module 1 hardening pass (run AFTER schema.sql).
-- Fixes found in the Opus audit of the original schema. Idempotent -- safe to re-run.
--
-- Findings addressed here:
--   1. categories/badges were world-writable via the public anon key  (CRITICAL)
--   2. timestamp -> timestamptz                                       (correctness)
--   3. missing ON DELETE behaviour on auth.users foreign keys         (correctness)
--   4. profiles row created client-side -> moved to a DB trigger      (reliability)
--   5. missing indexes                                                (performance)
--   6. auth.uid() re-evaluated per row in RLS policies                (performance)
--   7. no DB-level guard on quantity                                  (integrity)
--
-- NOT addressed here (deliberate -- design decision deferred to Module 9):
--   profiles.points and user_badges are still directly writable by their owner,
--   so client-side gamification can be cheated from devtools. See PROGRESS.md.

-- ---------------------------------------------------------------------------
-- 1. CRITICAL: lock down the shared reference tables.
--
-- These were created without RLS on the assumption "read-only reference data".
-- That was wrong: Supabase exposes every public-schema table through PostgREST
-- and grants the anon/authenticated roles write privileges by default. With RLS
-- disabled there is nothing to deny the write. Verified live against this
-- project with only the anon key (which ships inside the frontend bundle and is
-- readable by anyone): INSERT into categories returned 201, DELETE returned 204,
-- INSERT into badges returned 201.
--
-- Enabling RLS + a SELECT-only policy makes reads work exactly as before while
-- every write falls through to RLS default-deny.
-- ---------------------------------------------------------------------------

alter table categories enable row level security;
alter table badges enable row level security;

drop policy if exists "Reference data is readable by everyone" on categories;
create policy "Reference data is readable by everyone" on categories
  for select to anon, authenticated using (true);

drop policy if exists "Reference data is readable by everyone" on badges;
create policy "Reference data is readable by everyone" on badges
  for select to anon, authenticated using (true);

-- No insert/update/delete policies: seeding these tables is an admin job, done
-- from the SQL editor (service_role bypasses RLS) or a future migration.

-- ---------------------------------------------------------------------------
-- 2. timestamp -> timestamptz.
--
-- `timestamp` (without time zone) silently drops the offset: now() returns
-- timestamptz, Postgres casts it to the server zone (UTC) and forgets that fact.
-- This app is entirely about dates and deadlines, and is being built in IST
-- (UTC+5:30), so a naive timestamp compared against a local date is wrong by up
-- to a day either side of midnight -- exactly the off-by-one-day class of bug
-- that hurts most in an expiry tracker.
--
-- Existing values were written as UTC, so that's the zone we interpret them in.
-- expiry_date stays `date` on purpose: a printed best-before is a calendar date,
-- not an instant, and should not shift with the reader's time zone.
-- ---------------------------------------------------------------------------

alter table profiles
  alter column created_at type timestamptz using created_at at time zone 'utc',
  alter column created_at set default now();

alter table inventory_items
  alter column created_at type timestamptz using created_at at time zone 'utc',
  alter column created_at set default now(),
  alter column used_at    type timestamptz using used_at    at time zone 'utc';

alter table user_badges
  alter column earned_at type timestamptz using earned_at at time zone 'utc',
  alter column earned_at set default now();

-- ---------------------------------------------------------------------------
-- 3. ON DELETE behaviour for foreign keys.
--
-- Originally plain `references auth.users`, which defaults to NO ACTION: once a
-- user has any inventory row, deleting that user fails with an FK violation.
-- Account deletion is a real flow (and a GDPR-shaped expectation), so a user's
-- own rows should follow them out.
-- ---------------------------------------------------------------------------

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

alter table inventory_items drop constraint if exists inventory_items_user_id_fkey;
alter table inventory_items add constraint inventory_items_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table user_badges drop constraint if exists user_badges_user_id_fkey;
alter table user_badges add constraint user_badges_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- A retired category shouldn't delete the user's food. Null it out instead --
-- category_id is already nullable, and the UI can fall back to "Other".
alter table inventory_items drop constraint if exists inventory_items_category_id_fkey;
alter table inventory_items add constraint inventory_items_category_id_fkey
  foreign key (category_id) references categories (id) on delete set null;

alter table user_badges drop constraint if exists user_badges_badge_id_fkey;
alter table user_badges add constraint user_badges_badge_id_fkey
  foreign key (badge_id) references badges (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. Create the profiles row from a trigger, not the client.
--
-- Module 2 was going to insert into profiles right after signUp(). Two problems:
-- a dropped connection between the two calls leaves an auth user with no
-- profile, and the Google OAuth flow has no equivalent "just signed up" moment
-- in the client to hang the insert off -- the user returns from the redirect
-- already authenticated.
--
-- Doing it in an AFTER INSERT trigger on auth.users makes profile creation
-- atomic with account creation and covers every sign-up path for free.
-- security definer is required: the inserting context is the auth system, not
-- the new user. search_path is pinned to '' (and every name fully qualified) so
-- the function can't be hijacked by a shadowing object in another schema.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any auth users that predate the trigger (e.g. the Module 1 test users).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Indexes.
--
-- Postgres does not index foreign keys automatically, and RLS silently appends
-- `user_id = auth.uid()` to every single query against these tables -- so these
-- columns are in the WHERE clause of literally every read the app makes.
-- ---------------------------------------------------------------------------

-- Module 4's main query: active items for the current user.
create index if not exists idx_inventory_user_status
  on inventory_items (user_id, status);

-- Module 8's scheduled scan: what's expiring soon.
create index if not exists idx_inventory_expiry_active
  on inventory_items (expiry_date) where status = 'active';

create index if not exists idx_user_badges_user
  on user_badges (user_id);

-- ---------------------------------------------------------------------------
-- 6. Wrap auth.uid() in a scalar subquery.
--
-- Written bare, auth.uid() is re-evaluated once per candidate row. Wrapped in
-- (select ...) the planner hoists it into an InitPlan and evaluates it once per
-- query. Same semantics, and it's Supabase's own documented RLS perf guidance.
--
-- Note on the UPDATE policies: omitting WITH CHECK is not a hole here --
-- Postgres falls back to the USING expression for the check, so a user still
-- can't reassign a row to somebody else's id. Made explicit below anyway,
-- because relying on that fallback is the kind of thing that reads as a bug on
-- the next pass through this file.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles
  for update using ((select auth.uid()) = id)
          with check ((select auth.uid()) = id);

drop policy if exists "Users can view own inventory" on inventory_items;
create policy "Users can view own inventory" on inventory_items
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own inventory" on inventory_items;
create policy "Users can insert own inventory" on inventory_items
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own inventory" on inventory_items;
create policy "Users can update own inventory" on inventory_items
  for update using ((select auth.uid()) = user_id)
          with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own inventory" on inventory_items;
create policy "Users can delete own inventory" on inventory_items
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own badges" on user_badges;
create policy "Users can view own badges" on user_badges
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own badges" on user_badges;
create policy "Users can insert own badges" on user_badges
  for insert with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 7. Quantity guard.
--
-- Module 3 validates this in React Hook Form, but client validation is a UX
-- affordance, not an enforcement point -- the REST endpoint is public.
-- ---------------------------------------------------------------------------

alter table inventory_items drop constraint if exists inventory_items_quantity_positive;
alter table inventory_items add constraint inventory_items_quantity_positive
  check (quantity > 0);
