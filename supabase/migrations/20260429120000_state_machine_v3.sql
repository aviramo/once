-- State machine v3: full rewrite per CLAUDE.md "Proposed state machine v2".
-- - relations.page1.state ∈ {free, watching, waiting, chat, locked}
-- - relations.page2.state ∈ {free, pending, chat, locked}
-- - `event` field removed; replaced by optional `message` (set only on writes
--   that need UI feedback for the affected user — see CLAUDE.md table).
-- - page2 is always an object now: {state, profile?, profiles?, message?, ...}.
-- - Findability: page1.state ≠ chat AND page2.state ∉ {locked, pending}.
-- - New endpoints: app_free2 (page2.state: locked → free).
-- - clear1/clear2 semantics changed: clear `message` only, state stays locked.
-- - app_ok dropped (replaced by clear1).

-- ── Drop deprecated RPC ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.app_ok(uuid);

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Strips fields that don't belong inside a Profile sub-object.
-- (state/message/invited_at/expires_at/extended are page-level; distance,
-- last_seen, push_enabled are volatile and managed by app_refresh_snapshots.)
CREATE OR REPLACE FUNCTION public._profile_clean(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT p
       - 'state' - 'message' - 'event'
       - 'invited_at' - 'expires_at' - 'extended'
       - 'distance' - 'last_seen' - 'push_enabled'
$$;

-- Builds page2 = {state: 'locked', profile?, message?}.
CREATE OR REPLACE FUNCTION public._page2_locked(profile jsonb, msg text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'state', 'locked',
    'profile', public._profile_clean(profile),
    'message', msg
  ))
$$;

-- Builds page2 = {state: 'free', profiles: <existing array or []>}.
CREATE OR REPLACE FUNCTION public._page2_free(existing_profiles jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'state', 'free',
    'profiles', COALESCE(existing_profiles, '[]'::jsonb)
  )
$$;

-- Builds page1 = {state: 'locked', profile?, message?}.
CREATE OR REPLACE FUNCTION public._page1_locked(profile jsonb, msg text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'state', 'locked',
    'profile', public._profile_clean(profile),
    'message', msg
  ))
$$;

-- Removes a user from another user's page2.profiles array (preserving
-- page2.state and other fields). No-op if page2 isn't free or has no array.
CREATE OR REPLACE FUNCTION public._remove_from_profiles(owner_id uuid, user_to_remove uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.users
  SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v)
       FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> user_to_remove::text),
      '[]'::jsonb
    )
  )
  WHERE user_id = owner_id
    AND relations->'page2'->>'state' = 'free';
$$;

-- For every user X (excluding `exclude_id`) whose page1.profile.user_id =
-- target_id and whose page1.state is not already 'locked', set X.page1 =
-- locked + msg. Includes chat-state pointers (so logout/match correctly
-- breaks any concurrent chat). Returns kicked user_ids.
CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.users u
  SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', msg)
  )
  WHERE relations->'page1'->'profile'->>'user_id' = target_id::text
    AND COALESCE(relations->'page1'->>'state', '') <> 'locked'
    AND (exclude_id IS NULL OR u.user_id <> exclude_id)
  RETURNING u.user_id;
END;
$$;

-- For every user X (excluding `exclude_id`) whose page2.state = 'pending'
-- and page2.profile.user_id = target_id, set X.page2 = locked + msg.
CREATE OR REPLACE FUNCTION public._kick_page2_pending_at(target_id uuid, exclude_id uuid, msg text)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.users u
  SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_locked(relations->'page2'->'profile', msg)
  )
  WHERE relations->'page2'->>'state' = 'pending'
    AND relations->'page2'->'profile'->>'user_id' = target_id::text
    AND (exclude_id IS NULL OR u.user_id <> exclude_id)
  RETURNING u.user_id;
END;
$$;

