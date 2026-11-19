-- Phase 12: course credits (hours) and experiential classes.
-- Run once in the Supabase SQL Editor (New query > paste > Run). Safe to run again.

-- 1. Credits per subject. 4 credits = 60 hours (15 hours per credit).
alter table public.subjects
  add column if not exists credits int not null default 4 check (credits between 1 and 10);

-- 2. Experiential: the class is held but you do not have to attend; it counts as Present.
alter table public.sessions
  add column if not exists experiential boolean not null default false;
