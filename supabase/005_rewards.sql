-- Module 9: points and badges.
-- Run in the Supabase SQL Editor after 002_hardening.sql. Idempotent.
--
-- The point of this file is that the CLIENT STOPS BEING TRUSTED with its own
-- score. Until now RLS only asked "is this your row?", never "did you earn
-- this?", so anyone with devtools could set profiles.points to whatever they
-- liked or insert any badge into their own user_badges. Flagged in the Module 1
-- audit and deferred to here.
--
-- After this: the browser cannot write points or badges at all. It can only
-- call sync_rewards(), which counts the user's real items itself and writes the
-- result. The client never supplies a number, so it cannot lie about one.

-- ---------------------------------------------------------------------------
-- Seed badges
--
-- Only criteria computable from data that already exists. '7-Day Streak' needs
-- login-day tracking and 'Zero Waste Week' needs items to flip to
-- status='expired' -- neither exists yet, and both are real features rather
-- than something to bolt on for one badge each. sync_rewards() is written so
-- seeding them later is safe: an unknown criteria_type simply never unlocks.
-- ---------------------------------------------------------------------------

-- The original schema left badges.name un-constrained, so a re-run of this
-- file would happily insert a second copy of every badge. Deduplicate any that
-- already exist, then make it impossible going forward -- that's what lets the
-- seed below be genuinely idempotent via `on conflict (name)`.
delete from badges b
using badges other
where b.name = other.name and b.id > other.id;

alter table badges drop constraint if exists badges_name_key;
alter table badges add constraint badges_name_key unique (name);

insert into badges (name, description, icon, criteria_type, criteria_value)
values
  ('First Item Added', 'Added your first item to the kitchen.', '🌱', 'items_added', 1),
  ('Stocked Up', 'Tracking 10 items.', '📦', 'items_added', 10),
  ('Inventory Master', 'Tracking 50 items.', '🏆', 'items_added', 50),
  ('Waste Fighter', 'Used 10 items before they expired.', '♻️', 'used_before_expiry', 10),
  ('Early Bird Scanner', 'Added 10 items by scanning a pack.', '📷', 'ocr_scans', 10),
  ('Voice Commander', 'Added 10 items using your voice.', '🎙️', 'voice_entries', 10)
on conflict (name) do update set
  description = excluded.description,
  icon = excluded.icon,
  criteria_type = excluded.criteria_type,
  criteria_value = excluded.criteria_value;

-- ---------------------------------------------------------------------------
-- sync_rewards()
--
-- Takes NO parameters -- deliberately. It reads auth.uid() from the caller's
-- JWT. A user_id argument would let any caller award any account, which would
-- defeat the entire purpose of moving this into the database.
--
-- security definer + pinned search_path follows the handle_new_user precedent
-- in 002_hardening.sql: it needs to write columns the caller can't, and every
-- name is fully qualified so a shadowing object in another schema can't hijack
-- it.
-- ---------------------------------------------------------------------------

create or replace function public.sync_rewards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Point values, per the roadmap's suggested weights. Kept as named constants
  -- rather than a config table: tunable in one place, without the extra
  -- machinery a whole table would bring for six numbers.
  points_per_item_added    constant integer := 5;
  points_per_item_used_in_time constant integer := 10;

  uid uuid := auth.uid();
  v_progress jsonb;
  v_points integer;
  v_new jsonb;
begin
  if uid is null then
    raise exception 'sync_rewards() requires an authenticated caller';
  end if;

  -- One pass over the user's items for every counter we need.
  --
  -- The IST cast is deliberate. used_at is timestamptz (converted in 002), and
  -- a bare ::date would resolve in the connection's UTC -- so an item used at
  -- 1am IST on its expiry date would score against the previous UTC day. Same
  -- IST reasoning as the Module 8 Edge Function.
  select jsonb_build_object(
      'items_added',        count(*) filter (where status <> 'deleted'),
      'items_used',         count(*) filter (where status = 'used'),
      'used_before_expiry', count(*) filter (
                              where status = 'used'
                                and used_at is not null
                                and (used_at at time zone 'Asia/Kolkata')::date <= expiry_date
                            ),
      'ocr_scans',          count(*) filter (where input_method = 'ocr'   and status <> 'deleted'),
      'voice_entries',      count(*) filter (where input_method = 'voice' and status <> 'deleted')
    )
    into v_progress
  from public.inventory_items
  where user_id = uid;

  v_points :=
      (v_progress ->> 'items_added')::int * points_per_item_added
    + (v_progress ->> 'used_before_expiry')::int * points_per_item_used_in_time;

  -- Recomputed from scratch, never incremented: calling this twice cannot
  -- inflate a score, and a dropped call self-corrects on the next one.
  update public.profiles set points = v_points where id = uid;

  -- coalesce(...,0) is what keeps future badge types safe: a criteria_type
  -- with no matching key in v_progress reads as 0 and simply never unlocks,
  -- rather than erroring or awarding falsely.
  --
  -- `on conflict do nothing ... returning` yields only rows that were actually
  -- inserted, which is exactly the "what did I just unlock" list the UI wants.
  with newly as (
    insert into public.user_badges (user_id, badge_id)
    select uid, b.id
    from public.badges b
    where coalesce((v_progress ->> b.criteria_type)::int, 0) >= b.criteria_value
    on conflict (user_id, badge_id) do nothing
    returning badge_id
  )
  select coalesce(
           jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'icon', b.icon)),
           '[]'::jsonb
         )
    into v_new
  from newly
  join public.badges b on b.id = newly.badge_id;

  return jsonb_build_object(
    'points', v_points,
    'progress', v_progress,
    'newly_earned', v_new
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock the client out of writing its own score
--
-- Grants are checked before RLS, so revoking the column privilege denies the
-- write regardless of what any policy says.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
-- Users still own their display name; only points is off limits.
grant update (full_name) on public.profiles to authenticated;

revoke insert, update, delete on public.user_badges from authenticated, anon;

-- The insert policy is now unreachable -- the grant it depended on is gone.
-- Dropping it so the policy list doesn't advertise a permission that no longer
-- exists; a future reader shouldn't have to cross-check grants to know.
drop policy if exists "Users can insert own badges" on public.user_badges;

-- select stays intact on both tables, so the existing RLS policies still let a
-- user read their own points and their own badges.
grant execute on function public.sync_rewards() to authenticated;
revoke execute on function public.sync_rewards() from anon;
