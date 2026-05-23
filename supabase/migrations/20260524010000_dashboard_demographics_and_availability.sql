-- Dashboard rework (2026-05-24):
--   * New `demographics` block: men / women / avg_age (whole years) / iOS / Android.
--     Drives the new first dashboard section ("פילוח משתמשים").
--   * `availability.no_notif` — users blocked by the notification-presence gate
--     (mirrors public.push_blocked(uid)). Tile in the Availability section,
--     deep-links to /admin/users?seg=no_notif.
--   * `funnel_7d.logouts` / `funnel_7d.deletes` — 7-day rolling counts of
--     successful logout/delete events from the log table. They tail the
--     acquisition→match→message funnel as a churn signal. No deep-link
--     (logged-out users still exist but aren't filterable by event; deleted
--     users are gone).
--
-- The previously surfaced active-users tiles (users.online_5m / active_today
-- / active_7d) are no longer rendered by the dashboard but stay in the RPC
-- output: they're cheap, and the recency segs (seg=active_today etc.) are
-- still reachable from the users-list filter, so keeping the keys avoids a
-- shape break for any caller that consumes them.
--
-- Additive / NOT breaking: admin/service-role only RPC, mobile never calls it.

create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'demographics', jsonb_build_object(
      'men', (select count(*) from public.users where is_male = true),
      'women', (select count(*) from public.users where is_male = false),
      'avg_age', (select coalesce(
        floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        from public.users where birth_date is not null),
      'os_ios', (select count(*) from public.users
        where data->>'os' = 'ios'),
      'os_android', (select count(*) from public.users
        where data->>'os' = 'android')
    ),
    'users', jsonb_build_object(
      'total', (select count(*) from public.users),
      'new_today', (select count(*) from public.users
        where (created_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'new_7d', (select count(*) from public.users
        where created_at > now() - interval '7 days'),
      'new_30d', (select count(*) from public.users
        where created_at > now() - interval '30 days'),
      'online_5m', (select count(*) from public.users
        where last_seen > now() - interval '5 minutes'),
      'active_today', (select count(*) from public.users
        where (last_seen at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'active_7d', (select count(*) from public.users
        where last_seen > now() - interval '7 days'),
      'active_30d', (select count(*) from public.users
        where last_seen > now() - interval '30 days'),
      'with_location', (select count(*) from public.users
        where location is not null)
    ),
    'engagement', jsonb_build_object(
      'chat', (select count(*) from public.users
        where relations->'page1'->>'state' = 'chat'),
      'waiting', (select count(*) from public.users
        where relations->'page1'->>'state' = 'waiting'),
      'watching', (select count(*) from public.users
        where relations->'page1'->>'state' = 'watching'),
      'pending', (select count(*) from public.users
        where relations->'page2'->>'state' = 'pending'),
      'broadcasting', (select count(*) from public.users
        where (relations->>'last_add_at') is not null
          and (relations->>'last_add_at')::timestamptz
              > now() - interval '30 minutes')
    ),
    'availability', jsonb_build_object(
      'available', (select count(*) from public.users
        where relations->'availability'->>'state' = 'available'),
      'unavailable', (select count(*) from public.users
        where relations->'availability'->>'state' = 'unavailable'),
      'not_yet', (select count(*) from public.users
        where relations->'availability'->>'state' = 'not_yet'),
      'unknown', (select count(*) from public.users
        where relations->'availability'->>'state' is null),
      'no_notif', (select count(*) from public.users u
        where public.push_blocked(u.user_id))
    ),
    'credits', jsonb_build_object(
      'balance_total', (select coalesce(sum(
          (relations->'credits'->>'balance')::int), 0)
        from public.users
        where relations->'credits'->>'balance' ~ '^[0-9]+$'),
      'held_total', (select coalesce(sum(
          (relations->'credits'->>'held')::int), 0)
        from public.users
        where relations->'credits'->>'held' ~ '^[0-9]+$'),
      'tier_free', (select count(*) from public.users
        where coalesce(relations->'credits'->>'tier', 'free') = 'free'),
      'tier_pro', (select count(*) from public.users
        where relations->'credits'->>'tier' = 'pro')
    ),
    'areas', jsonb_build_object(
      'total', (select count(*) from public.areas),
      'active', (select count(*) from public.areas where mode = 'active'),
      'scheduled', (select count(*) from public.areas
        where mode = 'scheduled'),
      'disabled', (select count(*) from public.areas
        where mode = 'disabled')
    ),
    'groups', jsonb_build_object(
      'total', (select count(*) from public.groups),
      'disabled', (select count(*) from public.groups
        where enabled = false),
      'gated_users', (select count(distinct ug.user_id)
        from public.user_groups ug
        join public.groups g on g.id = ug.group_id
        where g.enabled = false)
    ),
    'funnel_7d', jsonb_build_object(
      'signups', (select count(*) from public.users
        where created_at > now() - interval '7 days'),
      'invites', (select count(*) from public.log
        where key = 'invite' and status < 400
          and created_at > now() - interval '7 days'),
      'approves', (select count(*) from public.log
        where key = 'approve' and status < 400
          and created_at > now() - interval '7 days'),
      'messages', (select count(*) from public.chat
        where created_at > now() - interval '7 days'
          and coalesce(is_event, false) = false),
      'logouts', (select count(*) from public.log
        where key = 'logout' and status < 400
          and created_at > now() - interval '7 days'),
      'deletes', (select count(*) from public.log
        where key = 'delete' and status < 400
          and created_at > now() - interval '7 days')
    )
  )
$$;

revoke all on function public.admin_dashboard_metrics()
  from public, anon, authenticated;
