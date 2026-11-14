# College Attendance Planner

A personal college schedule and attendance app: calendar-first timetable,
per-subject attendance tracking, and a leave simulator that shows how a
planned holiday affects each subject before you take it.

**Status:** Phase 11 (more than one user).
Database setup: run these once each, in this order, in the Supabase SQL Editor:
`supabase/phase2_schema.sql`, `phase4_attendance.sql`, `phase5b_ignored.sql`, `phase6_holidays.sql`,
`phase7_notifications.sql`, `phase8_remarks_tasks.sql`, `phase10_profiles.sql`, `phase11_multiuser.sql`,
then `phase7_schedule.sql` (after the reminder function is deployed).
Features are added phase by phase; this README grows with the project.

## Features
- Day / week / month calendar with subject colours
- One-way import of a Google Calendar timetable (no duplicates)
- Present / absent marking with a Pending list for missed prompts
- Subject-wise attendance dashboard (percentage, classes you can still miss)
- Leave simulator that uses the real classes on the chosen dates
- Class remarks, tasks and deadlines, installable on Android as a PWA
- Class reminders, light and dark theme, CSV export

## Tech stack
React + Vite, Supabase (database and Google sign-in), Vercel (hosting).

## Run your own copy
1. Create a free Supabase project and a Vercel project from this repo.
2. In Vercel, add the two environment variables listed in `.env.example`.
3. Enable Google sign-in in Supabase. Run `supabase/phase11_multiuser.sql` to allow anyone to sign up.

Full setup guide and screenshots will be added in the final phase.

## More than one user
Anyone can sign in with Google and gets their own timetable, attendance, tasks and settings. You never need to add people by hand.
The database enforces this with Row Level Security: each table only returns rows whose `user_id` is the signed-in person.
Class reminders are sent to each person's own phone. In Settings, a person can delete their own account and all their data
(this uses the `delete-account` function in `supabase/functions/delete-account`; deploy it with "Verify JWT" off, like `class-reminders`).

Sign-ups are open: `supabase/phase11_multiuser.sql` removes the old "only my email" lock and runs a safety check on every table.
To close sign-ups again, turn off "Allow new users to sign up" in Supabase: Authentication > Sign In / Providers.

Good to know:
- Google lets an unverified app give the calendar permission to about 100 people. Everyone sees a "Google hasn't verified this app" screen. Signing in itself has no such limit. Without a calendar import, people can add subjects and classes by hand.
- Times are India time (IST) for everyone for now.
- You can see who signed up in Supabase: Authentication > Users.

## Privacy and security
No secrets are stored in this repository. All personal data lives in your own
Supabase database, protected by Row Level Security.

## Licence
MIT. See `LICENSE`.