-- ── Backfill existing rows to v3 shape ─────────────────────────────────────
UPDATE public.users SET relations = jsonb_build_object(
  'page1', CASE
    WHEN relations->'page1'->>'state' IN ('watching', 'waiting', 'chat') THEN
      (relations->'page1') - 'event'
    WHEN relations->'page1'->>'state' IN ('missed', 'fail') THEN
      public._page1_locked(relations->'page1'->'profile', relations->'page1'->>'event')
    ELSE
      jsonb_build_object('state', 'free')
  END,
  'page2', CASE
    WHEN jsonb_typeof(relations->'page2') = 'array' THEN
      public._page2_free(relations->'page2')
    WHEN relations->'page2'->>'state' = 'pending' THEN
      jsonb_strip_nulls(jsonb_build_object(
        'state', 'pending',
        'profile', public._profile_clean(relations->'page2'),
        'invited_at', relations->'page2'->>'invited_at',
        'expires_at', relations->'page2'->>'expires_at',
        'extended', (relations->'page2'->>'extended')::boolean
      ))
    WHEN relations->'page2'->>'state' IN ('missed', 'fail', 'cancelled', 'expired') THEN
      public._page2_locked(relations->'page2', relations->'page2'->>'event')
    ELSE
      public._page2_free('[]'::jsonb)
  END
);

-- Drop legacy helpers (replaced by versions above).
DROP FUNCTION IF EXISTS public._kick_pointing_at(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public._remove_from_page2(uuid, uuid);
DROP FUNCTION IF EXISTS public._strip_volatile(jsonb);

-- ── others (findability) ───────────────────────────────────────────────────
-- Watcher count now reads page2.profiles array. Findability filter when
-- only_available=true: page1.state ≠ chat AND page2.state ∉ {locked, pending}.
CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance double precision)
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
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(other.relations->'page2'->'profiles'), 0)) / 5.0) relevance_watchers
  FROM public.users other
  LEFT JOIN (
    SELECT user_id, other_id FROM public.restrictions
    WHERE (key IN ('ignore', 'decline', 'cancel', 'leave', 'remove') AND created_at > now() - interval '1 day')
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
  relevance_gender * relevance_restriction * relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers relevance
FROM relations
$$;

-- ── app_find ───────────────────────────────────────────────────────────────
-- Precondition: A.page1.state ∈ {free, locked} (i.e., not actively engaged).
-- Result: free (no candidate) or watching+profile (candidate found).
-- Side effects: removes A from old target's page2.profiles; adds A to new
-- target's page2.profiles (only if new target's page2.state = 'free').
DROP FUNCTION IF EXISTS public.app_find(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT true, event_key text DEFAULT 'find')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row      public.users;
  old_target  uuid;
  picked_id   uuid;
  picked_dist int;
  picked_row  public.users;
  result_user json;
  cur_state   text;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  -- Pick best candidate. Excludes current watch target and users already
  -- watching me (to avoid mirror pairs).
  SELECT o.user_id, o.distance INTO picked_id, picked_dist
  FROM public.others(me_row, true) o
  WHERE o.relevance > 0
    AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
         OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
    AND NOT EXISTS (
      SELECT 1 FROM public.users w
      WHERE w.user_id = o.user_id
        AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
        AND w.relations->'page1'->>'state' = 'watching'
    )
  ORDER BY o.relevance DESC
  LIMIT 1;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, old_target, picked_id]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  cur_state  := COALESCE(me_row.relations->'page1'->>'state', 'free');

  -- Only proceed from free or locked state.
  IF cur_state NOT IN ('free', 'locked') THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- Detach from old watch target.
  IF old_target IS NOT NULL AND cur_state = 'free' THEN
    -- Only if we were actually watching (cur_state was 'watching' before this
    -- branch). After backfill, 'free' has no profile, so this is a no-op for
    -- the typical free→watching transition. Keep for defensive cleanup.
    PERFORM public._remove_from_profiles(old_target, me_id);
  END IF;

  -- Re-validate picked target after locks.
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
        'profile', public.make_profile(picked_row, picked_dist)
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(me_row, picked_dist))
    ) WHERE user_id = picked_id
      AND relations->'page2'->>'state' = 'free';
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_ignore ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_ignore(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row    public.users;
  target_id uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NOT NULL THEN
    PERFORM public._add_restriction(me_id, target_id, 'ignore');
  END IF;
  RETURN public.app_find(me_id, true, 'ignore');
END;
$$;

-- ── app_invite ─────────────────────────────────────────────────────────────
-- Precondition: A.page1.state = 'watching', target B's page2.state = 'free'.
-- Success: A.page1 = waiting + profile + invited_at + expires_at;
--          A.page2 = locked (no message);
--          B.page2 = pending + A's profile + invited_at + expires_at;
--          every C with C.page1.profile = B (excluding A): C.page1 = locked + message=invite.
-- Mutual (B was waiting on A): both → chat; both page2 → locked; kick all C
-- pointing at A or B.
-- Fail (B not free anymore): A.page1 = locked + message=invite.
CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  target_id  uuid;
  target_row public.users;
  invited_at timestamptz := now();
  expires_at timestamptz := now() + interval '1 hour';
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

  -- Re-validate.
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

  -- Mutual: B was already waiting on A.
  IF target_row.relations->'page1'->>'state' = 'waiting'
     AND (target_row.relations->'page1'->'profile'->>'user_id')::uuid = me_id THEN

    UPDATE public.users SET relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ) WHERE user_id = target_id;

    -- Kick all third parties whose page1 points at A or B.
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

  -- Standard invite.
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    ),
    'page2', public._page2_locked(NULL, NULL)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object(
      'state', 'pending',
      'profile', public.make_profile(me_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = target_id;

  -- Kick B's other watchers.
  FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-invitee'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'invite-in'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;

-- ── app_extend ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_extend(me_id uuid, add_minutes int)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row      public.users;
  target_id   uuid;
  new_expires timestamptz;
  result_user json;
BEGIN
  IF add_minutes NOT IN (10, 30, 60, 120, 240, 480, 1440) THEN
    RETURN jsonb_build_object('error', 'bad_minutes');
  END IF;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, target_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' <> 'waiting' THEN
    RETURN jsonb_build_object('error', 'not_waiting');
  END IF;

  -- Already extended: no-op.
  IF COALESCE((me_row.relations->'page1'->>'extended')::boolean, false) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- Expired: lock with message.
  IF (me_row.relations->'page1'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'extend')
    ) WHERE user_id = me_id;
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  new_expires := (me_row.relations->'page1'->>'expires_at')::timestamptz + (add_minutes || ' minutes')::interval;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    relations->'page1' || jsonb_build_object('expires_at', new_expires, 'extended', true)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    relations->'page2' || jsonb_build_object('expires_at', new_expires, 'extended', true)
  ) WHERE user_id = target_id
    AND relations->'page2'->>'state' = 'pending';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'extended')));
