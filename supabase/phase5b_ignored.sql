-- Phase 5b: remembers subjects you removed (e.g. "Lunch Break") so a re-import does not bring them back.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.ignored_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name_key text not null,
  unique (user_id, semester_id, name_key)
);

alter table public.ignored_subjects enable row level security;
drop policy if exists "owner_all" on public.ignored_subjects;
create policy "owner_all" on public.ignored_subjects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
