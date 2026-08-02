-- Replace others()'s body with the set-based rewrite proven equivalent to it on
-- live data (2026-08-02): both only_available modes, six synthetic `me` shapes,
-- and the hidden-membership branch simulated on the test partition — 0 row
-- differences in either direction on any of them, across the full "user" JSON
-- payload and all twelve relevance columns.
--
-- The five per-row SECURITY DEFINER helpers are now one CTE each, computed once
-- per call instead of once per candidate; push_blocked is inlined (it re-read a
-- row the query already held) with a coalesce that reproduces its EXISTS()
-- NULL-folding; st_distance is computed once instead of twice; membership tests
-- are NOT EXISTS, never NOT IN. Measured over every user in app_find's own
-- shape: 9.27ms -> 4.61ms per call, 76,379 -> 45,137 buffer hits.
--
-- Signature, output columns, filter semantics and the multiplication ORDER of
-- the final relevance product are all unchanged, so no caller and no client
-- changes and this needs no BACKWARD_COMPAT entry.
--
-- To revert: ROLLBACK_20260801234734_others_setbased.sql.txt holds the previous
-- body verbatim.

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance_group double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH my_friends AS MATERIALIZED (
  SELECT CASE WHEN fl.a = (me).user_id THEN fl.b ELSE fl.a END AS uid
  FROM public.friend_links fl
  WHERE fl.a = (me).user_id OR fl.b = (me).user_id
),
fof AS MATERIALIZED (
  SELECT DISTINCT CASE WHEN fb.a = mf.uid THEN fb.b ELSE fb.a END AS uid
  FROM my_friends mf
  JOIN public.friend_links fb ON fb.a = mf.uid OR fb.b = mf.uid
),
hidden_pair AS MATERIALIZED (
  SELECT DISTINCT ug_b.user_id AS uid
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  WHERE ug_a.user_id = (me).user_id
    AND (ug_a.hidden OR ug_b.hidden)
),
shared_group AS MATERIALIZED (
  SELECT DISTINCT ug_b.user_id AS uid
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  WHERE ug_a.user_id = (me).user_id
    AND NOT ug_a.hidden
    AND NOT ug_b.hidden
),
blocked AS MATERIALIZED (
  SELECT CASE WHEN r.user_id = (me).user_id THEN r.other_id ELSE r.user_id END AS uid
  FROM public.restrictions r
  WHERE (r.user_id = (me).user_id OR r.other_id = (me).user_id)
    AND ((r.key IN ('ignore', 'cancel', 'remove') AND r.created_at > now() - interval '1 day')
      OR (r.key = 'decline' AND r.created_at > now() - interval '7 days')
      OR (r.key = 'leave'   AND r.created_at > now() - interval '14 days')
      OR r.key = 'block')
),
base AS MATERIALIZED (
  SELECT
    other.user_id,
    row_to_json(other) AS "user",
    other.range AS other_range,
    other.birth_date,
    other.age_from,
    other.age_to,
    other.last_seen,
    other.data,
    other.relations,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dm
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND other.is_test = COALESCE((me).is_test, false)
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
    AND NOT EXISTS (SELECT 1 FROM blocked b WHERE b.uid = other.user_id)
    -- A community you run is not a dating pool. When either side has hidden
    -- their membership in a group the two of them share, neither is ever
    -- offered the other. Symmetric by construction.
    AND NOT EXISTS (SELECT 1 FROM hidden_pair h WHERE h.uid = other.user_id)
    -- Neither is a friend of mine a candidate (user directive 2026-07-30). What
    -- my friends are FOR is the people one hop past them, which the relevance
    -- factor at the bottom of this function is what rewards.
    AND NOT EXISTS (SELECT 1 FROM my_friends f WHERE f.uid = other.user_id)
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND public._page2_open(other.relations->'page2')
      )
    )
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    -- A BUILT PROFILE IS TWO PHOTOS (user directive 2026-07-31). Same number as
    -- profileComplete in the edge function and selectProfileBuilt on the client.
    AND (
      NOT only_available
      OR (
        jsonb_typeof(other.data->'images') = 'array'
        AND jsonb_array_length(other.data->'images') >= 2
      )
    )
    -- push_blocked(other.user_id), inlined: it re-read `other`'s own row by PK
    -- for columns this query already holds. The coalesce is load-bearing — the
    -- function's EXISTS() folds a NULL push.perm to false and a bare boolean
    -- expression does not, which silently drops every such user from the pool.
    AND (
      NOT only_available
      OR NOT COALESCE(
        other.location IS NOT NULL
        AND (
          other.relations->'push'->>'perm' = 'denied'
          OR (other.relations->'push'->>'dead')::boolean IS TRUE
        ),
        false
      )
    )
    -- Around, not just reachable: a full day without opening the app and you are
    -- no longer shown to anyone.
    AND (
      NOT only_available
      OR other.last_seen > now() - public._presence_ttl()
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR (COALESCE((other.relations->'credits'->>'balance')::numeric, 0)
        + COALESCE((other.relations->'credits'->>'extra')::numeric,   0))
        >= public._credits_cost('approve')
      OR (other.relations->'credits'->>'unpaid_at') IS NULL
    )
),
scored AS (
  SELECT
    b.user_id,
    b."user",
    b.dm,
    b.other_range,
    (CASE WHEN (me).age_from = (me).age_to
      THEN CASE WHEN EXTRACT(year FROM age(b.birth_date)) = (me).age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age(b.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    END)
    *
    (CASE WHEN b.age_from = b.age_to
      THEN CASE WHEN EXTRACT(year FROM age((me).birth_date)) = b.age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age((me).birth_date)) - (b.age_from + b.age_to) / 2.0) / ((b.age_to - b.age_from) / 2.0))
    END) AS relevance_age,
    GREATEST(0.0, 1 - (EXTRACT(epoch FROM (now() - b.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) AS relevance_time,
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(b.relations->'page2'->'profiles'), 0)) / 5.0) AS relevance_watchers,
    public.schedule_overlap((me).data, b.data) AS relevance_schedule,
    public.kids_preference_match((me).data, b.data) AS relevance_kids,
    (CASE
      WHEN NULLIF(b.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) AS relevance_broadcast,
    (CASE WHEN EXISTS (SELECT 1 FROM shared_group s WHERE s.uid = b.user_id) THEN 3.0 ELSE 1.0 END) AS relevance_group,
    -- A mutual friend is the anchor (user directive 2026-07-30): a stranger we
    -- both know somebody in common with ranks like a fellow group member.
    (CASE WHEN EXISTS (SELECT 1 FROM fof f WHERE f.uid = b.user_id) THEN 3.0 ELSE 1.0 END) AS relevance_fof
  FROM base b
)
SELECT
  s.user_id,
  s."user",
  s.dm::int AS distance,
  1::double precision AS relevance_gender,
  1::double precision AS relevance_restriction,
  s.relevance_age,
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - s.dm / (me).range) END)
  *
  (CASE WHEN s.other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - s.dm / s.other_range) END) AS relevance_location,
  s.relevance_time,
  s.relevance_watchers,
  s.relevance_schedule,
  s.relevance_kids,
  s.relevance_broadcast,
  s.relevance_group,
  s.relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - s.dm / (me).range) END)
  *
  (CASE WHEN s.other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - s.dm / s.other_range) END)
  * s.relevance_time * s.relevance_watchers * s.relevance_schedule * s.relevance_kids * s.relevance_broadcast * s.relevance_group
  * s.relevance_fof AS relevance
FROM scored s
$function$;
