-- THE CARD COUNTS DEVICES, NOT VISITS.
--
-- /scan is the business card's landing page, and until now it recorded nothing
-- at all: a stack of printed cards went out with no way to answer "how many
-- people actually scanned one". This is that counter, and it is deliberately
-- the smallest thing that answers the question.
--
-- ONE ROW PER DEVICE (user directive 2026-08-13). A card is scanned by a
-- PERSON, and the same person opening the page three times — scanning at the
-- table, again on the way home, again when the app finally installs — is one
-- person who took a card, not three. So the key is a device id the page keeps
-- in its own localStorage, and a repeat visit only moves `last_seen_at` and
-- `hits`. `hits` is kept because the gap between it and the row count is the
-- one thing that says whether people come BACK to the card.
--
-- The identity is the browser's, so it is honest about what it can be: a
-- cleared browser or a second browser on the same phone counts twice, and a
-- visitor with no storage at all (private mode) is identified server-side by a
-- hash of IP + user-agent, which collides for two phones on one Wi-Fi. Both
-- err towards UNDER-counting in the case that matters (one person, many
-- visits) and are stated on the panel's own hint rather than hidden.
--
-- NO IP AND NO USER-AGENT ARE STORED. The fallback identity is a hash the
-- route computes and throws away the inputs of; there is nothing here to tie a
-- row to a person, which is what lets an anonymous marketing counter live in
-- the same database as the users.
--
-- This table is OUTSIDE the three worlds (`users.env`): a visitor to a
-- printed URL has no account, no location and therefore no environment, so the
-- panel's environment switch deliberately does not move these numbers.
create table if not exists public.scan_devices (
  device_id     text        primary key,
  -- What the DEVICE is, which is the whole segmentation the card needs: an
  -- Android scan can install today and an iPhone scan cannot (the page shows
  -- it the "not yet on iPhone" state), so the two numbers are read as two
  -- different outcomes rather than as one total.
  platform      text        not null check (platform in ('android', 'ios', 'desktop')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  hits          integer     not null default 1
);

create index if not exists scan_devices_platform_idx
  on public.scan_devices (platform);

-- Nobody reaches this table with a user's key. RLS on with NO policy at all is
-- the statement: only the service role (the site's own route handler and the
-- panel) may read or write it.
alter table public.scan_devices enable row level security;

-- One round trip for "this device is here": insert, or touch the row it
-- already has. The platform is NOT overwritten on conflict — a phone does not
-- change its OS, and the first answer is the one taken at the moment of the
-- scan.
create or replace function public.app_scan_seen(p_device text, p_platform text)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.scan_devices (device_id, platform)
  values (p_device, p_platform)
  on conflict (device_id) do update
     set last_seen_at = now(),
         hits         = public.scan_devices.hits + 1;
$$;

revoke execute on function public.app_scan_seen(text, text) from public, anon, authenticated;

-- The panel's two numbers. A separate RPC from `admin_dashboard_metrics`
-- because that one is bounded by the environment switch and scoped to a
-- manager's own users, and neither of those questions applies to an anonymous
-- visitor to a printed address.
create or replace function public.admin_scan_metrics()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'android', count(*) filter (where platform = 'android'),
    'ios',     count(*) filter (where platform = 'ios'),
    'desktop', count(*) filter (where platform = 'desktop'),
    'devices', count(*),
    'hits',    coalesce(sum(hits), 0)
  )
  from public.scan_devices;
$$;

revoke execute on function public.admin_scan_metrics() from public, anon, authenticated;
