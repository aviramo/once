-- The counter learns WHERE the device came from.
--
-- `scan_devices` was built for the printed card: /scan reported a device and
-- the three things it could press. /scan is gone (the card's QR points at the
-- site now), but the same question is being asked of the home page — how many
-- unique devices opened it, and how many of them went on to press download, or
-- on an iPhone, "tell me when there is one".
--
-- So the table is not replaced, it is told apart. `source` is 'card' for every
-- row already in it (39 devices from the printed cards, 13-15 Aug) and 'site'
-- for the home page. The primary key moves to (device_id, source) because one
-- phone can legitimately be both: it scanned a card in the street and opened
-- the site a week later, and those are two funnels, not one visit counted
-- twice.
--
-- The names `scan_devices` / `app_scan_seen` / `admin_scan_metrics` stay as
-- they are. They are internal, they are called from a handful of places, and
-- renaming them buys a nicer word at the price of a rename nobody sees.

alter table public.scan_devices
  add column if not exists source text not null default 'card';

alter table public.scan_devices
  drop constraint if exists scan_devices_source_check;
alter table public.scan_devices
  add constraint scan_devices_source_check check (source in ('card', 'site'));

alter table public.scan_devices drop constraint scan_devices_pkey;
alter table public.scan_devices add constraint scan_devices_pkey primary key (device_id, source);

-- The writer. Dropped rather than replaced: adding a fourth defaulted argument
-- to a 3-argument function leaves BOTH signatures in place, and then a 3-arg
-- call is ambiguous and errors. Nothing calls it at this moment (the route it
-- served was deleted with /scan), so the drop is free.
drop function if exists public.app_scan_seen(text, text, text);

create or replace function public.app_scan_seen(
  p_device   text,
  p_platform text,
  p_action   text default 'open',
  p_source   text default 'card'
) returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.scan_devices (
    device_id, source, platform, hits, downloaded_at, notified_at, more_at
  )
  values (
    p_device,
    p_source,
    p_platform,
    1,
    case when p_action = 'download' then now() end,
    case when p_action = 'notify'   then now() end,
    case when p_action = 'more'     then now() end
  )
  on conflict (device_id, source) do update
     set last_seen_at   = now(),
         hits           = public.scan_devices.hits
                          + case when p_action = 'open' then 1 else 0 end,
         downloaded_at  = coalesce(public.scan_devices.downloaded_at, excluded.downloaded_at),
         notified_at    = coalesce(public.scan_devices.notified_at,   excluded.notified_at),
         more_at        = coalesce(public.scan_devices.more_at,       excluded.more_at);
$function$;

-- The reader. EXPANDED, not changed: the three platform keys stay exactly where
-- they were and keep meaning the CARD, so the panel that is live right now goes
-- on working until the next deploy. The site's funnel arrives beside them under
-- 'site', which the old panel simply does not read.
create or replace function public.admin_scan_metrics()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with per as (
    select
      source,
      platform,
      count(*)                                         as devices,
      count(*) filter (where downloaded_at is not null) as download,
      count(*) filter (where notified_at   is not null) as notify,
      count(*) filter (where more_at       is not null) as more,
      coalesce(sum(hits), 0)                           as hits
    from public.scan_devices
    group by source, platform
  ),
  shaped as (
    select
      source,
      jsonb_object_agg(
        platform,
        jsonb_build_object(
          'devices', devices, 'download', download,
          'notify', notify, 'more', more, 'hits', hits
        )
      ) as by_platform
    from per
    group by source
  ),
  base as (
    select jsonb_build_object(
      'android', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'ios',     '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb,
      'desktop', '{"devices":0,"download":0,"notify":0,"more":0,"hits":0}'::jsonb
    ) as b
  )
  select
    (select b from base)
    || coalesce((select by_platform from shaped where source = 'card'), '{}'::jsonb)
    || jsonb_build_object(
         'site',
         (select b from base)
         || coalesce((select by_platform from shaped where source = 'site'), '{}'::jsonb)
       );
$function$;

-- Postgres defaults go the unsafe way and PostgREST publishes every function it
-- can see, so both are stated explicitly.
revoke all on function public.app_scan_seen(text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_scan_seen(text, text, text, text) to service_role;
revoke all on function public.admin_scan_metrics() from public, anon, authenticated;
grant execute on function public.admin_scan_metrics() to service_role;