END;
$$;

-- ── app_cancel ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_cancel(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row    public.users;
  target_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, target_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' <> 'waiting' THEN
    RETURN jsonb_build_object('error', 'not_waiting');
  END IF;

  -- A.page1 = locked (no message — A initiated).
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  ) WHERE user_id = me_id;

  -- B.page2 = locked + message=cancel.
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_locked(relations->'page2'->'profile', 'cancel')
  ) WHERE user_id = target_id
    AND relations->'page2'->>'state' = 'pending'
    AND relations->'page2'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, target_id, 'cancel');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'cancelled-in')));
END;
$$;

-- ── app_approve ────────────────────────────────────────────────────────────
-- Precondition: A.page2.state = 'pending', not expired.
-- Success: A.page1 = chat + B's profile; B.page1 = chat + A's profile;
--          A.page2 = locked + message=approve; B.page2 = locked (no message);
--          Every C with C.page1.profile = A or = B (excluding A,B, excluding chat): locked + message=approve.
-- Fail (expired or stale): A.page2 = locked + message=approve.
CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
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

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'approve')
    ) WHERE user_id = me_id;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = inviter_id;

  -- Detach me from old watch target if I had one.
  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_profiles(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  -- A (me) → chat with B (inviter); A.page2 → locked + message=approve.
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m) - 'distance'),
    'page2', public._page2_locked(relations->'page2'->'profile', 'approve')
  ) WHERE user_id = me_id;

  -- B (inviter) → chat with A; B.page2 → locked (no message).
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
    'page2', public._page2_locked(NULL, NULL)
  ) WHERE user_id = inviter_id;

  -- Kick all third parties pointing at A or B (excluding A,B; excluding chat).
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
$$;

-- ── app_decline ────────────────────────────────────────────────────────────
-- Precondition: A.page2.state = 'pending'.
-- Result: A.page2 = locked (no message — A initiated);
--         B.page1 = locked + message=decline.
CREATE OR REPLACE FUNCTION public.app_decline(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  inviter_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;
  inviter_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, inviter_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_locked(relations->'page2'->'profile', NULL)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'decline')
  ) WHERE user_id = inviter_id
    AND relations->'page1'->>'state' = 'waiting'
    AND relations->'page1'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, inviter_id, 'decline');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'declined')));
END;
$$;

