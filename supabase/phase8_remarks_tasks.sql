-- Phase 8: class remarks, tasks and assignments.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.class_remarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_date date not null,
  class_start time not null,
  note text not null,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  remark_id uuid references public.class_remarks(id) on delete set null,
  title text not null,
  kind text not null default 'task' check (kind in ('task','assignment')),
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists remarks_class_idx on public.class_remarks (user_id, subject_id, class_date);
create index if not exists tasks_due_idx on public.tasks (user_id, done, due_date);

do $$
declare t text;
begin
  foreach t in array array['class_remarks','tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
