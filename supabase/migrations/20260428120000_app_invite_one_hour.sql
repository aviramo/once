-- Initial invitation expiry changed from 10 minutes to 1 hour.
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

  IF me_row.relations->'page1'->>'state' <> 'watching'
     OR (me_row.relations->'page1'->'profile'->>'user_id')::uuid <> target_id
     OR jsonb_typeof(target_row.relations->'page2') <> 'array' THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('profile', public._strip_volatile(relations->'page1'->'profile'), 'state', 'fail', 'event', 'invite')
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
      jsonb_build_object('profile', public.make_profile(target_row, dist_m) - 'distance', 'state', 'chat', 'event', 'mutual')
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('profile', public.make_profile(me_row, dist_m) - 'distance', 'state', 'chat', 'event', 'mutual')
    ) WHERE user_id = target_id;

    UPDATE public.users SET relations = jsonb_set(relations, '{page2}', '[]'::jsonb) WHERE user_id = me_id;
    UPDATE public.users SET relations = jsonb_set(relations, '{page2}', '[]'::jsonb) WHERE user_id = target_id;

    FOR kicked IN SELECT * FROM public._kick_pointing_at(me_id, target_id, 'missed', 'matched') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_pointing_at(target_id, me_id, 'missed', 'matched') LOOP
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
      'profile', public.make_profile(target_row, dist_m),
      'state', 'waiting',
      'event', 'invite',
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public.make_profile(me_row, dist_m) || jsonb_build_object('invited_at', invited_at, 'expires_at', expires_at, 'state', 'pending')
  ) WHERE user_id = target_id;

  FOR kicked IN SELECT * FROM public._kick_pointing_at(target_id, me_id, 'missed', 'invite') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-invitee'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'invite-in'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;
