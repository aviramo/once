-- Remove the geo-availability "areas" feature entirely (user decision 2026-07-05:
-- "רק... כל האזורים הגאוגרפיים יהיו זמינים" — every geographic location is
-- available; the areas gate is gone). The notification-presence (`push`) and
-- group-membership (`group`) gates are UNCHANGED — availability now composes
-- only those two. Location no longer gates anyone.
--
-- Steps (ordered so no live function references a dropped object at runtime):
--   1. user_availability — drop the geo/area_state branch (push + group only).
--   2. others()          — drop the area_available candidacy clause.
--   3. admin_dashboard_metrics (both overloads) — drop the `areas` block.
--   4. drop the geo helpers/table (area_available → area_state → view → table)
--      + the now-dead app_area_launch_sweep.
--   5. one-time app_area_resync() so any user currently gated by geo
--      (state 'unavailable'/'not_yet' with reason 'geo') flips to 'available'
--      immediately (unless still push/group blocked). No pushes fire from SQL.
--
-- app_area_resync / app_availability / _apply_availability are KEPT: they route
-- through user_availability and now simply propagate the push+group gate. The
-- `loc` param on user_availability is kept (unused) for signature/caller compat.

-- 1. user_availability: push + group gate only; every location is available.
CREATE OR REPLACE FUNCTION public.user_availability(uid uuid, loc geography)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'push')
    when public.group_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'group')
    else jsonb_build_object('state', 'available')
  end
$function$;

-- 2. others(): identical to live minus the `area_available(other.location)`
--    candidacy clause. Return shape unchanged → CREATE OR REPLACE (no drop).
CREATE OR REPLACE FUNCTION public.others(me public.users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance_group double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH relations AS (
  SELECT
    other.user_id,
    row_to_json(other) "user",
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int AS distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dist_meters,
    other.range AS other_range,
    1::double precision relevance_gender,
    1::double precision relevance_restriction,
    (CASE WHEN (me).age_from = (me).age_to
      THEN CASE WHEN EXTRACT(year FROM age(other.birth_date)) = (me).age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age(other.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    END)
    *
    (CASE WHEN other.age_from = other.age_to
      THEN CASE WHEN EXTRACT(year FROM age((me).birth_date)) = other.age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age((me).birth_date)) - (other.age_from + other.age_to) / 2.0) / ((other.age_to - other.age_from) / 2.0))
    END) relevance_age,
    GREATEST(0.0, 1 - (EXTRACT(epoch FROM (now() - other.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) relevance_time,
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(other.relations->'page2'->'profiles'), 0)) / 5.0) relevance_watchers,
    public.schedule_overlap((me).data, other.data) relevance_schedule,
    public.kids_preference_match((me).data, other.data) relevance_kids,
    (CASE
      WHEN NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) relevance_broadcast,
    (CASE
      WHEN public._shared_group_name((me).user_id, other.user_id) IS NOT NULL
      THEN 3.0 ELSE 1.0
    END) relevance_group
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND (
      LEAST((me).range, other.range) IS NULL
      OR (me).location IS NULL
      OR other.location IS NULL
      OR extensions.st_dwithin(
        (me).location::extensions.geography,
        other.location::extensions.geography,
        LEAST((me).range, other.range)
      )
    )
    AND (
      ((me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_male) OR
      ((me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_male) OR
      (NOT (me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_female) OR
      (NOT (me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_female)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.restrictions r
      WHERE ((r.user_id = (me).user_id AND r.other_id = other.user_id)
          OR (r.other_id = (me).user_id AND r.user_id = other.user_id))
        AND ((r.key IN ('ignore', 'cancel', 'remove') AND r.created_at > now() - interval '1 day')
          OR (r.key = 'decline' AND r.created_at > now() - interval '7 days')
          OR (r.key = 'leave'   AND r.created_at > now() - interval '14 days')
          OR r.key = 'block')
    )
    AND NOT (
      jsonb_typeof((me).data->'family'->'isForKids') = 'boolean'
      AND jsonb_typeof(other.data->'family'->'isForKids') = 'boolean'
      AND ((me).data->'family'->>'isForKids')::bool IS DISTINCT FROM (other.data->'family'->>'isForKids')::bool
    )
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND COALESCE(other.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending')
      )
    )
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR NOT public.group_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR (COALESCE((other.relations->'credits'->>'balance')::numeric, 0)
        + COALESCE((other.relations->'credits'->>'extra')::numeric,   0))
        >= public._credits_cost('approve')
    )
)
SELECT
  user_id,
  "user",
  distance,
  relevance_gender,
  relevance_restriction,
  relevance_age,
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END) relevance_location,
  relevance_time,
  relevance_watchers,
  relevance_schedule,
  relevance_kids,
  relevance_broadcast,
  relevance_group,
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast * relevance_group relevance
FROM relations
$function$;

