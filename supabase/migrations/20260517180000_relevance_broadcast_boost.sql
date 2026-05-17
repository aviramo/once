-- relevance_broadcast: a constant ×2 boost for candidates who are currently
-- broadcasting (pressed "Show me to people" / app_add within the last 30 min,
-- i.e. relations.last_add_at is set and inside the broadcast/cooldown window).
--
-- Rationale: broadcasting is an explicit "I want to be seen now" signal, so a
-- broadcaster should rank near the top of every searcher's results. 2.0 matches
-- the codebase's existing "maximum boost" magnitude (schedule_overlap and
-- kids_preference_match both cap at 2.0). It is multiplicative, not an override:
-- a broadcaster who is otherwise a poor fit (wrong age band, far, stale) still
-- loses to a strong nearby active match. Default (not broadcasting) = 1.0.
--
-- The 30-minute window MUST stay in sync with the app_add cooldown check in
-- app_add / app_cancel_add / app_lock2 (interval '30 minutes'); the codebase
-- inlines this interval per-RPC rather than extracting it.
--
-- Adding relevance_broadcast to the RETURNS TABLE changes the function's
-- composite return type, so CREATE OR REPLACE is not enough -> DROP first.
-- Safe: the only callers (app_find, app_add) select named columns
-- (o.user_id / o.distance / o.relevance), never positionally and never the
-- per-factor columns, and Postgres does not track SQL-body function->function
-- dependencies, so dropping others() does not cascade into them.

DROP FUNCTION IF EXISTS public.others(public.users, boolean);

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance double precision)
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
    -- ×2 while broadcasting (last_add_at inside the 30-min app_add window), else 1.0.
    -- NULLIF(...,'')::timestamptz is NULL when last_add_at is absent/empty, and
    -- NULL > now()-interval falls through to the ELSE 1.0 default.
    (CASE
      WHEN NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) relevance_broadcast
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
      OR public.area_available(other.location::extensions.geography)
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
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast relevance
FROM relations
$function$;
