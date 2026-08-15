-- One funnel. The card's devices join the home page's.
--
-- /scan is cancelled: the card's QR points at `/`, the page and its beacon are
-- deleted from the repo, and nothing will write a 'card' row again. Leaving the
-- 39 devices the printed cards brought in as a bucket of their own would leave
-- the panel showing a number that can never move, beside a number that can —
-- and they are the same question anyway: how many people reached us, and how
-- many of them went on to press something.
--
-- So the split introduced an hour ago is folded back: every row becomes 'site'.
-- The column stays, because the day a second entry point exists it is one
-- argument away, and because a check constraint naming both values is cheaper
-- than remembering why the distinction was dropped.
--
-- No row is deleted and no count is lost: first_seen_at, last_seen_at, hits and
-- the three press timestamps travel with the row exactly as they are.

-- There are no 'site' rows at this moment, so nothing can collide on the
-- (device_id, source) key — but the merge is written to survive one anyway: a
-- device that is somehow both keeps its earliest arrival, its latest visit, the
-- sum of its hits, and the first time it pressed each thing.
with merged as (
  select
    c.device_id,
    min(c.first_seen_at)  as first_seen_at,
    max(c.last_seen_at)   as last_seen_at,
    sum(c.hits)           as hits,
    min(c.downloaded_at)  as downloaded_at,
    min(c.notified_at)    as notified_at,
    min(c.more_at)        as more_at,
    (array_agg(c.platform order by c.last_seen_at desc))[1] as platform
  from public.scan_devices c
  where c.device_id in (
    select device_id from public.scan_devices where source = 'card'
  )
  group by c.device_id
)
update public.scan_devices s
   set first_seen_at = m.first_seen_at,
       last_seen_at  = m.last_seen_at,
       hits          = m.hits,
       downloaded_at = m.downloaded_at,
       notified_at   = m.notified_at,
       more_at       = m.more_at,
       platform      = m.platform
  from merged m
 where s.device_id = m.device_id
   and s.source    = 'site';

-- Whatever did not already exist under 'site' simply changes its label.
delete from public.scan_devices c
 where c.source = 'card'
   and exists (
     select 1 from public.scan_devices s
      where s.device_id = c.device_id and s.source = 'site'
   );

update public.scan_devices set source = 'site' where source = 'card';

-- A writer that does not state where it came from is the home page now. The
-- live /scan page is still deployed for the moment and calls this with three
-- arguments; until it goes, its hits land in the same funnel as everything
-- else, which is exactly what this migration is for.
create or replace function public.app_scan_seen(
  p_device   text,
  p_platform text,
  p_action   text default 'open',
  p_source   text default 'site'
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

revoke all on function public.app_scan_seen(text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_scan_seen(text, text, text, text) to service_role;
