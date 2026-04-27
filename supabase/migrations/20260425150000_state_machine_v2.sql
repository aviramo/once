-- State machine v2:
-- • app_find: only from null state
-- • app_cancel: A→null, B.page2→missed
-- • app_extend: no-op when already extended (was: fail)
-- • app_approve: B.page2→fail on expired (was: expired)
-- • app_leave: A→null (was: missed)
-- • app_clear1: unified — chat→block behavior, fail/missed→ok
-- • app_clear2: accepts missed/fail (was: cancelled/expired)
-- • app_expire_sweep: B.page2→missed (was: expired)
-- • app_logout_cleanup: unified, handles all related users atomically

-- ── app_find ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.app_find(uuid, boolean);
DROP FUNCTION IF EXISTS public.app_find(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.app_find(me_id uuid, force boolean DEFAULT false, event_key text DEFAULT 'find')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row              public.users;
  old_target          uuid;
  picked_id           uuid;
  picked_dist         int;
  picked_row          public.users;
  result_user         json;
  notify              jsonb := '[]'::jsonb;
  cur_state           text;
  pending_inviter_id  uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  -- Who sent me a pending invitation (exclude from results)
  pending_inviter_id := CASE
    WHEN jsonb_typeof(me_row.relations->'page2') = 'object'
      AND me_row.relations->'page2'->>'state' = 'pending'
    THEN (me_row.relations->'page2'->>'user_id')::uuid
    ELSE NULL
  END;

  SELECT o.user_id, o.distance INTO picked_id, picked_dist
  FROM public.others(me_row, true) o
  WHERE o.relevance > 0
    -- Exclude current watch target
    AND ((me_row.relations->'page1'->'profile'->>'user_id') IS NULL
         OR o.user_id::text <> (me_row.relations->'page1'->'profile'->>'user_id'))
    -- Exclude users currently watching me
    AND NOT EXISTS (
      SELECT 1 FROM public.users w
      WHERE w.user_id = o.user_id
        AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
        AND w.relations->'page1'->>'state' = 'watching'
    )
    -- Exclude user who sent me a pending invitation
    AND (pending_inviter_id IS NULL OR o.user_id <> pending_inviter_id)
  ORDER BY o.relevance DESC
  LIMIT 1;

  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[me_id, old_target, picked_id]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  cur_state  := me_row.relations->'page1'->>'state';

  -- Only proceed from null state
  IF cur_state IS NOT NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  IF old_target IS NOT NULL THEN
    PERFORM public._remove_from_page2(old_target, me_id);
  END IF;

  IF picked_id IS NOT NULL THEN
    SELECT * INTO picked_row FROM public.users WHERE user_id = picked_id;
    IF picked_row.relations->'page1'->>'state' = 'chat'
       OR jsonb_typeof(picked_row.relations->'page2') <> 'array' THEN
      picked_id := NULL;
    END IF;
  END IF;

  IF picked_id IS NULL THEN
    UPDATE public.users SET relations = jsonb_build_object(
      'page1', jsonb_build_object('state', null, 'event', event_key),
      'page2', COALESCE(relations->'page2', '[]'::jsonb)
    ) WHERE user_id = me_id;
  ELSE
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object(
        'profile', public.make_profile(picked_row, picked_dist),
        'state', 'watching',
        'event', event_key
      )
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      (relations->'page2') || jsonb_build_array(public.make_profile(me_row, picked_dist))
    ) WHERE user_id = picked_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
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

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', null, 'event', 'cancel'),
    'page2', COALESCE(relations->'page2', '[]'::jsonb)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    (relations->'page2') || jsonb_build_object('state', 'missed', 'event', 'cancel')
  ) WHERE user_id = target_id
    AND jsonb_typeof(relations->'page2') = 'object';

  PERFORM public._add_restriction(me_id, target_id, 'cancel');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'cancelled-in')));
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

  -- Already extended: no-op
  IF COALESCE(me_row.relations->'page1'->>'extended', 'false') = 'true' THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- Expired: fail
  IF (me_row.relations->'page1'->>'expires_at')::timestamptz <= now() THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('profile', relations->'page1'->'profile', 'state', 'fail', 'event', 'extend')
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
  ) WHERE user_id = target_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'extended')));
END;
$$;

