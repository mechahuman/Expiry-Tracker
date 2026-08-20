-- Module 8: schedule the daily expiry reminder.
-- Run in the Supabase SQL Editor AFTER deploying the Edge Function, and after
-- filling in the two placeholders below.
--
-- Both extensions are available on the Supabase free tier.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- BEFORE RUNNING, replace:
--   <PROJECT_REF>   your Supabase project ref (rrrgwvndhubaxoxeklex)
--   <CRON_SECRET>   the same value you set via
--                   `npx supabase secrets set CRON_SECRET=...`
--
-- Note the schedule is UTC: 03:30 UTC == 09:00 IST. If you ever move the
-- reminder time, change it here AND remember the Edge Function derives "today"
-- in IST, so the two need to stay in agreement.
-- ---------------------------------------------------------------------------

-- Unschedule first so re-running this file updates the job rather than
-- erroring on the duplicate name.
select cron.unschedule('daily-expiry-reminders')
where exists (select 1 from cron.job where jobname = 'daily-expiry-reminders');

select cron.schedule(
  'daily-expiry-reminders',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-expiry-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Checking on it
-- ---------------------------------------------------------------------------

-- The job exists?
--   select jobid, jobname, schedule, active from cron.job;

-- Did recent runs succeed? (pg_cron records the command's own success, not the
-- HTTP response -- net.http_post returns immediately, so this says "the request
-- was queued", not "the push was delivered".)
--   select * from cron.job_run_details
--   where jobname = 'daily-expiry-reminders' order by start_time desc limit 10;

-- The actual HTTP outcome lands here a moment later:
--   select id, status_code, content from net._http_response order by created desc limit 10;

-- To trigger it right now instead of waiting for 9am, run the net.http_post
-- call above on its own, then check net._http_response.

-- ---------------------------------------------------------------------------
-- KNOWN FREE-TIER LIMITATION
-- Supabase pauses a free project after ~1 week without activity, and a paused
-- project runs no cron jobs. Reminders will simply stop, silently, with nothing
-- in job_run_details to explain it -- the scheduler isn't running to log
-- anything. If reminders go quiet, check whether the project is paused before
-- debugging this file.
-- ---------------------------------------------------------------------------
