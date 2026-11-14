-- Phase 11: open the app to more than one user.
-- Run once in the Supabase SQL Editor (New query > paste > Run). Safe to run again.

-- 1. Remove the old "only my email may sign up" lock. After this, any Google account can sign up.
drop trigger if exists restrict_signups on auth.users;
drop function if exists public.restrict_signups();

-- 2. Safety check: every table must say "protected by owner policy" or "locked".
-- If any row says PROBLEM, tell Claude before sharing the app with anyone.
select c.relname as table_name,
  case
    when not c.relrowsecurity then 'PROBLEM: row security is OFF'
    when not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
      then 'locked (the app cannot touch it) - fine'
    else 'protected by owner policy'
  end as status
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 2, 1;
