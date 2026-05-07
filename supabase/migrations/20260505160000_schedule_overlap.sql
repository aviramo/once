-- Schedule overlap multiplier for `others`. Two users with kids get a 0..1
-- multiplier based on the fraction of days both are kid-free, aligned by
-- each schedule's anchor (so phase-shifted schedules score against the real
-- calendar). When either user has !hasKids or no schedule, returns 1.
--
-- Performance: jsonb→bool[] expansion happens once per side, then a tight
-- integer loop over ≤84 days (LCM(weeks_a, weeks_b) * 7, weeks ≤ 4 each).
-- Marked STABLE PARALLEL SAFE.

CREATE OR REPLACE FUNCTION public.schedule_overlap(me_data jsonb, other_data jsonb)
RETURNS double precision
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  me_weeks     jsonb;
  other_weeks  jsonb;
  arr_a        bool[];  -- true = with kids on that day; flat, length wa*7
  arr_b        bool[];
  ca           int;     -- cycle_a (days)
  cb           int;     -- cycle_b (days)
  cycle        int;     -- LCM(ca, cb)
  default_anc  date := current_date - extract(dow from current_date)::int;
  anc_a        date := default_anc;
  anc_b        date := default_anc;
  shift_a      int;
  shift_b      int;
  i            int;
  both_free    int := 0;
BEGIN
  -- Both must have hasKids=true and a schedule.weeks array.
  IF NOT (
    jsonb_typeof(me_data->'family') = 'object'
    AND jsonb_typeof(other_data->'family') = 'object'
    AND COALESCE((me_data->'family'->>'hasKids')::bool, false)
    AND COALESCE((other_data->'family'->>'hasKids')::bool, false)
  ) THEN
    RETURN 1.0;
  END IF;

  me_weeks    := me_data->'family'->'schedule'->'weeks';
  other_weeks := other_data->'family'->'schedule'->'weeks';
  IF jsonb_typeof(me_weeks) IS DISTINCT FROM 'array'
     OR jsonb_typeof(other_weeks) IS DISTINCT FROM 'array'
     OR jsonb_array_length(me_weeks) = 0
     OR jsonb_array_length(other_weeks) = 0
  THEN
    RETURN 1.0;
  END IF;

  -- Flatten weeks → bool[] of length wa*7 (and wb*7).
  SELECT array_agg(COALESCE((w.week->>d_idx)::bool, false) ORDER BY w.ord, d_idx)
    INTO arr_a
  FROM jsonb_array_elements(me_weeks) WITH ORDINALITY w(week, ord)
  CROSS JOIN generate_series(0, 6) d_idx;

  SELECT array_agg(COALESCE((w.week->>d_idx)::bool, false) ORDER BY w.ord, d_idx)
    INTO arr_b
  FROM jsonb_array_elements(other_weeks) WITH ORDINALITY w(week, ord)
  CROSS JOIN generate_series(0, 6) d_idx;

  ca := array_length(arr_a, 1);
  cb := array_length(arr_b, 1);
  cycle := ca * cb / gcd(ca, cb);

  -- Anchor: ISO date of the Sunday of week 0. Default = Sunday of current
  -- week. Malformed values fall back to the default rather than erroring.
  BEGIN
    anc_a := COALESCE((me_data->'family'->'schedule'->>'anchor')::date, default_anc);
  EXCEPTION WHEN OTHERS THEN anc_a := default_anc;
  END;
  BEGIN
    anc_b := COALESCE((other_data->'family'->'schedule'->>'anchor')::date, default_anc);
  EXCEPTION WHEN OTHERS THEN anc_b := default_anc;
  END;

  shift_a := (((current_date - anc_a) % ca) + ca) % ca;
  shift_b := (((current_date - anc_b) % cb) + cb) % cb;

  FOR i IN 0..cycle - 1 LOOP
    IF NOT arr_a[((shift_a + i) % ca) + 1]
       AND NOT arr_b[((shift_b + i) % cb) + 1]
    THEN
      both_free := both_free + 1;
    END IF;
  END LOOP;

  RETURN both_free::double precision / cycle::double precision;
END;
$$;

-- Add relevance_schedule to `others` and fold it into the final relevance.
-- Return type changes (extra column), so drop the old function first.
DROP FUNCTION IF EXISTS public.others(users, boolean);

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance double precision)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
WITH relations AS (
  SELECT
    other.user_id,
    row_to_json(other) "user",
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int AS distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dist_meters,
    other.range AS other_range,
    CASE WHEN
      ((me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_male) OR
      ((me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_male) OR
      (NOT (me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_female) OR
      (NOT (me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_female)
      THEN 1 ELSE 0 END relevance_gender,
    CASE WHEN rest.user_id IS NULL THEN 1 ELSE 0 END relevance_restriction,
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
    public.schedule_overlap((me).data, other.data) relevance_schedule
  FROM public.users other
  LEFT JOIN (
    SELECT user_id, other_id FROM public.restrictions
    WHERE (key IN ('ignore', 'cancel', 'remove') AND created_at > now() - interval '1 day')
       OR (key = 'decline' AND created_at > now() - interval '7 days')
       OR (key = 'leave'   AND created_at > now() - interval '14 days')
       OR key = 'block'
    GROUP BY user_id, other_id
  ) rest ON (rest.user_id = (me).user_id AND rest.other_id = other.user_id)
         OR (rest.other_id = (me).user_id AND rest.user_id = other.user_id)
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND COALESCE(other.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending')
      )
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
  relevance_gender * relevance_restriction * relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule relevance
FROM relations
$$;
