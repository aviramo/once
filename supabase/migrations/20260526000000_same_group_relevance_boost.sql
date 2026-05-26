-- Same-group relevance boost + group_name on profile snapshot.
--
-- Two coupled changes:
--   1. others() gets a new factor relevance_group: x3 when the candidate
--      shares any group with `me`, else x1. Folded into the final relevance
--      product alongside age/location/time/watchers/schedule/kids/broadcast.
--      Multiplicative, not an override (matches the existing boost discipline:
--      a shared-group candidate who is otherwise a poor fit still loses to a
--      strong nearby active match).
--   2. make_profile() gets an optional `viewer_id` arg. When set, the snapshot
--      embeds `group_name` = the alphabetically first group shared between
--      viewer + subject (NULL when no shared group). The mobile main-photo
--      card renders a chip from this when present. Old callers passing the
--      2-arg form behave exactly as before (viewer_id defaults NULL ⇒ no
--      `group_name` key written ⇒ jsonb_strip_nulls drops it).
--
-- The shared-group lookup is extracted into one helper _shared_group_name so
-- the SAME predicate feeds both the relevance boost and the chip — they can
-- never drift (a candidate showing the chip but not getting the boost, or
-- vice versa).
--
-- _slim_viewer is an allowlist (user_id/title/name/is_male/last_seen/images),
-- so adding `group_name` to the make_profile output does NOT leak it onto
-- viewer-list entries — the chip is main-photo-only by construction.
--
-- All 6 make_profile call sites are updated to pass the right viewer_id where
-- the snapshot lives on a single-counterpart slot (page1.profile /
-- page2.profile). Viewer-list writes pass no viewer_id (slim strips it
-- anyway; staying explicit so the intent is obvious).

-- ── _shared_group_name(a, b) ────────────────────────────────────────────────
-- Returns the name of the alphabetically-first group shared between two users,
-- NULL when none. STABLE + SECURITY DEFINER (groups + user_groups have no
-- public RLS policies). Inlinable into the others() WHERE/SELECT and the
-- make_profile SELECT.

CREATE OR REPLACE FUNCTION public._shared_group_name(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT g.name
  FROM public.user_groups ug_a
  JOIN public.user_groups ug_b ON ug_b.group_id = ug_a.group_id
  JOIN public.groups g ON g.id = ug_a.group_id
  WHERE ug_a.user_id = p_a
    AND ug_b.user_id = p_b
  ORDER BY g.name
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public._shared_group_name(uuid, uuid) FROM anon, authenticated;

-- ── make_profile(u, dist_m, viewer_id?) ─────────────────────────────────────
-- Add the optional `viewer_id` arg + the `group_name` key. DEFAULT NULL keeps
-- the 2-arg signature working for any caller we don't update in this
-- migration; with no viewer the key is NULL ⇒ stripped by jsonb_strip_nulls
-- and the output is byte-identical to before. The composite return type is
-- unchanged (jsonb), so this is a safe CREATE OR REPLACE — no DROP needed.

CREATE OR REPLACE FUNCTION public.make_profile(u users, dist_m integer, viewer_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'user_id',     u.user_id,
    'title',       u.name || ', ' || extract(year from age(now(), u.birth_date::timestamp with time zone))::text,
    'name',        u.name,
    'images',      COALESCE(u.data->'images', '[]'::jsonb),
    'bio',         CASE WHEN length(trim(coalesce(u.data->>'bio',''))) > 0
                        THEN u.data->>'bio'
                        ELSE NULL END,
    'family',      CASE WHEN jsonb_typeof(u.data->'family') = 'object'
                        THEN u.data->'family'
                        ELSE NULL END,
    'is_male',     u.is_male,
    'last_seen',   u.last_seen,
    'distance',    dist_m,
    'location_custom', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          OR (u.data->>'location_custom')::boolean = true
        THEN true
        ELSE NULL END,
    'location_type', CASE
        WHEN (u.data->>'location_type') IN ('home','work')
          THEN u.data->>'location_type'
        WHEN (u.data->>'location_type') IS NULL
          AND (u.data->>'location_custom')::boolean = true
          THEN 'home'
        ELSE NULL END,
    'group_name',  CASE WHEN viewer_id IS NOT NULL
                        THEN public._shared_group_name(viewer_id, u.user_id)
                        ELSE NULL END
  ))
$$;

-- ── others(me, only_available): add relevance_group (x3 when shared) ───────
-- The composite return type changes (new column), so DROP first. Safe: the
-- only callers (app_find / app_add / app_seed_viewer) select named columns
-- (user_id / distance / relevance), never positionally and never the per-
-- factor columns, and Postgres does not track SQL-body function->function
-- dependencies, so dropping does not cascade into the callers.

