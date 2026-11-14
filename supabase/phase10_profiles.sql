-- Phase 10b: one profile per user (name, college, course, semester, ID photo).
-- Run once in the Supabase SQL Editor. Safe to run again.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text,
  college text,
  course text,
  semester_name text,
  semester_start date,
  semester_end date,
  calendar_name text,
  photo text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "owner_all" on public.profiles;
create policy "owner_all" on public.profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
