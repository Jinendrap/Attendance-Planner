-- Phase 7 (step 1 of 2): tables for phone notifications.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "owner_all" on public.push_subscriptions;
create policy "owner_all" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Remembers that a class reminder was already sent, so it is never sent twice.
alter table public.sessions add column if not exists reminder_sent_at timestamptz;
