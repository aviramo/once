-- THE ADMIN PANEL WORKS IN ONE MATCHING ENVIRONMENT AT A TIME.
--
-- `users.is_test` partitions the matching pool (one unconditional clause in
-- public.others(), the sole candidacy chokepoint) and `groups.is_test`
-- partitions the circles the same way. The two sides never meet, so a panel
-- that counts them together reports one number for two products.
--
-- The environment becomes a primary selector in the panel header, and these
-- three RPCs take it as a parameter instead of each deciding for itself:
--
--   * admin_dashboard_metrics HARD-CODED the answer — a `blocked` CTE of every
--     test user, excluded from all ~35 subqueries. That was "production only,
--     always", which is exactly p_is_test => false, so the default preserves
--     today's numbers byte for byte. Its `groups.total` was the one figure that
--     honoured no partition at all and now honours this one.
--   * admin_user_facet_counts counted BOTH sides together, and offered
--     `seg.test` / `seg.not_test` as two options inside the advanced-filters
--     dropdown. Those two are deleted: the switch IS that filter now, promoted
--     out of a dropdown, and a facet that can only ever equal the total or zero
--     is noise.
--   * admin_env_counts is new — the four nav badges (users / groups / pending
--     reports / pending bugs) in one round trip instead of four PostgREST
--     queries, because two of them cannot be expressed as a column filter.
--
-- The scoping rule, for the tables that carry no `is_test` of their own: a row
-- belongs to the environment of the USER it names. A report or bug whose
-- reporter no longer exists reads as PRODUCTION (`coalesce(..., false)`), so a
-- moderation queue can never hold something unreachable from both sides.

-- ── the nav badges ─────────────────────────────────────────────────────────
-- p_user_ids / p_group_ids carry the group-manager scope, which is a security
-- boundary and composes with the environment as an intersection: NULL means
-- "an admin, no restriction", an empty array means "a manager of nothing".
CREATE OR REPLACE FUNCTION public.admin_env_counts(
  p_is_test   boolean  DEFAULT false,
  p_user_ids  uuid[]   DEFAULT NULL,
  p_group_ids uuid[]   DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'users', (
      SELECT count(*) FROM public.users u
      WHERE u.is_test = p_is_test
        AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids))
    ),
    'groups', (
      SELECT count(*) FROM public.groups g
      WHERE g.is_test = p_is_test
        AND (p_group_ids IS NULL OR g.id = ANY(p_group_ids))
    ),
    'reports_pending', (
      SELECT count(*) FROM public.reports r
      WHERE r.handled = false
        AND coalesce((SELECT u.is_test FROM public.users u WHERE u.user_id = r.reporter_id), false) = p_is_test
    ),
    'bugs_pending', (
      SELECT count(*) FROM public.bug_reports b
      WHERE b.handled = false
        AND coalesce((SELECT u.is_test FROM public.users u WHERE u.user_id = b.reporter_id), false) = p_is_test
    )
  )
$function$;

REVOKE ALL ON FUNCTION public.admin_env_counts(boolean, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_env_counts(boolean, uuid[], uuid[]) TO service_role;

-- ── the facet counts ───────────────────────────────────────────────────────
-- Replaced rather than overloaded: a second arity would leave PostgREST with
-- two candidates for a no-argument call.
DROP FUNCTION IF EXISTS public.admin_user_facet_counts();

CREATE OR REPLACE FUNCTION public.admin_user_facet_counts(
  p_is_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test),
    'groups_none', (
      SELECT count(*) FROM public.users u
      WHERE u.is_test = p_is_test
        AND NOT EXISTS (SELECT 1 FROM public.user_groups ug WHERE ug.user_id = u.user_id)
    ),
    'groups', coalesce((
      SELECT jsonb_object_agg(group_id::text, c)
      FROM (
        SELECT ug.group_id, count(*) c
        FROM public.user_groups ug
        JOIN public.users u ON u.user_id = ug.user_id AND u.is_test = p_is_test
        GROUP BY ug.group_id
      ) q
    ), '{}'::jsonb),
    'avail', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'availability'->>'state' = 'available'),
      'unavailable', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'availability'->>'state' = 'unavailable'),
      'not_yet',     (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'availability'->>'state' = 'not_yet'),
      'unknown',     (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'availability'->>'state' IS NULL)
    ),
    'gender', jsonb_build_object(
      'male',   (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.is_male = true),
      'female', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.is_male = false)
    ),
    'os', jsonb_build_object(
      'ios',     (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.data->>'os' = 'ios'),
      'android', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.data->>'os' = 'android')
    ),
    'seg', jsonb_build_object(
      'online',       (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.last_seen >= now() - interval '5 minutes'),
      'active_today', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.last_seen >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'active_7d',    (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.last_seen >= now() - interval '7 days'),
      'active_30d',   (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.last_seen >= now() - interval '30 days'),
      'new_today',    (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.created_at >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'new_7d',       (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.created_at >= now() - interval '7 days'),
      'new_30d',      (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.created_at >= now() - interval '30 days'),
      'located',      (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.location IS NOT NULL),
      'broadcasting', (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND nullif(u.relations->>'last_add_at','')::timestamptz >= now() - interval '30 minutes'),
      'held',         (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'credits'->>'held' IS NOT NULL AND u.relations->'credits'->>'held' <> '0'),
      'extra',        (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND u.relations->'credits'->>'extra' ~ '^[0-9]+$' AND (u.relations->'credits'->>'extra')::int > 0),
      'no_notif',     (SELECT count(*) FROM public.users u WHERE u.is_test = p_is_test AND public.push_blocked(u.user_id))
    )
  )
