-- ── app_approve: A.page2 → locked-empty on success ────────────────────────
-- Spec change: once both users land in chat (page1.state = 'chat'), there is
-- nothing for either side's page2 to communicate; the chat itself is the
-- result. Both A.page2 and B.page2 are now written as locked with no message
-- and no profile. The fail path (expired/stale invite) still writes
-- locked + profile + message='approve' so A sees the failure card on page2.

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

  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_profiles(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  -- A (me) → chat; A.page2 → locked, no message, no profile.
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m) - 'distance'),
    'page2', public._page2_locked(NULL, NULL)
  ) WHERE user_id = me_id;

  -- B (inviter) → chat; B.page2 → locked, no message, no profile.
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
    'page2', public._page2_locked(NULL, NULL)
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
$$;
