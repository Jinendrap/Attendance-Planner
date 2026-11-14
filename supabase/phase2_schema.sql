-- Phase 2: semesters, subjects, weekly timetable, dated sessions.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  overall_required_pct int not null default 75,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null,
  colour text not null default '#1f3a5f',
  required_pct int not null default 75 check (required_pct between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, semester_id, name)
);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  room text not null default '',
  faculty text not null default '',
  sessions_per_class int not null default 1 check (sessions_per_class between 1 and 6),
  unique (user_id, semester_id, subject_id, weekday, start_time)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  slot_id uuid references public.timetable_slots(id) on delete set null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  google_event_id text,
  part int not null default 1,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  room text not null default '',
  faculty text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','holiday')),
  is_extra boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, google_event_id, part)
);

create index if not exists sessions_date_idx on public.sessions (user_id, session_date);

do $$
declare t text;
begin
  foreach t in array array['semesters','subjects','timetable_slots','sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
