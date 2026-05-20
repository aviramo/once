-- Product + business KPI snapshot for the web-admin dashboard (the new
-- /admin home screen). One round trip returns every headline number the
-- managers/board care about: base size & growth, engagement (live game
-- states), availability health (geo/role gate), the credits economy, the
-- areas/roles catalogs, and a 7-day acquisition→match→message funnel.
--
-- Global + point-in-time on purpose (not contextual to any filter): a
-- stable, predictable read of the whole base. Admin-only: SECURITY DEFINER
-- + EXECUTE revoked from anon/authenticated (called via the service role
-- from the dashboard, same pattern as admin_user_facet_counts /
-- app_admin_reset). "today" is Asia/Jerusalem (the product's home tz, same
-- boundary the credits grant uses) so the daily numbers match what the
-- team sees on the clock.
create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
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
        where relations->'availability'->>'state' is null)
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
    'roles', jsonb_build_object(
      'total', (select count(*) from public.roles),
      'disabled', (select count(*) from public.roles
        where enabled = false),
      'gated_users', (select count(distinct ur.user_id)
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where r.enabled = false)
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
          and coalesce(is_event, false) = false)
    )
  )
$$;

revoke all on function public.admin_dashboard_metrics()
  from public, anon, authenticated;