DROP FUNCTION IF EXISTS public.others(public.users, boolean);

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
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
    -- x3 when (me) and `other` share any group, else x1. Same predicate as
    -- the make_profile group_name lookup -- one helper, never drift.
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
    -- group-membership gate REMOVED: groups are purely organisational now
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR COALESCE((other.relations->'credits'->>'balance')::numeric, 0) >= public._credits_cost('approve')
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

-- ── app_find: pass viewer_id where the snapshot lives on a 1-counterpart slot
-- (page1.profile + the lookahead JSON returned to me). Viewer-list write stays
-- 2-arg (slim strips group_name; no viewer_id keeps the intent obvious).

CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row         public.users;
  old_target     uuid;
  picked_id      uuid;
  picked_dist    int;
  picked_row     public.users;
  result_user    json;
  cur_state      text;
  cur_p2_state   text;
  cur_p2_inviter uuid;
  cand_ids       uuid[];
  cand_dists     int[];
  la_row         public.users;
  lookahead_json jsonb := '[]'::jsonb;
  i              int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  cur_p2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  SELECT array_agg(c.user_id ORDER BY c.rn), array_agg(c.distance ORDER BY c.rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
           OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
      AND (cur_p2_inviter IS NULL OR o.user_id <> cur_p2_inviter)
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' IN ('watching', 'waiting')
      )
  ) c
  WHERE c.rn <= 3;

  picked_id   := cand_ids[1];
  picked_dist := cand_dists[1];

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id, old_target, picked_id]
  ) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF COALESCE(me_row.relations->'page2'->>'state', 'free') = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = me_id;
    SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  END IF;

  cur_state := COALESCE(me_row.relations->'page1'->>'state', 'free');
  IF cur_state NOT IN ('free', 'locked', 'watching') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', '[]'::jsonb);
  END IF;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF old_target IS NOT NULL THEN
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF COALESCE(picked_row.relations->'page1'->>'state', 'free') = 'chat'
       OR COALESCE(picked_row.relations->'page2'->>'state', 'free') IN ('locked', 'pending') THEN
      picked_id := NULL;
    END IF;
  END IF;

  IF picked_id IS NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'free')
    ) WHERE user_id = me_id;
  ELSE
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object(
        'state', 'watching',
        'profile', public.make_profile(picked_row, picked_dist, me_id)
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public._slim_viewer(public.make_profile(me_row, picked_dist)))
    ) WHERE user_id = picked_id
      AND relations->'page2'->>'state' = 'free';
  END IF;

  IF cand_ids IS NOT NULL THEN
    FOR i IN 2..LEAST(3, array_length(cand_ids, 1)) LOOP
      IF cand_ids[i] IS NOT NULL AND cand_ids[i] IS DISTINCT FROM picked_id THEN
        SELECT * INTO la_row FROM public.users WHERE user_id = cand_ids[i];
        IF FOUND THEN
          lookahead_json := lookahead_json || jsonb_build_array(public.make_profile(la_row, cand_dists[i], me_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb, 'lookahead', lookahead_json);
END;
$function$;

-- ── app_add: pass viewer_id = cand_id where the snapshot is me's profile
-- written into cand_id's page1.profile slot.

CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  cand_ids   uuid[];
  cand_dists int[];
  cand_id    uuid;
  cand_dist  int;
  cand_row   public.users;
  notify_arr jsonb := '[]'::jsonb;
  result_user json;
  i          int;
  last_add   timestamptz;
  viewer_ids uuid[];
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;

  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

  viewer_ids := ARRAY(
    SELECT (p->>'user_id')::uuid
    FROM jsonb_array_elements(COALESCE(me_row.relations->'page2'->'profiles', '[]'::jsonb)) p
    WHERE p->>'user_id' IS NOT NULL
  );

  SELECT array_agg(o.user_id ORDER BY rn), array_agg(o.distance ORDER BY rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND NOT (o.user_id = ANY(viewer_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' = 'watching'
      )
  ) o
  WHERE rn <= 2;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id] || COALESCE(cand_ids, ARRAY[]::uuid[])
  ) x))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;
  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;
  IF public._credits_balance(me_row.relations) < public._credits_cost('broadcast') THEN
    RETURN jsonb_build_object('error', 'no_credits');
  END IF;

  UPDATE public.users
  SET relations = public._credits_charge(
        jsonb_set(
          jsonb_set(relations, '{last_add_at}', to_jsonb(now())),
          '{page2}',
          CASE
            WHEN relations->'page2'->>'state' = 'free' THEN relations->'page2'
            ELSE jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
          END
        ),
        public._credits_cost('broadcast'))
  WHERE user_id = me_id;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF cand_ids IS NULL OR array_length(cand_ids, 1) = 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
  END IF;

  FOR i IN 1..array_length(cand_ids, 1) LOOP
    cand_id   := cand_ids[i];
    cand_dist := cand_dists[i];
    SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
    IF COALESCE(cand_row.relations->'page1'->>'state', 'free') IN ('free', 'locked')
       AND COALESCE(cand_row.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending') THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1}',
        jsonb_build_object(
          'state', 'watching',
          'profile', public.make_profile(me_row, cand_dist, cand_id)
        )
      ) WHERE user_id = cand_id;

      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profiles}',
        COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public._slim_viewer(public.make_profile(cand_row, cand_dist)))
      ) WHERE user_id = me_id
        AND relations->'page2'->>'state' = 'free';

      notify_arr := notify_arr || jsonb_build_array(jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text));
    END IF;
  END LOOP;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$function$;