-- ── app_leave ──────────────────────────────────────────────────────────────
-- From chat: A.page1 → locked (no message); partner.page1 → locked + message=leave.
CREATE OR REPLACE FUNCTION public.app_leave(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  partner_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'chat' THEN
    RETURN jsonb_build_object('error', 'not_in_chat');
  END IF;
  partner_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'leave')
  ) WHERE user_id = partner_id
    AND relations->'page1'->>'state' = 'chat';

  PERFORM public._add_restriction(me_id, partner_id, 'leave');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$$;

-- ── app_block ──────────────────────────────────────────────────────────────
-- Same as leave but uses message=block on partner; adds permanent block restriction.
CREATE OR REPLACE FUNCTION public.app_block(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  partner_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'chat' THEN
    RETURN jsonb_build_object('error', 'not_in_chat');
  END IF;
  partner_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'block')
  ) WHERE user_id = partner_id
    AND relations->'page1'->>'state' = 'chat';

  PERFORM public._add_restriction(me_id, partner_id, 'block');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$$;

-- ── app_remove ─────────────────────────────────────────────────────────────
-- A removes a user X from A's page2.profiles array. X.page1 → locked + message=remove.
CREATE OR REPLACE FUNCTION public.app_remove(me_id uuid, viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row      public.users;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, viewer_id) ORDER BY user_id FOR UPDATE;

  PERFORM public._remove_from_profiles(me_id, viewer_id);

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'remove')
  ) WHERE user_id = viewer_id
    AND relations->'page1'->>'state' = 'watching'
    AND relations->'page1'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, viewer_id, 'remove');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', viewer_id, 'code', 'removed')));
END;
$$;

-- ── app_clear1 ─────────────────────────────────────────────────────────────
-- Clears page1.message; state stays. Only meaningful when state='locked' with message.
CREATE OR REPLACE FUNCTION public.app_clear1(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    (relations->'page1') - 'message'
  ) WHERE user_id = me_id
    AND relations->'page1'->>'state' = 'locked'
    AND relations->'page1' ? 'message';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_clear2 ─────────────────────────────────────────────────────────────
-- Clears page2.message; state stays.
CREATE OR REPLACE FUNCTION public.app_clear2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    (relations->'page2') - 'message'
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'locked'
    AND relations->'page2' ? 'message';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_free2 ──────────────────────────────────────────────────────────────
-- Transitions page2.state from locked → free (with empty profiles array).
-- No-op if not locked.
CREATE OR REPLACE FUNCTION public.app_free2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_free('[]'::jsonb)
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'locked';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_expire_sweep (cron) ────────────────────────────────────────────────
-- Locks expired waiting invitations on both sides with message=expire.
CREATE OR REPLACE FUNCTION public.app_expire_sweep()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  row_rec         record;
  inviter_id      uuid;
  invitee_id      uuid;
  notify          jsonb := '[]'::jsonb;
  count_processed int := 0;
BEGIN
  FOR row_rec IN
    SELECT user_id, relations->'page1'->'profile'->>'user_id' AS target_id
    FROM public.users
    WHERE relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
  LOOP
    inviter_id := row_rec.user_id;
    invitee_id := row_rec.target_id::uuid;

    PERFORM 1 FROM public.users WHERE user_id IN (inviter_id, invitee_id) ORDER BY user_id FOR UPDATE;

    IF (SELECT relations->'page1'->>'state' FROM public.users WHERE user_id = inviter_id) <> 'waiting' THEN
      CONTINUE;
    END IF;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'expire')
    ) WHERE user_id = inviter_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = invitee_id
      AND relations->'page2'->>'state' = 'pending'
      AND relations->'page2'->'profile'->>'user_id' = inviter_id::text;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'expired-out'))
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$$;

-- ── app_logout_cleanup ─────────────────────────────────────────────────────
-- A logs out: A.page1, A.page2 → locked (no message). All references to A
-- in others' relations: → locked + message=logout.
CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row       public.users;
  page1_target uuid;
  page2_inviter uuid;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
  vid          uuid;
  msg          text := 'logout';
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  page1_target  := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF me_row.relations->'page2'->>'state' = 'pending' THEN
    page2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  END IF;

  lock_ids := ARRAY[me_id];
  IF page1_target  IS NOT NULL THEN lock_ids := lock_ids || page1_target;  END IF;
  IF page2_inviter IS NOT NULL THEN lock_ids := lock_ids || page2_inviter; END IF;
  -- Lock everyone pointing at A in either page1 or page2.
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- Kick everyone whose page1 points at A → locked + message=logout.
  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'left'));
  END LOOP;

  -- Kick everyone whose page2 is pending on A → locked + message=logout.
  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'cancelled-in'));
  END LOOP;

  -- Remove A from any free profiles arrays.
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  -- Lock A's pages (no message — A initiated).
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'locked'),
    'page2', public._page2_locked(NULL, NULL)
  ) WHERE user_id = me_id;

  RETURN jsonb_build_object('notify', notify_list);
