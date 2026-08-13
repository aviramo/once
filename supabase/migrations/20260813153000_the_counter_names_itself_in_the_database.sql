-- The scan counter, described where the table is.
--
-- This is also the first migration applied by the pipeline in
-- .github/workflows/db-migrate.yml rather than by hand, and it is deliberately
-- a migration that cannot hurt anything: comments change no data, no shape and
-- no behaviour, so a green run proves the whole path - a push reaches the
-- runner, the token opens the Management API, the statement lands, the version
-- is recorded - with nothing at risk if it does not.
comment on table public.scan_devices is
  'One row per DEVICE that opened /scan, the business card''s landing page. Not per visit: a repeat visit only moves last_seen_at and hits. Written by the site''s own route handler (web/src/app/api/scan/route.ts) through app_scan_seen; read by the panel through admin_scan_metrics. Outside users.env - a visitor to a printed address has no account and no environment.';

comment on column public.scan_devices.device_id is
  'The page''s own localStorage id, or a hash of IP + user-agent for a browser that keeps nothing. Neither of those inputs is stored.';
comment on column public.scan_devices.platform is
  'What the device is, decided at the moment of the scan and never overwritten: android / ios / desktop.';
comment on column public.scan_devices.hits is
  'Opens only. A button press is not a new visit, so the gap between this and the row count is what says whether people come back to the card.';
comment on column public.scan_devices.downloaded_at is
  'FIRST press of the store button. A stamp and not a counter: the question is how many of the people who scanned went on to press it.';
comment on column public.scan_devices.notified_at is
  'FIRST press of "tell me when there is an iPhone version", which stands in the store button''s place on an iPhone.';
comment on column public.scan_devices.more_at is
  'FIRST press of the link out to the site.';

comment on function public.app_scan_seen(text, text, text) is
  'The scan page says a device is here, or that it pressed something. One round trip: insert, or touch the row that device already has. The platform and every press stamp are sticky, so nothing a repeat visit does can overwrite what the first one recorded.';
comment on function public.admin_scan_metrics() is
  'The panel''s scan block. Every figure counts DEVICES, never presses: how many of the people who scanned went on to press this.';
