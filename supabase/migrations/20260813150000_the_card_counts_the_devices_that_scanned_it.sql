-- THE CARD COUNTS DEVICES, NOT VISITS, AND WHAT EACH OF THEM DID.
--
-- /scan is the business card's landing page (https://once-lake.vercel.app/scan)
-- and it recorded nothing at all: a stack of printed cards went out with no way
-- to answer "how many people actually scanned one, and did any of them go on to
-- the store". This is that counter, and it is deliberately the smallest thing
-- that answers both questions.
--
-- ONE ROW PER DEVICE (user directive 2026-08-13). A card is scanned by a
-- PERSON, and the same person opening the page three times — at the table,
-- again on the way home, again when the app finally installs — is one person
-- who took a card, not three. So the key is a device id the page keeps in its
-- own localStorage, and a repeat visit only moves `last_seen_at` and `hits`.
-- `hits` counts OPENS only (a button press is not a new visit), so the gap
-- between it and the row count is the one thing that says whether people come
-- back to the card.
--
-- The identity is the browser's, so it is honest about what it can be: a
-- cleared browser or a second browser on the same phone counts twice, and a
-- visitor with no storage at all (private mode) is identified server-side by a
-- hash of IP + user-agent, which collides for two phones on one Wi-Fi. Both err
-- towards UNDER-counting in the case that matters (one person, many visits) and
-- are stated on the panel's own hint rather than hidden.
--
-- NO IP AND NO USER-AGENT ARE STORED. The fallback identity is a hash the route
-- computes and throws away the inputs of; there is nothing here to tie a row to
-- a person, which is what lets an anonymous marketing counter live in the same
-- database as the users.
--
-- WHAT THE DEVICE DID IS THREE TIMESTAMPS, NOT THREE COUNTERS (user directive
-- 2026-08-13). The question is how many of the people who scanned went on to
-- press something, so the same person pressing the store button twice is still
-- one person who pressed it. Each stamp is the FIRST press and is never
-- overwritten, which also says how long the press took.
--
-- The three are what the page actually offers, and which of them a device can
-- reach is decided by the device: an ANDROID scan is shown the store button,
-- an IPHONE scan is shown the "not on iPhone yet" note with the "tell me when"
-- button in its place, and both are offered the link to the site. That is why
-- the panel reads the pair per platform rather than one download number: an
-- iPhone with no download is the page working as designed, not a card failing.
--
-- This table is OUTSIDE the three worlds (`users.env`): a visitor to a printed
-- URL has no account, no location and therefore no environment, so the panel's
-- environment switch deliberately does not move these numbers.
create table if not exists public.scan_devices (
  device_id     text        primary key,
  platform      text        not null check (platform in ('android', 'ios', 'desktop')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  hits          integer     not null default 1,
  -- The store button (Android / desktop).
  downloaded_at timestamptz,
  -- "Tell me when there is an iPhone version" — the store button's place on an
  -- iPhone, and the only thing an iPhone scan can press towards the app.
  notified_at   timestamptz,
  -- "More about Once" — the link out to the site's own landing page.
  more_at       timestamptz
);

create index if not exists scan_devices_platform_idx
  on public.scan_devices (platform);

-- Nobody reaches this table with a user's key. RLS on with NO policy at all is
-- the statement: only the service role (the site's own route handler and the
-- panel) may read or write it.
alter table public.scan_devices enable row level security;

-- One round trip for everything the page has to say: "a device is here", and
-- "that device pressed something". Insert, or touch the row it already has.
--
-- Two things are deliberately sticky. The PLATFORM is not overwritten — a phone
-- does not change its OS, and the first answer is the one taken at the moment
-- of the scan. And every press stamp is `coalesce(existing, new)`, so a second
-- press of the same button leaves the first one standing.
--
-- A press from a device whose 'open' never arrived still inserts a row, which
-- is right: it IS a device that was on the page.
create or replace function public.app_scan_seen(
  p_device   text,
  p_platform text,
  p_action   text default 'open'
)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.scan_devices (
    device_id, platform, hits, downloaded_at, notified_at, more_at
  )
  values (
    p_device,
    p_platform,
    1,
    case when p_action = 'download' then now() end,
    case when p_action = 'notify'   then now() end,
    case when p_action = 'more'     then now() end
  )
  on conflict (device_id) do update
     set last_seen_at   = now(),
         hits           = public.scan_devices.hits
                          + case when p_action = 'open' then 1 else 0 end,
         downloaded_at  = coalesce(public.scan_devices.downloaded_at, excluded.downloaded_at),
         notified_at    = coalesce(public.scan_devices.notified_at,   excluded.notified_at),
         more_at        = coalesce(public.scan_devices.more_at,       excluded.more_at);
$$;

-- The revoke takes EXECUTE away from PUBLIC, and the service role holds it
-- through PUBLIC like anybody else, so the grant is what leaves the site's own
-- route handler able to call this at all.
revoke execute on function public.app_scan_seen(text, text, text) from public, anon, authenticated;
grant execute on function public.app_scan_seen(text, text, text) to service_role;

-- The panel's block. A separate RPC from `admin_dashboard_metrics` because that
-- one is bounded by the environment switch and scoped to a manager's own users,
-- and neither of those questions applies to an anonymous visitor to a printed
-- address.
--
-- Every figure is a count of DEVICES, never of presses — "how many of the
-- people who scanned went on to press this" is the question the cards are
-- handed out to answer.
create or replace function public.admin_scan_metrics()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with per as (
    select
      platform,
      count(*)                                        as devices,
      count(*) filter (where downloaded_at is not null) as download,
      count(*) filter (where notified_at   is not null) as notify,
      count(*) filter (where more_at       is not null) as more,
      coalesce(sum(hits), 0)                          as hits
    from public.scan_devices
    group by platform
  ), one as (
    select jsonb_object_agg(
      platform,
      jsonb_build_object(
        'devices', devices, 'download', download,
        'notify', notify, 'more', more, 'hits', hits
      )
    ) as by_platform
    from per
  )
  select coalesce(
    jsonb_build_object(
      'android', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'ios',     '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'desktop', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb
    ) || coalesce(one.by_platform, '{}'::jsonb),
    '{}'::jsonb
  )
  from one;
$$;

revoke execute on function public.admin_scan_metrics() from public, anon, authenticated;
grant execute on function public.admin_scan_metrics() to service_role;