END;
$$;

-- ── app_delete_cleanup ─────────────────────────────────────────────────────
-- Same as logout but with message=delete.
CREATE OR REPLACE FUNCTION public.app_delete_cleanup(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row       public.users;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
  vid          uuid;
  msg          text := 'delete';
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  lock_ids := ARRAY[me_id] || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'left'));
  END LOOP;

  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'cancelled-in'));
  END LOOP;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  RETURN jsonb_build_object('notify', notify_list);
END;
$$;

-- ── app_refresh_snapshots ──────────────────────────────────────────────────
-- Updated for v3: page2 is always object {state, profile?, profiles?}.
CREATE OR REPLACE FUNCTION public.app_refresh_snapshots(me_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  me_row    public.users;
  other_row public.users;
  state_b   text;
  new_dist  int;
  target_id uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Outward 1: B.page1.profile.user_id = A
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b := other_row.relations->'page1'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_build_object('last_seen', me_row.last_seen)
      ) WHERE user_id = other_row.user_id;
    ELSE
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
      ) WHERE user_id = other_row.user_id;
    END IF;
  END LOOP;

  -- Outward 2: B.page2.profile.user_id = A (pending or locked or chat)
  FOR other_row IN
    SELECT * FROM public.users
    WHERE relations->'page2'->'profile'->>'user_id' = me_id::text
  LOOP
    state_b := other_row.relations->'page2'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profile}',
        ((relations->'page2'->'profile') - 'distance')
        || jsonb_build_object('last_seen', me_row.last_seen)
      ) WHERE user_id = other_row.user_id;
    ELSE
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profile}',
        ((relations->'page2'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
      ) WHERE user_id = other_row.user_id;
    END IF;
  END LOOP;

  -- Outward 3: A appears inside B.page2.profiles[]
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
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN e->>'user_id' = me_id::text THEN
            (e - 'distance')
            || jsonb_strip_nulls(jsonb_build_object('last_seen', me_row.last_seen, 'distance', new_dist))
          ELSE e END
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = other_row.user_id;
  END LOOP;

  -- Inward A.page1.profile
  IF me_row.relations->'page1' ? 'profile' THEN
    target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page1'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        (relations->'page1'->'profile') - 'distance'
      ) WHERE user_id = me_id;
    ELSIF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1,profile}',
        ((relations->'page1'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('distance', new_dist))
      ) WHERE user_id = me_id;
    END IF;
  END IF;

  -- Inward A.page2.profile (pending or locked or chat)
  IF me_row.relations->'page2' ? 'profile' THEN
    target_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
    state_b   := me_row.relations->'page2'->>'state';
    IF state_b = 'chat' THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profile}',
        (relations->'page2'->'profile') - 'distance'
      ) WHERE user_id = me_id;
    ELSIF target_id IS NOT NULL THEN
      SELECT * INTO other_row FROM public.users WHERE user_id = target_id;
      new_dist := CASE
        WHEN me_row.location IS NULL OR other_row.location IS NULL THEN NULL
        ELSE extensions.st_distance(me_row.location::extensions.geography, other_row.location::extensions.geography)::int
      END;
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profile}',
        ((relations->'page2'->'profile') - 'distance')
        || jsonb_strip_nulls(jsonb_build_object('distance', new_dist))
      ) WHERE user_id = me_id;
    END IF;
  END IF;

  -- Inward A.page2.profiles[] distances
  IF me_row.relations->'page2' ? 'profiles'
     AND jsonb_array_length(me_row.relations->'page2'->'profiles') > 0 THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(
          (e - 'distance')
          || jsonb_strip_nulls(jsonb_build_object('distance', (
            SELECT CASE
              WHEN me_row.location IS NULL OR u.location IS NULL THEN NULL
              ELSE extensions.st_distance(me_row.location::extensions.geography, u.location::extensions.geography)::int
            END
            FROM public.users u WHERE u.user_id = (e->>'user_id')::uuid
          )))
        )
        FROM jsonb_array_elements(relations->'page2'->'profiles') e
      ), '[]'::jsonb)
    ) WHERE user_id = me_id;
  END IF;
END;
$$;
