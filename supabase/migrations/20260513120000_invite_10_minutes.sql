-- Change initial invitation expiry from 30 minutes to 10 minutes.
-- Body is identical to the previous app_invite (20260505220000_invite_preserve_actor_page2.sql)
-- with only the `expires_at` interval literal changed.

CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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

  -- Mutual: B was already waiting on A. Both go to chat.
  -- A.page2 and B.page2 are NOT touched here — page1 buttons must not
  -- modify the actor's own page2. (Stale entries in page2.profiles are
  -- harmless: chat-state users don't render page2, and any C still
  -- pointing at A or B is locked by _kick_page1_at below.)
  IF target_row.relations->'page1'->>'state' = 'waiting'
     AND (target_row.relations->'page1'->'profile'->>'user_id')::uuid = me_id THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m) - 'distance')
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance')
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

  -- Standard invite. A.page2 left untouched.
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
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
