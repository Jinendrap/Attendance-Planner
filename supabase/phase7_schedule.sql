-- Phase 7 (step 2 of 2): runs the reminder function every minute.
-- Run AFTER the "class-reminders" function is deployed (see README).
--
-- IMPORTANT: replace the two placeholders below ONLY inside the Supabase SQL Editor.
-- Never save or upload this file to GitHub with real values in it.
--   YOUR_PROJECT_REF = the first part of your Supabase URL (https://YOUR_PROJECT_REF.supabase.co)
--   YOUR_CRON_SECRET = the same CRON_SECRET you saved in the function secrets

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'class-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/class-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- To stop the reminders later:  select cron.unschedule('class-reminders');
