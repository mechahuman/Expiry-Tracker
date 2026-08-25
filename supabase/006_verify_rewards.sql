-- Module 9 verification. Run in the Supabase SQL Editor after 005_rewards.sql.
-- Every result should read PASS.
--
-- The SQL editor runs as the service role, which BYPASSES RLS and grants -- so
-- the tamper checks below deliberately impersonate a normal authenticated user
-- first. Testing them as service role would prove nothing.

-- ---------------------------------------------------------------------------
-- STEP 1 -- pick a test user. Replace the UUID everywhere below.
-- ---------------------------------------------------------------------------
select id, email from auth.users order by created_at desc limit 5;

-- ---------------------------------------------------------------------------
-- STEP 2 -- structure checks (no impersonation needed)
-- ---------------------------------------------------------------------------

select case when count(*) = 6 then 'PASS' else 'FAIL: expected 6, got ' || count(*) end
         as badges_seeded
from badges;

select case when count(*) = 1 then 'PASS' else 'FAIL: function missing' end as function_exists
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'sync_rewards';

-- The function must take no arguments -- a user_id parameter would let any
-- caller award any account.
select case when pronargs = 0 then 'PASS' else 'FAIL: takes ' || pronargs || ' args' end
         as function_takes_no_user_id
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'sync_rewards';

select case when prosecdef then 'PASS' else 'FAIL: not security definer' end as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'sync_rewards';

-- points must NOT be updatable by authenticated; full_name must still be.
select case when count(*) = 0 then 'PASS' else 'FAIL: points still writable' end
         as points_update_revoked
from information_schema.column_privileges
where table_name = 'profiles' and column_name = 'points'
  and privilege_type = 'UPDATE' and grantee = 'authenticated';

select case when count(*) = 1 then 'PASS' else 'FAIL: full_name not writable' end
         as full_name_still_writable
from information_schema.column_privileges
where table_name = 'profiles' and column_name = 'full_name'
  and privilege_type = 'UPDATE' and grantee = 'authenticated';

select case when count(*) = 0 then 'PASS' else 'FAIL: badges still insertable' end
         as user_badges_insert_revoked
from information_schema.table_privileges
where table_name = 'user_badges' and privilege_type = 'INSERT'
  and grantee in ('authenticated', 'anon');

-- ---------------------------------------------------------------------------
-- STEP 3 -- seed known data, then check the maths.
-- 3 items added, 2 used, of which 1 was used before its expiry date.
-- Expected points: 3*5 + 1*10 = 25. Expected badge: First Item Added only.
-- ---------------------------------------------------------------------------

delete from inventory_items where name like 'M9 test%';
delete from user_badges where user_id = '<test-uuid>';

insert into inventory_items (user_id, name, quantity, unit, expiry_date, input_method, status, used_at)
values
  ('<test-uuid>', 'M9 test active', 1, 'pcs', current_date + 10, 'manual', 'active', null),
  ('<test-uuid>', 'M9 test in time', 1, 'pcs', current_date + 5,  'ocr',    'used',   now()),
  ('<test-uuid>', 'M9 test too late', 1, 'pcs', current_date - 5,  'voice',  'used',   now());

-- ---------------------------------------------------------------------------
-- STEP 4 -- run the function AS THE TEST USER, not as service role.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
                  json_build_object('sub', '<test-uuid>', 'role', 'authenticated')::text,
                  true);
set local role authenticated;

select public.sync_rewards();
-- Expect: points 25, progress {items_added:3, items_used:2, used_before_expiry:1,
--         ocr_scans:1, voice_entries:1}, newly_earned containing First Item Added.

-- ---------------------------------------------------------------------------
-- STEP 5 -- THE TAMPER TESTS. Still impersonating the user.
-- Both must ERROR. If either succeeds, this module has failed at its one job.
-- ---------------------------------------------------------------------------

-- Expect: ERROR permission denied for table profiles (or column points)
update public.profiles set points = 999999 where id = '<test-uuid>';

-- Expect: ERROR permission denied for table user_badges
insert into public.user_badges (user_id, badge_id)
values ('<test-uuid>', (select id from badges where name = 'Inventory Master'));

reset role;

-- ---------------------------------------------------------------------------
-- STEP 6 -- confirm the tampering did NOT take effect.
-- ---------------------------------------------------------------------------

select case when points = 25 then 'PASS'
            when points = 999999 then 'FAIL: tampered value was written'
            else 'FAIL: unexpected points = ' || points end as points_correct
from profiles where id = '<test-uuid>';

select case when count(*) = 1 then 'PASS'
            else 'FAIL: expected 1 badge, got ' || count(*) end as badges_correct
from user_badges where user_id = '<test-uuid>';

-- ---------------------------------------------------------------------------
-- STEP 7 -- idempotency: running twice must not change anything.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
                  json_build_object('sub', '<test-uuid>', 'role', 'authenticated')::text,
                  true);
set local role authenticated;
select public.sync_rewards();  -- newly_earned should now be []
reset role;

select case when points = 25 then 'PASS' else 'FAIL: points drifted to ' || points end
         as points_stable_on_rerun
from profiles where id = '<test-uuid>';

-- ---------------------------------------------------------------------------
-- STEP 8 -- cleanup
-- ---------------------------------------------------------------------------
-- delete from inventory_items where name like 'M9 test%';
-- delete from user_badges where user_id = '<test-uuid>';
-- update profiles set points = 0 where id = '<test-uuid>';
