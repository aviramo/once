-- admin_user_facet_counts: add avail / tier / seg facet counts so EVERY
-- filter dropdown (not just p1/p2/groups) shows a global "(n)" per option.
-- Global counts (no cross-filter), same pattern as the existing p1/p2/groups
-- blocks. The seg time windows mirror web/.../users/page.tsx applySecondary()
-- 1:1 so the badge equals the rows the filter actually returns:
--   today boundary = 00:00 Asia/Jerusalem (same tz the credits grant uses);
--   online=5m, 7d, 30d, broadcast=30m windows; tier 'free' folds null;
--   avail 'unknown' = state null; role_gated = holds >=1 disabled group.
create or replace function public.admin_user_facet_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.users),
    'groups_none', (
      select count(*) from public.users u
      where not exists (
        select 1 from public.user_groups ug where ug.user_id = u.user_id
      )
    ),
    'p1', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page1'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page1'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'p2', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page2'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page2'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'groups', coalesce((
      select jsonb_object_agg(group_id::text, c)
      from (
        select ug.group_id, count(*) c
        from public.user_groups ug
        group by ug.group_id
      ) q
    ), '{}'::jsonb),
    'avail', jsonb_build_object(
      'available',   (select count(*) from public.users u where u.relations->'availability'->>'state' = 'available'),
      'unavailable', (select count(*) from public.users u where u.relations->'availability'->>'state' = 'unavailable'),
      'not_yet',     (select count(*) from public.users u where u.relations->'availability'->>'state' = 'not_yet'),
      'unknown',     (select count(*) from public.users u where u.relations->'availability'->>'state' is null)
    ),
    'tier', jsonb_build_object(
      'free', (select count(*) from public.users u where coalesce(u.relations->'credits'->>'tier','free') = 'free'),
      'pro',  (select count(*) from public.users u where u.relations->'credits'->>'tier' = 'pro')
    ),
    'seg', jsonb_build_object(
      'online',       (select count(*) from public.users u where u.last_seen >= now() - interval '5 minutes'),
      'active_today', (select count(*) from public.users u where u.last_seen >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'active_7d',    (select count(*) from public.users u where u.last_seen >= now() - interval '7 days'),
      'active_30d',   (select count(*) from public.users u where u.last_seen >= now() - interval '30 days'),
      'new_today',    (select count(*) from public.users u where u.created_at >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'new_7d',       (select count(*) from public.users u where u.created_at >= now() - interval '7 days'),
      'new_30d',      (select count(*) from public.users u where u.created_at >= now() - interval '30 days'),
      'located',      (select count(*) from public.users u where u.location is not null),
      'broadcasting', (select count(*) from public.users u where nullif(u.relations->>'last_add_at','')::timestamptz >= now() - interval '30 minutes'),
      'held',         (select count(*) from public.users u where u.relations->'credits'->>'held' is not null and u.relations->'credits'->>'held' <> '0'),
      'role_gated',   (select count(distinct ug.user_id) from public.user_groups ug join public.groups g on g.id = ug.group_id where g.enabled = false)
    )
  )
$$;

revoke all on function public.admin_user_facet_counts() from public, anon, authenticated;
