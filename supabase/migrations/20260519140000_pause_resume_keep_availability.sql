-- ============================================================================
-- app_pause / app_resume: stop wiping relations.availability (+push/join_request)
--
-- BUG: both RPCs rebuild `me`'s relations from a fresh jsonb_build_object and
-- only carried `credits` forward — dropping `availability`, `push`,
-- `join_request`. A gated user (not in any enabled group → availability
-- {state:'unavailable',reason:'group'}, or push-blocked) who pauses then
-- resumes loses the gate: the mobile client defaults a missing availability
-- to 'available' (geoGated=false → the play button appears) and the edge
-- resume auto-find guard (availabilityState === 'available') also passes →
-- the user can resume and pull candidates despite being gated.
--
-- FIX (same discipline app_admin_reset already follows — recompute
-- availability via user_availability, carry the economy/gate sibling keys):
-- the final `me` relations rebuild now merges, on top of the page1/page2
-- skeleton, a jsonb_strip_nulls() bundle of:
--   credits      — unchanged (_credits_clear_hold∘_credits_ensure for pause,
--                   _credits_ensure for resume)
--   availability — RECOMPUTED via public.user_availability(me_id, location)
--                   so the membership/push gate re-asserts immediately
--   push         — carried verbatim (notification-presence gate signal)
--   join_request — carried verbatim (pending "let me in" request)
-- jsonb_strip_nulls drops push/join_request when absent (no "key":null).
-- LIVE bodies reproduced verbatim; only the final me-UPDATE SET changed.
-- Additive / not breaking: response shape unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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

  IF page2_state = 'pending' AND page2_inviter IS NOT NULL THEN
    UPDATE public.users SET relations = public._credits_refund(jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'decline')
    )) WHERE user_id = page2_inviter
      AND relations->'page1'->>'state' = 'waiting'
      AND relations->'page1'->'profile'->>'user_id' = me_id::text;
    PERFORM public._add_restriction(me_id, page2_inviter, 'decline');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page2_inviter, 'code', 'declined'));
  END IF;

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

  UPDATE public.users SET relations =
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'locked')
    )
    || jsonb_strip_nulls(jsonb_build_object(
      'credits',      public._credits_clear_hold(public._credits_ensure(relations))->'credits',
      'availability', public.user_availability(me_id, location::extensions.geography),
      'push',         relations->'push',
      'join_request', relations->'join_request'
    ))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_list);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_resume(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  result_user json;
BEGIN
  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;

  UPDATE public.users SET relations =
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    )
    || jsonb_strip_nulls(jsonb_build_object(
      'credits',      public._credits_ensure(relations)->'credits',
      'availability', public.user_availability(me_id, location::extensions.geography),
      'push',         relations->'push',
      'join_request', relations->'join_request'
    ))
  WHERE user_id = me_id
    AND relations->'page1'->>'state' = 'locked'
    AND relations->'page2'->>'state' = 'locked';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;