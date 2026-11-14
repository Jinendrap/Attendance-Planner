-- Phase 4: attendance marks. Run once in Supabase: SQL Editor > New query > paste > Run.
-- One mark per session (enforced by the database), so duplicates are impossible.

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  status text not null check (status in ('present','absent')),
  reason text,
  marked_at timestamptz not null default now()
);

alter table public.attendance enable row level security;
drop policy if exists "owner_all" on public.attendance;
create policy "owner_all" on public.attendance for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
