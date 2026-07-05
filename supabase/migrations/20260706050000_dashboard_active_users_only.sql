-- Dashboard KPIs count ACTIVE users only (user request 2026-07-05).
-- "Active" = NOT suspended. Suspension happens via groups: a user whose every
-- group is disabled is `group_blocked` (public.group_blocked). Such users are
-- excluded from every KPI counter on the admin home dashboard.
--
-- The suspended-id set is computed once in a CTE and threaded into every
-- per-user subquery as `user_id <> ALL(blocked.ids)` (correlated reference).
-- coalesce to an empty array so "nobody suspended" is a true no-op. Event-log
-- and chat funnel counters filter on the acting user_id / sender the same way,
-- so a suspended user's historical activity drops out too ("all KPI counters").
-- Admin/service-role only; response shape unchanged (additive filter). No
-- mobile/back-compat impact — admin-only RPC.
--
-- Also drops the stale zero-arg overload `admin_dashboard_metrics()` (an older
-- pre-scoping copy that never got the active-users filter). The only caller
-- (web/[lang]/page.tsx) always passes `p_user_ids`, so it resolves to the
-- uuid[] version; the dead overload only caused a "function is not unique"
-- ambiguity on a bare call. One source of truth now.
DROP FUNCTION IF EXISTS public.admin_dashboard_metrics();

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH blocked AS (
    SELECT coalesce(array_agg(u.user_id), '{}'::uuid[]) AS ids
    FROM public.users u
    WHERE public.group_blocked(u.user_id)
  )
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men',   (SELECT count(*) FROM public.users WHERE is_male = true  AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_ios',     (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'     AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'users', jsonb_build_object(
      'total',         (SELECT count(*) FROM public.users WHERE user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_today',     (SELECT count(*) FROM public.users WHERE (created_at at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_7d',        (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'  AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_30d',       (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'online_5m',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_today',  (SELECT count(*) FROM public.users WHERE (last_seen at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_7d',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'  AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_30d',    (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL                   AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'engagement', jsonb_build_object(
      'chat',         (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'chat'     AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'waiting',      (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'waiting'  AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'watching',     (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'watching' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'pending',      (SELECT count(*) FROM public.users WHERE relations->'page2'->>'state' = 'pending'  AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'broadcasting', (SELECT count(*) FROM public.users WHERE (relations->>'last_add_at') IS NOT NULL AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'availability', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'   AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'not_yet',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'     AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unknown',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL          AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'no_notif',    (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id) AND u.user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids)))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'
          AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$'
          AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0
          AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids) OR other_id = ANY(p_user_ids))),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id <> ALL(blocked.ids) AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    )
  )
  FROM blocked
$function$;
