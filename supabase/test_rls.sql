-- Module 1: manual RLS verification.
-- Run schema.sql first. Then follow these steps in the Supabase SQL Editor.

-- STEP 1 -- create two throwaway test users (Dashboard -> Authentication ->
-- Users -> Add user). Use any email/password, e.g.:
--   test-a@example.com / TestPass123!
--   test-b@example.com / TestPass123!
-- Copy each user's UUID from the Users table (or run the query below).

select id, email from auth.users order by created_at desc limit 5;

-- STEP 2 -- as the service role (default in the SQL Editor, which bypasses
-- RLS), seed one inventory row per test user so there's something to isolate.
-- Replace the UUIDs with the ones from Step 1.

insert into profiles (id) values ('<test-a-uuid>') on conflict (id) do nothing;
insert into profiles (id) values ('<test-b-uuid>') on conflict (id) do nothing;

insert into inventory_items (user_id, name, quantity, unit, expiry_date, input_method)
values ('<test-a-uuid>', 'Test A milk', 1, 'l', current_date + 5, 'manual');

insert into inventory_items (user_id, name, quantity, unit, expiry_date, input_method)
values ('<test-b-uuid>', 'Test B chips', 1, 'packs', current_date + 5, 'manual');

-- STEP 3 -- impersonate test user A and confirm they see ONLY their own row.
-- This simulates what a real authenticated client request looks like.

select set_config('request.jwt.claims', json_build_object('sub', '<test-a-uuid>', 'role', 'authenticated')::text, true);
set local role authenticated;

select name, user_id from inventory_items;
-- Expected: exactly 1 row ("Test A milk"), NOT "Test B chips".

reset role;

-- STEP 4 -- repeat Step 3 with test user B's UUID and confirm the reverse:
-- only "Test B chips" is visible.

-- STEP 5 -- cleanup once verified (optional, but keeps the DB tidy before
-- Module 2's real signup flow exists).

delete from inventory_items where name in ('Test A milk', 'Test B chips');
-- You can leave the two profiles/auth users in place, or delete the test
-- users from Dashboard -> Authentication -> Users if you'd rather start clean.