-- ── app_approve ────────────────────────────────────────────────────────────
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

  IF jsonb_typeof(me_row.relations->'page2') <> 'object'
     OR me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  inviter_id    := (me_row.relations->'page2'->>'user_id')::uuid;
  my_old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id IN (me_id, inviter_id)
     OR (my_old_target IS NOT NULL AND user_id = my_old_target)
     OR relations->'page1'->'profile'->>'user_id' = inviter_id::text
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF jsonb_typeof(me_row.relations->'page2') <> 'object'
     OR me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN

    UPDATE public.users SET relations = jsonb_build_object(
      'page1', jsonb_build_object(
        'profile', COALESCE(
          relations->'page1'->'profile',
          me_row.relations->'page2' - 'invited_at' - 'expires_at' - 'extended' - 'state' - 'event'
        ),
        'state', 'fail',
        'event', 'approve'
      ),
      'page2', CASE
        WHEN jsonb_typeof(relations->'page2') = 'object'
          AND relations->'page2'->>'state' = 'pending'
        THEN (relations->'page2') || jsonb_build_object('state', 'fail', 'event', 'approve')
        ELSE relations->'page2'
      END
    ) WHERE user_id = me_id;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = inviter_id;

  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_page2(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('profile', public.make_profile(me_row, dist_m) - 'distance', 'state', 'chat', 'event', 'invite'),
    'page2', '[]'::jsonb
  ) WHERE user_id = inviter_id;

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('profile', public.make_profile(inviter_row, dist_m) - 'distance', 'state', 'chat', 'event', 'approved'),
    'page2', '[]'::jsonb
  ) WHERE user_id = me_id;

  FOR kicked IN SELECT * FROM public._kick_pointing_at(inviter_id, me_id, 'missed', 'matched') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'match'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;

-- ── app_leave ──────────────────────────────────────────────────────────────
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

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', null, 'event', 'leave'),
    'page2', '[]'::jsonb
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object('profile', relations->'page1'->'profile', 'state', 'missed', 'event', 'leave')
  ) WHERE user_id = partner_id;

  PERFORM public._add_restriction(me_id, partner_id, 'leave');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$$;

-- ── app_clear1 (fail/missed → null/clear1) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_clear1(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row    public.users;
  cur_state text;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  cur_state := me_row.relations->'page1'->>'state';

  IF cur_state NOT IN ('fail', 'missed') THEN
    RETURN jsonb_build_object('error', 'wrong_state');
  END IF;

  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', null, 'event', 'clear1'),
    'page2', COALESCE(relations->'page2', '[]'::jsonb)
  ) WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_clear2 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_clear2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(relations, '{page2}', '[]'::jsonb)
  WHERE user_id = me_id
    AND jsonb_typeof(relations->'page2') = 'object'
    AND relations->'page2'->>'state' IN ('missed', 'fail');
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_expire_sweep ───────────────────────────────────────────────────────
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
      jsonb_build_object('profile', relations->'page1'->'profile', 'state', 'missed', 'event', 'expire')
    ) WHERE user_id = inviter_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      (relations->'page2') || jsonb_build_object('state', 'missed', 'event', 'expire')
    ) WHERE user_id = invitee_id
      AND jsonb_typeof(relations->'page2') = 'object'
      AND (relations->'page2'->>'user_id')::uuid = inviter_id;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'expired-out'))
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$$;

-- ── app_logout_cleanup ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row       public.users;
  page1_state  text;
  page1_target uuid;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  page1_state  := me_row.relations->'page1'->>'state';
  page1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  lock_ids := ARRAY[me_id];
  IF page1_target IS NOT NULL THEN lock_ids := lock_ids || page1_target; END IF;
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  page1_state  := me_row.relations->'page1'->>'state';
  page1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  -- If A was waiting (invited B): update B.page2 → missed
  IF page1_state = 'waiting' AND page1_target IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      (relations->'page2') || jsonb_build_object('state', 'missed', 'event', 'logout')
    ) WHERE user_id = page1_target
      AND jsonb_typeof(relations->'page2') = 'object'
      AND (relations->'page2'->>'user_id')::uuid = me_id;
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page1_target, 'code', 'cancelled-in'));

  -- If A was watching B: remove A from B.page2[]
  ELSIF page1_state = 'watching' AND page1_target IS NOT NULL THEN
    PERFORM public._remove_from_page2(page1_target, me_id);
  END IF;

  -- Kick everyone whose page1 points at A → missed/logout
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'profile', relations->'page1'->'profile',
      'state', 'missed',
      'event', 'logout'
    )
  ) WHERE relations->'page1'->'profile'->>'user_id' = me_id::text
    AND user_id <> me_id;

  -- Clear A
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', null, 'event', 'logout'),
    'page2', '[]'::jsonb
  ) WHERE user_id = me_id;

  RETURN jsonb_build_object('notify', notify_list);
END;
$$;
