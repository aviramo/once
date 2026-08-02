-- A MATCH TAKES BOTH OF YOU OFF THE BOARD, AND NOTHING PUTS YOU BACK ON WHILE
-- THE CHAT IS OPEN (user report 2026-08-02: "if we are in a match, how can
-- there be somebody besides Maya?").
--
-- That invariant was already the intent everywhere but here: app_approve locks
-- page2 on both sides and kicks every watcher off both cards, app_find refuses
-- to pick a candidate whose page1 is 'chat', and app_leave is what frees page2
-- again. Two paths never got the memo, and the reported state was reachable
-- through the second of them with no bug in sight:
--
--   21:40  invite  -> page1 waiting
--   21:43  match   -> page1 chat, page2 LOCKED      (correct)
--   21:49  free2   -> page1 chat, page2 FREE        (the visibility row)
--   21:50  seed    -> a third party pinned to a card that is in a chat
--
--   1. app_free2 only ever asked whether page2 was locked. The visibility row
--      is the one control that calls it, and after a match that row reads
--      "hidden" -- because it IS hidden, by the match -- so the flip offered
--      the user a way back into the pool from inside a conversation, and the
--      server took it.
--   2. app_invite's MUTUAL branch (both sides pressed the heart) writes page1
--      for both and leaves page2 exactly as it was: 'free', still carrying the
--      stale watcher array. Nobody has to press anything for that one -- every
--      mutual match has been leaving both people on the board. The comment that
--      allowed it (2026-05-05, "stale entries in page2.profiles are harmless:
--      chat-state users don't render page2") was true when it was written and
--      stopped being true the day the dock grew a preferences key and a
--      visibility row that state exactly that array.
--
-- app_seed_viewer gets the same guard as a floor under both: it is the only
-- thing that pins a watcher outside app_find, it never looked at page1 at all,
-- and it is called from three places in the dispatcher. A guard there means no
-- future caller can re-open this by freeing a page2 some other way.
--
-- Not a breaking change: no field, shape, endpoint or push code moves. What
-- changes is which states are reachable, and the client already renders the one
-- that is left (page2 locked during a chat IS the ordinary post-match state).
-- No BACKWARD_COMPAT entry.

-- ── app_invite: a mutual match locks both page2s, exactly as app_approve does ─
CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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

  -- Inviting holds 1 heart (balance first, extra second). Block when the
  -- wallet can't cover. No state change on this failure branch.
  IF public._credits_total(me_row.relations) < public._credits_cost('invite') THEN
    RETURN jsonb_build_object('error', 'no_credits');
  END IF;

  IF me_row.relations->'page1'->>'state' <> 'watching'
     OR (me_row.relations->'page1'->'profile'->>'user_id')::uuid <> target_id
     OR NOT public._page2_open(target_row.relations->'page2') THEN

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

  -- Mutual: B was already waiting on A. Both go to chat -- and both come OFF
  -- the board in the same statement (2026-08-02). page1 buttons still may not
  -- touch the actor's page2 for anything else; a match is not "anything else",
  -- it is the one page1 event that ends both people's availability, and
  -- app_approve has always written it this way. The kick loops below already
  -- take every third party off both cards; without this their entries stayed
  -- in the arrays and both users stayed findable, visible and invitable while
  -- talking to each other. jsonb_set over the existing relations (rather than
  -- app_approve's rebuild) so availability/push/last_add_at survive the match.
  IF target_row.relations->'page1'->>'state' = 'waiting'
     AND (target_row.relations->'page1'->'profile'->>'user_id')::uuid = me_id THEN

    UPDATE public.users SET relations = jsonb_set(
      jsonb_set(
        relations, '{page1}',
        jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m, me_id) - 'distance')
      ),
      '{page2}', public._page2_locked(NULL, NULL)
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      jsonb_set(
        public._credits_refund(relations, public._credits_cost('invite')),
        '{page1}',
        jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, target_id) - 'distance')
      ),
      '{page2}', public._page2_locked(NULL, NULL)
    ) WHERE user_id = target_id;

    FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, target_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id,     'code', 'match'));
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'match'));

    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    public._credits_hold(relations, public._credits_cost('invite')),
    '{page1}',
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

-- ── app_free2: a chat is not a hide, so it cannot be un-hidden ───────────────
-- The gate is on page1 rather than on a flag, because the state it is refusing
-- is exactly "there is a conversation open". Ending the chat (app_leave) is
-- what frees page2, and it always has been.
CREATE OR REPLACE FUNCTION public.app_free2(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_free(COALESCE(relations->'page2'->'profiles', '[]'::jsonb))
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'locked'
    AND COALESCE(relations->'page1'->>'state', 'free') <> 'chat';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

-- ── app_seed_viewer: nobody is pinned to a card that is in a chat ────────────
-- Same rule app_find already enforces from the other side (it drops a picked
-- candidate whose page1 is 'chat'). This is the floor under the two fixes
-- above: whatever leaves a page2 free, a chat still gets no watchers.
CREATE OR REPLACE FUNCTION public.app_seed_viewer(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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
     OR COALESCE(me_row.relations->'page1'->>'state', 'free') = 'chat'
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
     OR COALESCE(me_row.relations->'page1'->>'state', 'free') = 'chat'
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
      'profile', public.make_profile(me_row, cand_dist, cand_id),
      'expires_at', now() + public._watch_ttl()
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
