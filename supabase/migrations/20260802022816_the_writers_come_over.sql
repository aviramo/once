-- The writers start coming over.
--
-- CONSOLIDATED. Applied as three migrations (20260802022816, ...022908,
-- ...023016). Ten of the thirty-four now write the RELATION and say nothing at
-- all about page1 or page2; the projection turns each one into both boards.
--
--   clear1 / clear2   dismissing a card is "I have read this", per side
--   lock2  / free2    hiding is a fact about the ACCOUNT
--   pause  / resume    so is being open to a candidate
--   remove            one watch ends, with the word 'remove'
--   leave / block     a chat is two rows, so ending it ends both
--   decline           the invitation ends and the credit goes back
--
-- FIRST, THE BLOCKER. users_watch_flags recomputed `seeking` and `discoverable`
-- from the boards on every write to users, so a converted function could not set
-- a flag directly — the trigger would recompute it from a board that had not
-- moved and undo it in the same statement. It fires only when `relations`
-- actually changed now: a board writer still gets its flags derived, a flag
-- writer is left alone.
--
-- WHAT DISAPPEARS RATHER THAN BEING FIXED. app_pause and app_lock2 each carried a
-- hand-written "and detach me from their viewer list" half. That is the half
-- _expire_watch_one got wrong, which left a real user's whole profile stranded in
-- another real user's list for three weeks. Ending a row detaches both ends by
-- construction, because there is only one end.
--
-- Every conversion was run on the test partition inside a rollback and checked
-- for board mismatches and ghosts after each step: zero on all of them, with the
-- words, the credit refund and the notify payloads unchanged.

DROP TRIGGER IF EXISTS users_watch_flags ON public.users;
CREATE TRIGGER users_watch_flags
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.relations IS DISTINCT FROM NEW.relations)
  EXECUTE FUNCTION public._watch_flags_tg();

DROP TRIGGER IF EXISTS users_watch_flags_ins ON public.users;
CREATE TRIGGER users_watch_flags_ins
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public._watch_flags_tg();