-- 3a. admin_dashboard_metrics() — global; drop the `areas` block.
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men', (SELECT count(*) FROM public.users WHERE is_male = true),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL),
      'os_ios', (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android')
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.users),
      'new_today', (SELECT count(*) FROM public.users
        WHERE (created_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'new_7d', (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'),
      'new_30d', (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days'),
      'online_5m', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes'),
      'active_today', (SELECT count(*) FROM public.users
        WHERE (last_seen at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'active_7d', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'),
      'active_30d', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days'),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL)
    ),
    'engagement', jsonb_build_object(
      'chat', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'chat'),
      'waiting', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'waiting'),
      'watching', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'watching'),
      'pending', (SELECT count(*) FROM public.users WHERE relations->'page2'->>'state' = 'pending'),
      'broadcasting', (SELECT count(*) FROM public.users
        WHERE (relations->>'last_add_at') IS NOT NULL
          AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes')
    ),
    'availability', jsonb_build_object(
      'available', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable'),
      'not_yet', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'),
      'unknown', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL),
      'no_notif', (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$'),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0)
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days'),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days'),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days'),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days')
    )
  )
$function$;

-- 3b. admin_dashboard_metrics(uuid[]) — scoped; drop the `areas` block.
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men',   (SELECT count(*) FROM public.users WHERE is_male = true  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_ios',     (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'users', jsonb_build_object(
      'total',         (SELECT count(*) FROM public.users WHERE (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_today',     (SELECT count(*) FROM public.users WHERE (created_at at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_7d',        (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_30d',       (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'online_5m',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_today',  (SELECT count(*) FROM public.users WHERE (last_seen at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_7d',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_30d',    (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL                   AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'engagement', jsonb_build_object(
      'chat',         (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'chat'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'waiting',      (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'waiting'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'watching',     (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'watching' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'pending',      (SELECT count(*) FROM public.users WHERE relations->'page2'->>'state' = 'pending'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'broadcasting', (SELECT count(*) FROM public.users WHERE (relations->>'last_add_at') IS NOT NULL AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'availability', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'   AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'not_yet',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unknown',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'no_notif',    (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id) AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids)))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids) OR other_id = ANY(p_user_ids))),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    )
  )
$function$;

-- 4. Drop the geo helpers + table. Order matters for the two SQL functions
--    (area_available calls area_state); the table is last.
DROP FUNCTION IF EXISTS public.app_area_launch_sweep();
DROP FUNCTION IF EXISTS public.area_available(geography);
DROP FUNCTION IF EXISTS public.area_state(geography);
DROP VIEW IF EXISTS public.areas_list;
DROP TABLE IF EXISTS public.areas;

-- 5. One-time recompute so any user currently gated by geo flips to available
--    right now (subject to the surviving push/group gates). Off the user hot
--    path; ~dozens of rows. Returns notify entries which are ignored here.
SELECT public.app_area_resync();
