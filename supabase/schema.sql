-- Module 1: core schema + Row Level Security
-- Run this whole file once in the Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT / OR REPLACE).
--
-- !! THEN RUN 002_hardening.sql -- it fixes a critical hole in this file
-- !! (categories/badges writable by anyone) plus several correctness issues.
-- !! This file is kept as-written for history; 002 is the current state.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- auth.users is managed by Supabase Auth automatically. We extend it with a
-- profile row per user (created client-side right after signup, in Module 2).
create table if not exists profiles (
  id uuid references auth.users primary key,
  full_name text,
  points integer default 0,
  created_at timestamp default now()
);

-- Shared reference data. NOTE: the "no RLS needed" reasoning below turned out to
-- be wrong -- without RLS these tables are WRITABLE by anyone holding the anon
-- key. Locked down in 002_hardening.sql; run that too.
create table if not exists categories (
  id serial primary key,
  name text unique not null
);

insert into categories (name)
values ('Snacks'), ('Dairy'), ('Beverages'), ('Ready-to-eat'), ('Other')
on conflict (name) do nothing;

create table if not exists inventory_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  quantity numeric not null,
  unit text not null,
  category_id integer references categories,
  expiry_date date not null,
  input_method text check (input_method in ('manual', 'voice', 'ocr')) not null,
  status text check (status in ('active', 'used', 'expired', 'deleted')) default 'active',
  image_url text,
  created_at timestamp default now(),
  used_at timestamp
);

-- Shared reference data -- same wrong assumption as categories, same fix in
-- 002_hardening.sql.
create table if not exists badges (
  id serial primary key,
  name text not null,
  description text not null,
  icon text,
  criteria_type text not null,   -- e.g. 'items_added', 'streak_days', 'zero_waste_week'
  criteria_value integer not null
);

create table if not exists user_badges (
  id serial primary key,
  user_id uuid references auth.users not null,
  badge_id integer references badges not null,
  earned_at timestamp default now(),
  unique(user_id, badge_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Each user may only read/write their own rows in profiles, inventory_items,
-- and user_badges. categories and badges are shared reference data (no RLS
-- needed -- there's nothing user-specific in them).
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table inventory_items enable row level security;
alter table user_badges enable row level security;

drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

drop policy if exists "Users can view own inventory" on inventory_items;
create policy "Users can view own inventory" on inventory_items
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on inventory_items;
create policy "Users can insert own inventory" on inventory_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on inventory_items;
create policy "Users can update own inventory" on inventory_items
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on inventory_items;
create policy "Users can delete own inventory" on inventory_items
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can view own badges" on user_badges;
create policy "Users can view own badges" on user_badges
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own badges" on user_badges;
create policy "Users can insert own badges" on user_badges
  for insert with check (auth.uid() = user_id);

-- No update/delete policy on user_badges: earned badges are append-only for
-- the user (with RLS on and no matching policy, those ops are denied by
-- default -- this is intentional, not an oversight).