CREATE OR REPLACE FUNCTION public.app_lock2(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json; notify jsonb := '[]'::jsonb; w uuid; watchers uuid[];
BEGIN
  IF NOT COALESCE((SELECT discoverable FROM public.users WHERE user_id = me_id), false) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT COALESCE(array_agg(watcher_id), '{}'::uuid[]) INTO watchers
  FROM public.watch WHERE target_id = me_id AND state = 'watching';

  PERFORM 1 FROM public.users WHERE user_id = ANY(ARRAY[me_id] || watchers) ORDER BY user_id FOR UPDATE;

  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason='remove',
    watcher_cleared_at=NULL, updated_at=now()
  WHERE target_id = me_id AND state = 'watching';

  IF array_length(watchers, 1) IS NOT NULL THEN
    FOREACH w IN ARRAY watchers LOOP
      PERFORM public._add_restriction(me_id, w, 'remove');
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', w, 'code', 'removed'));
    END LOOP;
  END IF;

  UPDATE public.users SET discoverable = false, relations = relations - 'last_add_at'
  WHERE user_id = me_id;

  PERFORM public._watch_project(ARRAY[me_id] || watchers);
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_free2(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  IF EXISTS (SELECT 1 FROM public.watch
             WHERE state='chat' AND (watcher_id = me_id OR target_id = me_id)) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  UPDATE public.watch SET target_cleared_at = now(), updated_at = now()
  WHERE target_id = me_id AND state='ended'
    AND target_slot_at IS NOT NULL AND target_cleared_at IS NULL;

  UPDATE public.users SET discoverable = true WHERE user_id = me_id AND NOT discoverable;

  PERFORM public._watch_project(ARRAY[me_id]);
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE t uuid; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT target_id INTO t FROM public.watch WHERE watcher_id = me_id AND state = 'watching';
  IF t IS NULL THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, t) ORDER BY user_id FOR UPDATE;

  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason=NULL,
    watcher_slot_at=NULL, updated_at=now()
  WHERE watcher_id = me_id AND target_id = t;

  UPDATE public.users SET seeking = false WHERE user_id = me_id;

  PERFORM public._watch_project(ARRAY[me_id, t]);
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_resume(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id AND NOT seeking AND NOT discoverable) THEN
    UPDATE public.watch SET watcher_slot_at = NULL, updated_at = now()
    WHERE watcher_id = me_id AND watcher_slot_at IS NOT NULL;

    UPDATE public.watch SET target_cleared_at = now(), updated_at = now()
    WHERE target_id = me_id AND state='ended'
      AND target_slot_at IS NOT NULL AND target_cleared_at IS NULL;

    UPDATE public.users SET seeking = true, discoverable = true,
      relations = relations || jsonb_strip_nulls(jsonb_build_object(
        'credits',      public._credits_ensure(relations)->'credits',
        'availability', public.user_availability(me_id, location::extensions.geography),
        'push',         relations->'push'))
    WHERE user_id = me_id;

    PERFORM public._watch_project(ARRAY[me_id]);
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_remove(me_id uuid, viewer_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, viewer_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason='remove',
    watcher_cleared_at=NULL, updated_at=now()
  WHERE watcher_id = viewer_id AND target_id = me_id AND state='watching';

  PERFORM public._add_restriction(me_id, viewer_id, 'remove');
  PERFORM public._watch_project(ARRAY[me_id, viewer_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', viewer_id, 'code', 'removed')));
END;
$function$;

CREATE OR REPLACE FUNCTION public._watch_end_chat(p_me uuid, p_partner uuid, p_word text)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason=NULL,
    watcher_slot_at=NULL, updated_at=now()
  WHERE watcher_id = p_me AND target_id = p_partner;

  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason=p_word,
    watcher_cleared_at=NULL, updated_at=now()
  WHERE watcher_id = p_partner AND target_id = p_me;

  UPDATE public.watch SET target_cleared_at=now(), updated_at=now()
  WHERE target_id IN (p_me, p_partner) AND state='ended'
    AND target_slot_at IS NOT NULL AND target_cleared_at IS NULL;

  UPDATE public.users SET discoverable = true
  WHERE user_id IN (p_me, p_partner) AND NOT discoverable;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_leave(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE partner_id uuid; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT target_id INTO partner_id FROM public.watch WHERE watcher_id = me_id AND state='chat';
  IF partner_id IS NULL THEN RETURN jsonb_build_object('error','not_in_chat'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;
  PERFORM public._watch_end_chat(me_id, partner_id, 'leave');
  PERFORM public._add_restriction(me_id, partner_id, 'leave');
  PERFORM public._watch_project(ARRAY[me_id, partner_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_block(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE partner_id uuid; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT target_id INTO partner_id FROM public.watch WHERE watcher_id = me_id AND state='chat';
  IF partner_id IS NULL THEN RETURN jsonb_build_object('error','not_in_chat'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;
  PERFORM public._watch_end_chat(me_id, partner_id, 'block');
  PERFORM public._add_restriction(me_id, partner_id, 'block');
  PERFORM public._watch_project(ARRAY[me_id, partner_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_decline(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE inviter_id uuid; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT watcher_id INTO inviter_id FROM public.watch WHERE target_id = me_id AND state='invited';
  IF inviter_id IS NULL THEN RETURN jsonb_build_object('error','no_incoming'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, inviter_id) ORDER BY user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.watch
                 WHERE watcher_id = inviter_id AND target_id = me_id AND state='invited') THEN
    RETURN jsonb_build_object('error','no_incoming');
  END IF;

  UPDATE public.watch SET state='ended', ended_at=now(), watcher_reason='decline',
    watcher_cleared_at=NULL, target_cleared_at=now(), updated_at=now()
  WHERE watcher_id = inviter_id AND target_id = me_id;

  UPDATE public.users SET relations = public._credits_refund(relations, public._credits_cost('invite'))
  WHERE user_id = inviter_id;

  PERFORM public._add_restriction(me_id, inviter_id, 'decline');
  PERFORM public._watch_project(ARRAY[me_id, inviter_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'declined')));
END;
$function$;

REVOKE ALL ON FUNCTION public._watch_end_chat(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_end_chat(uuid, uuid, text) TO service_role;
