-- Module 8: Web Push subscriptions.
-- Run in the Supabase SQL Editor after schema.sql and 002_hardening.sql.
-- Idempotent -- safe to re-run.

-- The roadmap called this table push_tokens, which is FCM's model: one opaque
-- token per device. Standard Web Push (no Firebase) instead issues a
-- subscription object -- an endpoint URL plus two encryption keys -- so the
-- table matches that shape. Same job, different protocol.
create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  -- The push service's URL for this device. Unique because re-subscribing the
  -- same browser returns the same endpoint, and we want an upsert, not a
  -- duplicate row per login.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_sent_at timestamptz,
  -- Set when a push service reports the subscription is dead (HTTP 404/410),
  -- so the sender can stop retrying it without losing the audit trail.
  expired_at timestamptz
);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions (user_id);

-- Only live subscriptions matter to the nightly job.
create index if not exists idx_push_subscriptions_active
  on push_subscriptions (user_id) where expired_at is null;

alter table push_subscriptions enable row level security;

-- Same ownership model as everything else: a user sees and manages only their
-- own rows. The Edge Function reads across all users via the service role,
-- which bypasses RLS by design.
drop policy if exists "Users can view own push subscriptions" on push_subscriptions;
create policy "Users can view own push subscriptions" on push_subscriptions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own push subscriptions" on push_subscriptions;
create policy "Users can insert own push subscriptions" on push_subscriptions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own push subscriptions" on push_subscriptions;
create policy "Users can update own push subscriptions" on push_subscriptions
  for update using ((select auth.uid()) = user_id)
          with check ((select auth.uid()) = user_id);

-- Needed so a user can unsubscribe, and so a stale row can be cleared when the
-- browser hands back a different endpoint.
drop policy if exists "Users can delete own push subscriptions" on push_subscriptions;
create policy "Users can delete own push subscriptions" on push_subscriptions
  for delete using ((select auth.uid()) = user_id);
