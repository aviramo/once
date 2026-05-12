-- ── app_pause / app_resume ─────────────────────────────────────────────────
-- Backs the "Game mode: Active / Off" toggle in mobile settings (sits above
-- the profile card on the menu pane). Active = both pages are workable;
-- Off = both pages locked, user is fully out of the game.
--
-- app_pause(me_id): combines app_lock2's "hide me from discovery" semantics
-- with a full page1 clear (so the user is not waiting on / chatting with /
-- watching anyone after pausing). Handles in-flight interactions
-- gracefully:
--   page1.state = 'waiting' → cancel-equivalent: notify B (cancelled-in),
--     B.page2 → locked + message=cancel, restriction A→B 'cancel' (24h)
--   page1.state = 'chat'    → leave-equivalent: notify B (left), B.page1 →
--     locked + message=leave, B.page2 → free, restriction A→B 'leave' (14d)
--   page2.state = 'pending' → decline-equivalent: notify inviter (declined),
--     inviter.page1 → locked + message=decline, restriction A→inviter
--     'decline' (7d)
--   page2.state = 'free' with profiles → kick each watcher (page1 →
--     locked + message=remove if still pointing at A), restriction A→viewer
--     'remove' (24h), 'removed' push.
-- Finally collapses A.page1 → {state:'locked'} and A.page2 →
-- {state:'locked'} with no message/profile/profiles on either side.
--
-- app_resume(me_id): inverse, called when the toggle flips back to Active.
-- Sets both pages to free (page1 free with no profile, page2 free with
-- empty profiles[]). Guarded on both pages currently being locked so an
-- in-flight chat/waiting can't be accidentally wiped by a stray call.

CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row        public.users;
  page1_state   text;
  page2_state   text;
  page1_target  uuid;
  page2_inviter uuid;
  watcher_ids   uuid[] := '{}';
  lock_ids      uuid[];
  notify_list   jsonb := '[]'::jsonb;
  vid           uuid;
  result_user   json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  page1_state  := me_row.relations->'page1'->>'state';
  page2_state  := me_row.relations->'page2'->>'state';
  page1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF page2_state = 'pending' THEN
    page2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  END IF;

  IF page2_state = 'free' THEN
    SELECT COALESCE(
      (SELECT array_agg((p->>'user_id')::uuid)
       FROM jsonb_array_elements(COALESCE(me_row.relations->'page2'->'profiles', '[]'::jsonb)) AS p
       WHERE p->>'user_id' IS NOT NULL),
      '{}'::uuid[]
    ) INTO watcher_ids;
    IF watcher_ids IS NULL THEN watcher_ids := '{}'; END IF;
  END IF;

  -- Build the full row-lock set: self + page1 partner + page2 inviter +
  -- watchers + anyone else whose relations reference me (so the "remove
  -- me from their page2.profiles[]" UPDATE below can take the row lock).
  lock_ids := ARRAY[me_id] || watcher_ids;
  IF page1_target  IS NOT NULL THEN lock_ids := lock_ids || page1_target;  END IF;
  IF page2_inviter IS NOT NULL THEN lock_ids := lock_ids || page2_inviter; END IF;
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- Outgoing page1 cleanup based on current state.
  IF page1_state = 'waiting' AND page1_target IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'cancel')
    ) WHERE user_id = page1_target
      AND relations->'page2'->>'state' = 'pending'
      AND relations->'page2'->'profile'->>'user_id' = me_id::text;
    PERFORM public._add_restriction(me_id, page1_target, 'cancel');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page1_target, 'code', 'cancelled-in'));
  ELSIF page1_state = 'chat' AND page1_target IS NOT NULL THEN
    UPDATE public.users SET relations =
      jsonb_set(
        jsonb_set(
          relations, '{page1}',
          public._page1_locked(relations->'page1'->'profile', 'leave')
        ),
        '{page2}',
        jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    WHERE user_id = page1_target
      AND relations->'page1'->>'state' = 'chat';
    PERFORM public._add_restriction(me_id, page1_target, 'leave');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page1_target, 'code', 'left'));
  END IF;

  -- Incoming pending invite → decline-equivalent for the inviter.
  IF page2_state = 'pending' AND page2_inviter IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'decline')
    ) WHERE user_id = page2_inviter
      AND relations->'page1'->>'state' = 'waiting'
      AND relations->'page1'->'profile'->>'user_id' = me_id::text;
    PERFORM public._add_restriction(me_id, page2_inviter, 'decline');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page2_inviter, 'code', 'declined'));
  END IF;

  -- Kick every watcher in page2.profiles[] (same as app_lock2).
  IF array_length(watcher_ids, 1) IS NOT NULL THEN
    FOREACH vid IN ARRAY watcher_ids LOOP
      UPDATE public.users SET relations = jsonb_set(relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'remove'))
      WHERE user_id = vid
        AND relations->'page1'->>'state' = 'watching'
        AND relations->'page1'->'profile'->>'user_id' = me_id::text;
      PERFORM public._add_restriction(me_id, vid, 'remove');
      notify_list := notify_list || jsonb_build_array(
        jsonb_build_object('user_id', vid, 'code', 'removed'));
    END LOOP;
  END IF;

  -- Remove me from any other user's page2.profiles[] (covers the case
  -- where I'm in 'watching' state and the target's page2 lists me).
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

  -- Final state: both pages locked, no profile/message on either side.
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'locked'),
    'page2', jsonb_build_object('state', 'locked')
  ) WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_list);
END;
$$;


CREATE OR REPLACE FUNCTION public.app_resume(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;

  -- Only flip when fully locked on both sides; otherwise leave state alone
  -- (an in-flight interaction must not be wiped by a stray resume call).
  UPDATE public.users SET relations = jsonb_build_object(
    'page1', jsonb_build_object('state', 'free'),
    'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
  ) WHERE user_id = me_id
    AND relations->'page1'->>'state' = 'locked'
    AND relations->'page2'->>'state' = 'locked';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;