$function$;

REVOKE ALL ON FUNCTION public.admin_user_facet_counts(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_facet_counts(boolean) TO service_role;

-- ── the dashboard ──────────────────────────────────────────────────────────
-- `blocked` (every test user, excluded) becomes `env` (the selected
-- environment's users, required). Same shape, one comparison flipped.
DROP FUNCTION IF EXISTS public.admin_dashboard_metrics(uuid[]);

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(
  p_user_ids uuid[]  DEFAULT NULL,
  p_is_test  boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH env AS (
    SELECT coalesce(array_agg(u.user_id), '{}'::uuid[]) AS ids
    FROM public.users u
    WHERE u.is_test = p_is_test
      AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids))
  )
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men',   (SELECT count(*) FROM public.users WHERE is_male = true  AND user_id = ANY(env.ids)),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false AND user_id = ANY(env.ids)),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL AND user_id = ANY(env.ids)),
      'os_ios',     (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'     AND user_id = ANY(env.ids)),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android' AND user_id = ANY(env.ids))
    ),
    'users', jsonb_build_object(
      'total',         (SELECT count(*) FROM public.users WHERE user_id = ANY(env.ids)),
      'new_today',     (SELECT count(*) FROM public.users WHERE (created_at at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND user_id = ANY(env.ids)),
      'new_7d',        (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'  AND user_id = ANY(env.ids)),
      'new_30d',       (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days' AND user_id = ANY(env.ids)),
      'online_5m',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes' AND user_id = ANY(env.ids)),
      'active_today',  (SELECT count(*) FROM public.users WHERE (last_seen at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND user_id = ANY(env.ids)),
      'active_7d',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'  AND user_id = ANY(env.ids)),
      'active_30d',    (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days' AND user_id = ANY(env.ids)),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL                   AND user_id = ANY(env.ids))
    ),
    -- Engagement is read off `watch` now, not off the two boards: one row per
    -- pair, so a chat is counted once from whichever end holds it and an
    -- invitation is counted where it was SENT. `pending` is the inbound side of
    -- that same invitation, which is why it counts distinct targets.
    'engagement', jsonb_build_object(
      'chat',         (SELECT count(*) FROM public.watch w WHERE w.state = 'chat'     AND w.watcher_id = ANY(env.ids)),
      'waiting',      (SELECT count(*) FROM public.watch w WHERE w.state = 'invited'  AND w.watcher_id = ANY(env.ids)),
      'watching',     (SELECT count(*) FROM public.watch w WHERE w.state = 'watching' AND w.watcher_id = ANY(env.ids)),
      'pending',      (SELECT count(DISTINCT w.target_id) FROM public.watch w WHERE w.state = 'invited' AND w.target_id = ANY(env.ids)),
      'broadcasting', (SELECT count(*) FROM public.users WHERE (relations->>'last_add_at') IS NOT NULL AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes' AND user_id = ANY(env.ids))
    ),
    'availability', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'   AND user_id = ANY(env.ids)),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable' AND user_id = ANY(env.ids)),
      'not_yet',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'     AND user_id = ANY(env.ids)),
      'unknown',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL          AND user_id = ANY(env.ids)),
      'no_notif',    (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id) AND u.user_id = ANY(env.ids))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$' AND user_id = ANY(env.ids)),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$' AND user_id = ANY(env.ids)),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$' AND user_id = ANY(env.ids)),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0
          AND user_id = ANY(env.ids))
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups g WHERE g.is_test = p_is_test)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days' AND user_id = ANY(env.ids)),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id = ANY(env.ids)),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days' AND user_id = ANY(env.ids)),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false AND user_id = ANY(env.ids)),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id = ANY(env.ids)),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days' AND user_id = ANY(env.ids))
    )
  )
  FROM env
$function$;

REVOKE ALL ON FUNCTION public.admin_dashboard_metrics(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(uuid[], boolean) TO service_role;
