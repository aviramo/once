-- app_report and app_extend come over.
--
-- Reporting is four different endings depending on what the two of us were in
-- the middle of, and each is now the same one-row ending the ordinary action
-- makes: a chat reported is a leave, a waiting invitation is a cancel, an
-- incoming one is a decline, a watch is just stopped. The words, the credit
-- moves and the notify codes are exactly what they were, and the moderation row
-- is written the same way with the same context.
--
-- The three trailing _remove_from_profiles calls are gone. The list is derived,
-- so ending the relation removes the entry — both ways, once, and it cannot be
-- the half that gets skipped.
--
-- app_extend pushes ONE clock on ONE row. It used to write the same value into
-- two boards in two statements, so a lapsed or reshaped second board silently
-- kept the old deadline while the first moved. Verified after the conversion:
-- the extended deadline comes out identical on both sides, and the one-shot rule
-- still refuses the second extension.

CREATE OR REPLACE FUNCTION public.app_extend(me_id uuid, add_minutes integer)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_target uuid; v_exp timestamptz; v_ext boolean; v_new timestamptz; result_user json;
BEGIN
  IF add_minutes NOT IN (10, 30, 60, 120, 240, 480, 1440) THEN
    RETURN jsonb_build_object('error','bad_minutes'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT w.target_id INTO v_target FROM public.watch w
  WHERE w.watcher_id = me_id AND w.watcher_slot_at IS NOT NULL
  ORDER BY w.watcher_slot_at DESC LIMIT 1;
  IF v_target IS NULL THEN RETURN jsonb_build_object('error','no_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, v_target) ORDER BY user_id FOR UPDATE;

  SELECT w.expires_at, w.extended INTO v_exp, v_ext FROM public.watch w
  WHERE w.watcher_id = me_id AND w.target_id = v_target AND w.state='invited';
  IF v_exp IS NULL THEN RETURN jsonb_build_object('error','not_waiting'); END IF;

  IF COALESCE(v_ext,false) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  IF v_exp <= now() THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      watcher_reason='extend', watcher_cleared_at=NULL, updated_at=now()
    WHERE w.watcher_id = me_id AND w.target_id = v_target;
    PERFORM public._watch_project(ARRAY[me_id, v_target]);
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify','[]'::jsonb);
  END IF;

  v_new := v_exp + (add_minutes || ' minutes')::interval;

  UPDATE public.watch w SET expires_at = v_new, extended = true, updated_at = now()
  WHERE w.watcher_id = me_id AND w.target_id = v_target;

  PERFORM public._watch_project(ARRAY[me_id, v_target]);
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', v_target, 'code','extended')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_report(me_id uuid, reported_id uuid, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_context text := 'unknown'; notify jsonb := '[]'::jsonb; result_user json;
        v_out text; v_in text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;
  IF reported_id IS NULL OR reported_id = me_id THEN
    RETURN jsonb_build_object('error','bad_target'); END IF;
  IF public._is_test(me_id) AND NOT public._is_test(reported_id) THEN
    RETURN jsonb_build_object('error','bad_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, reported_id) ORDER BY user_id FOR UPDATE;

  SELECT w.state INTO v_out FROM public.watch w
  WHERE w.watcher_id = me_id AND w.target_id = reported_id AND w.state IN ('watching','invited','chat');
  SELECT w.state INTO v_in FROM public.watch w
  WHERE w.watcher_id = reported_id AND w.target_id = me_id AND w.state IN ('invited','chat');

  v_context := CASE
    WHEN v_out = 'chat' OR v_in = 'chat' THEN 'chat'
    WHEN v_out = 'invited'  THEN 'waiting'
    WHEN v_in  = 'invited'  THEN 'pending'
    WHEN v_out = 'watching' THEN 'watching'
    ELSE 'unknown' END;

  INSERT INTO public.reports (reporter_id, reported_id, context, reason, note)
  VALUES (me_id, reported_id, v_context, p_reason, p_note);

  PERFORM public._add_restriction(me_id, reported_id, 'block');

  IF v_context = 'chat' THEN
    PERFORM public._watch_end_chat(me_id, reported_id, 'leave');
    notify := jsonb_build_array(jsonb_build_object('user_id', reported_id, 'code','left'));

  ELSIF v_context = 'waiting' THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      watcher_reason=NULL, watcher_slot_at=NULL,
      target_reason='cancel', target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
    WHERE w.watcher_id = me_id AND w.target_id = reported_id;
    UPDATE public.users SET relations = public._credits_clear_hold(relations, public._credits_cost('invite'))
    WHERE user_id = me_id;
    notify := jsonb_build_array(jsonb_build_object('user_id', reported_id, 'code','cancelled-in'));

  ELSIF v_context = 'pending' THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      watcher_reason='decline', watcher_cleared_at=NULL,
      target_cleared_at=now(), updated_at=now()
    WHERE w.watcher_id = reported_id AND w.target_id = me_id;
    UPDATE public.users SET relations = public._credits_refund(relations, public._credits_cost('invite'))
    WHERE user_id = reported_id;
    notify := jsonb_build_array(jsonb_build_object('user_id', reported_id, 'code','declined'));

  ELSIF v_context = 'watching' THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      watcher_reason=NULL, watcher_slot_at=NULL, updated_at=now()
    WHERE w.watcher_id = me_id AND w.target_id = reported_id;
  END IF;

  -- whatever else stood between us stops, both ways, in one statement
  UPDATE public.watch w SET state='ended', ended_at=now(), watcher_slot_at=NULL, updated_at=now()
  WHERE ((w.watcher_id = me_id AND w.target_id = reported_id)
      OR (w.watcher_id = reported_id AND w.target_id = me_id))
    AND w.state <> 'ended';

  PERFORM public._watch_project(ARRAY[me_id, reported_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;
