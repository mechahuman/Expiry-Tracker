-- Confirms 002_hardening.sql fully applied. Run in the Supabase SQL Editor.
-- Every row of every result should say PASS.

-- 1. RLS enabled on all five tables?
select tablename,
       case when rowsecurity then 'PASS' else 'FAIL' end as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'categories', 'inventory_items', 'badges', 'user_badges')
order by tablename;

-- 2. Timestamps converted to timestamptz?
select table_name, column_name,
       case when data_type = 'timestamp with time zone' then 'PASS' else 'FAIL: ' || data_type end as result
from information_schema.columns
where table_schema = 'public'
  and column_name in ('created_at', 'used_at', 'earned_at')
order by table_name, column_name;

-- 3. Foreign keys cascade on user delete?
select conname,
       case confdeltype when 'c' then 'PASS (cascade)'
                        when 'n' then 'PASS (set null)'
                        else 'FAIL: ' || confdeltype end as on_delete
from pg_constraint
where conname in ('profiles_id_fkey', 'inventory_items_user_id_fkey',
                  'user_badges_user_id_fkey', 'inventory_items_category_id_fkey',
                  'user_badges_badge_id_fkey')
order by conname;

-- 4. Signup trigger installed?
select case when count(*) = 1 then 'PASS' else 'FAIL: trigger missing' end as signup_trigger
from pg_trigger where tgname = 'on_auth_user_created';

-- 5. Indexes created?
select indexname, 'PASS' as result
from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_inventory_user_status', 'idx_inventory_expiry_active', 'idx_user_badges_user')
order by indexname;
-- Expect 3 rows. Fewer = missing indexes.

-- 6. Every auth user has a profile row (trigger + backfill worked)?
select case when count(*) = 0 then 'PASS'
            else 'FAIL: ' || count(*) || ' users without a profile' end as profile_coverage
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 7. Quantity guard active?
select case when count(*) = 1 then 'PASS' else 'FAIL: constraint missing' end as quantity_check
from pg_constraint where conname = 'inventory_items_quantity_positive';
