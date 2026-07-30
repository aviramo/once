-- Daily tick for the account archive (ext/archive). Its own schedule rather than
-- a step inside the per-minute cron, for the same reason the log purge and the
-- watch sweep have theirs: a 30-day clock needs no finer granularity, and the
-- work it does — storage deletes and an auth-identity delete per row — has no
-- business on the hot path. 03:40 UTC, off the hour so it does not land with the
-- hourly sweeps. Bounded at 20 accounts a tick inside app_archive_due, so a
-- backlog drains over a few days and a steady state is one tick, nothing found.
select cron.schedule(
  'archive-purge',
  '40 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sjsblyumdlwckrshwxei.supabase.co/functions/v1/ext/archive',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc2JseXVtZGx3Y2tyc2h3eGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIxODA2NzIsImV4cCI6MjAzNzc1NjY3Mn0.tfAxrqzKILEQ5xrnsmSTTFMgtHAvyANiI6GFY2Ubg0E"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