-- ── app_seed_viewer: pass viewer_id = cand_id for the snapshot of me written
-- into cand_id's page1.profile. The unwrapped-slim append into me's
-- page2.profiles[] stays 2-arg (no group_name on viewer entries).

CREATE OR REPLACE FUNCTION public.app_seed_viewer(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  cur_p1     uuid;
  cand_id    uuid;
  cand_dist  int;
  cand_row   public.users;
  notify_arr jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF COALESCE(me_row.relations->'availability'->>'state', 'available') <> 'available'
     OR COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free'
     OR COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  cur_p1 := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  SELECT o.user_id, o.distance
  INTO cand_id, cand_dist
  FROM public.others(me_row, true) o
  JOIN public.users w ON w.user_id = o.user_id
  WHERE o.relevance > 0
    AND COALESCE(w.relations->'page1'->>'state', 'free') IN ('free', 'locked')
    AND (cur_p1 IS NULL OR o.user_id <> cur_p1)
  ORDER BY o.relevance DESC
  LIMIT 1;

  IF cand_id IS NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, cand_id]) x))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  cur_p1 := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  IF COALESCE(me_row.relations->'availability'->>'state', 'available') <> 'available'
     OR COALESCE(me_row.relations->'page2'->>'state', 'free') <> 'free'
     OR COALESCE(jsonb_array_length(me_row.relations->'page2'->'profiles'), 0) > 0
     OR (cur_p1 IS NOT NULL AND cur_p1 = cand_id) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
  IF NOT FOUND OR COALESCE(cand_row.relations->'page1'->>'state', 'free') NOT IN ('free', 'locked') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'watching',
      'profile', public.make_profile(me_row, cand_dist, cand_id)
    )
  ) WHERE user_id = cand_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(cand_row, cand_dist))
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'free';

  notify_arr := jsonb_build_array(
    jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text)
  );

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$function$;

-- ── app_invite: each branch's snapshot goes into the OTHER side's slot, so
-- viewer_id is that other side.

CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  target_id  uuid;
  target_row public.users;
  invited_at timestamptz := now();
  expires_at timestamptz := now() + interval '10 minutes';
  dist_m     int;
  result_user json;
  notify     jsonb := '[]'::jsonb;
  kicked     uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'watching' THEN
    RETURN jsonb_build_object('error', 'not_watching');
  END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users
  WHERE user_id = me_id
     OR user_id = target_id
     OR relations->'page1'->'profile'->>'user_id' = target_id::text
     OR relations->'page1'->'profile'->>'user_id' = me_id::text
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  SELECT * INTO target_row FROM public.users WHERE user_id = target_id;

  IF me_row.relations->'page1'->>'state' <> 'watching'
     OR (me_row.relations->'page1'->'profile'->>'user_id')::uuid <> target_id
     OR COALESCE(target_row.relations->'page2'->>'state', 'free') NOT IN ('free') THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'invite')
    ) WHERE user_id = me_id;
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'invite-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR target_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, target_row.location::extensions.geography)::int END;

  IF target_row.relations->'page1'->>'state' = 'waiting'
     AND (target_row.relations->'page1'->'profile'->>'user_id')::uuid = me_id THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m, me_id) - 'distance')
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, target_id) - 'distance')
    ) WHERE user_id = target_id;

    FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, target_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'match'));
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'match'));

    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m, me_id),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object(
      'state', 'pending',
      'profile', public.make_profile(me_row, dist_m, target_id),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = target_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-invitee'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'invite-in'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- ── app_approve: my profile -> inviter's chat slot (viewer = inviter), and
-- inviter's profile -> my chat slot (viewer = me).

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
  v_approve_cost int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  inviter_id    := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  my_old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id IN (me_id, inviter_id)
     OR (my_old_target IS NOT NULL AND user_id = my_old_target)
     OR relations->'page1'->'profile'->>'user_id' IN (me_id::text, inviter_id::text)
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  v_approve_cost := CASE
    WHEN COALESCE(
           NULLIF(me_row.relations->>'last_add_at','')::timestamptz
             > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_balance(me_row.relations) < v_approve_cost THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'approve')
    ) WHERE user_id = me_id;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = inviter_id;

  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_profiles(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m, me_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_row.relations, v_approve_cost)->'credits'
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, inviter_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_ensure(relations)->'credits'
  ) WHERE user_id = inviter_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, inviter_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;
  FOR kicked IN SELECT * FROM public._kick_page1_at(inviter_id, me_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'match'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- ── app_refresh_snapshots: each loop writes a fresh snapshot into a known
-- owner's slot. viewer_id = owner of the slot being refreshed.

CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  other_row     public.users;
  state_b       text;
  message_b     text;
  new_dist      int;
  fresh_profile jsonb;
  target_id     uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Refresh me's snapshot inside every other user's page1.profile slot.
  -- Owner of the slot = other_row.user_id, subject = me_row -> viewer_id = other_row.user_id.
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b   := other_row.relations->'page1'->>'state';
    message_b := other_row.relations->'page1'->>'message';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist, other_row.user_id);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
    END IF;
    IF message_b IS NOT NULL THEN
      fresh_profile := fresh_profile - 'distance' - 'last_seen';
    END IF;
    UPDATE public.users
    SET relations = jsonb_set(relations, '{page1,profile}', fresh_profile)
    WHERE user_id = other_row.user_id;
  END LOOP;

  -- Refresh me's snapshot inside every other user's page2.profile slot.
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page2'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b   := other_row.relations->'page2'->>'state';
    message_b := other_row.relations->'page2'->>'message';
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public.make_profile(me_row, new_dist, other_row.user_id);
    IF state_b = 'chat' THEN
      fresh_profile := fresh_profile - 'distance';
    END IF;
    IF message_b IS NOT NULL THEN
      fresh_profile := fresh_profile - 'distance' - 'last_seen';
    END IF;
    UPDATE public.users
    SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
    WHERE user_id = other_row.user_id;
  END LOOP;

  -- Refresh me inside everyone else's page2.profiles[] -- slim, no viewer_id
  -- (slim strips group_name; no viewer_id keeps the intent obvious).
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page2'->>'state' = 'free'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
        WHERE e->>'user_id' = me_id::text
      )
  LOOP
    new_dist := CASE
      WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
      ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
    END;
    fresh_profile := public._slim_viewer(public.make_profile(me_row, new_dist));
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN e->>'user_id' = me_id::text THEN fresh_profile ELSE e END
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- Refresh MY page1.profile slot: subject = target, owner/viewer = me_id.
  IF me_row.relations->'page1' ? 'profile' THEN
    target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page1'->>'state';
    message_b := me_row.relations->'page1'->>'message';
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        fresh_profile := public.make_profile(other_row, new_dist, me_id);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
        END IF;
        IF message_b IS NOT NULL THEN
          fresh_profile := fresh_profile - 'distance' - 'last_seen';
        END IF;
        UPDATE public.users
        SET relations = jsonb_set(relations, '{page1,profile}', fresh_profile)
        WHERE user_id = me_id;
      END IF;
    END IF;
  END IF;

  -- Refresh MY page2.profile slot: subject = target, owner/viewer = me_id.
  IF me_row.relations->'page2' ? 'profile' THEN
    target_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page2'->>'state';
    message_b := me_row.relations->'page2'->>'message';
    IF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      IF FOUND THEN
        new_dist := CASE
          WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
          ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
        END;
        fresh_profile := public.make_profile(other_row, new_dist, me_id);
        IF state_b = 'chat' THEN
          fresh_profile := fresh_profile - 'distance';
        END IF;
        IF message_b IS NOT NULL THEN
          fresh_profile := fresh_profile - 'distance' - 'last_seen';
        END IF;
        UPDATE public.users
        SET relations = jsonb_set(relations, '{page2,profile}', fresh_profile)
        WHERE user_id = me_id;
      END IF;
    END IF;
  END IF;

  -- Refresh MY page2.profiles[] (others viewing me) -- slim, no viewer_id.
  IF me_row.relations->'page2' ? 'profiles'
     AND jsonb_array_length(me_row.relations->'page2'->'profiles') > 0 THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          COALESCE(
            (SELECT public._slim_viewer(public.make_profile(u, CASE
                WHEN me_row.location IS NULL OR u.location IS NULL THEN NULL
                ELSE extensions.st_distance(me_row.location::extensions.geography, u.location::extensions.geography)::int
              END))
             FROM public.users u WHERE u.user_id = (e->>'user_id')::uuid),
            public._slim_viewer(e)
          )
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = me_id;
  END IF;
END;
$function$;
