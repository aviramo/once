-- Inviting, matching and cancelling come over, and the kick with them —
-- plus a real bug the committed test found.
--
-- CONSOLIDATED (the conversion, then the `discoverable` fix it surfaced).
--
-- `discoverable` MEANS "I HAVE NOT HIDDEN MYSELF", AND NOTHING ELSE. It was
-- derived with _page2_open, which answers a different question — that helper is
-- about whether a board can take an invitation, so it says no for `pending` and
-- for `chat` as well as for a real hide. Merely RECEIVING an invitation
-- therefore set discoverable = false, and since app_decline and app_cancel have
-- no reason to touch a visibility flag, the invitee would have been left
-- permanently hidden the moment the invitation ended. Nothing showed it until a
-- test was allowed to COMMIT and the state read back afterwards: inside a
-- rollback the wrong value never outlived the transition that set it. Hiding is
-- one shape only — a locked board with no message. A pending invitation, a chat
-- and an "it ended" card are things ON the board, not the board switched off.
--
-- app_invite is the busiest transition in the system: it holds a credit, it can
-- discover a mutual match and turn both sides into a chat, and either way it
-- takes every third party who was watching off their card. All of that is rows.
--
-- _kick_page1_at was a loop rewriting everyone's page1 by hand; it is one UPDATE
-- over the relations naming that user as target — the same people, and it cannot
-- miss one. It keeps the half that is easy to lose: a third party who was
-- WAITING had a credit on hold, and being kicked gives it back.
--
-- The mutual branch is where the 2026-08-02 bug lived: both sides went to chat
-- but the loser's page2 kept its stale watcher array, so a matched user stayed
-- findable, visible and invitable during the conversation. Verified after this:
-- two rows go to 'chat', two boards follow, nobody is left visible, the card
-- carries no distance, and the held credit comes back.

CREATE OR REPLACE FUNCTION public._watch_flags_tg()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.seeking := COALESCE(NEW.relations->'page1'->>'state','free') = 'free';
  NEW.discoverable := NOT (
    COALESCE(NEW.relations->'page2'->>'state','free') = 'locked'
    AND NOT (NEW.relations->'page2' ? 'message')
  );
  RETURN NEW;
END;
$function$;

UPDATE public.users SET discoverable = NOT (
  COALESCE(relations->'page2'->>'state','free') = 'locked'
  AND NOT (relations->'page2' ? 'message'))
WHERE discoverable IS DISTINCT FROM NOT (
  COALESCE(relations->'page2'->>'state','free') = 'locked'
  AND NOT (relations->'page2' ? 'message'));

CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- a kicked INVITER gets his held credit back
  UPDATE public.users u
  SET relations = public._credits_refund(u.relations, public._credits_cost('invite'))
  FROM public.watch w
  WHERE w.target_id = _kick_page1_at.target_id
    AND w.state = 'invited'
    AND (exclude_id IS NULL OR w.watcher_id <> exclude_id)
    AND u.user_id = w.watcher_id;

  RETURN QUERY
  UPDATE public.watch w SET
    state = 'ended', ended_at = now(), watcher_reason = msg,
    watcher_cleared_at = NULL, updated_at = now()
  WHERE w.target_id = _kick_page1_at.target_id
    AND w.state IN ('watching', 'invited')
    AND (exclude_id IS NULL OR w.watcher_id <> exclude_id)
  RETURNING w.watcher_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row public.users; target_row public.users; v_target uuid;
  v_invited timestamptz := now(); v_expires timestamptz := now() + interval '10 minutes';
  dist_m int; result_user json; notify jsonb := '[]'::jsonb; kicked uuid; mutual boolean;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT w.target_id INTO v_target FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state = 'watching';
  IF v_target IS NULL THEN RETURN jsonb_build_object('error','not_watching'); END IF;

  PERFORM 1 FROM public.users u
  WHERE u.user_id = me_id OR u.user_id = v_target
     OR u.user_id IN (SELECT w.watcher_id FROM public.watch w
                      WHERE w.target_id IN (me_id, v_target) AND w.state IN ('watching','invited'))
  ORDER BY u.user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  SELECT * INTO target_row FROM public.users WHERE user_id = v_target;

  IF public._credits_total(me_row.relations) < public._credits_cost('invite') THEN
    RETURN jsonb_build_object('error','no_credits');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.watch w
                 WHERE w.watcher_id = me_id AND w.target_id = v_target AND w.state='watching')
     OR NOT target_row.discoverable
     OR EXISTS (SELECT 1 FROM public.watch w
                WHERE w.target_id = v_target AND w.state IN ('invited','chat') AND w.watcher_id <> me_id) THEN
    UPDATE public.watch w SET state='ended', ended_at=now(), watcher_reason='invite',
      watcher_cleared_at=NULL, updated_at=now()
    WHERE w.watcher_id = me_id AND w.target_id = v_target;
    PERFORM public._watch_project(ARRAY[me_id, v_target]);
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code','invite-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR target_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography,
                                target_row.location::extensions.geography)::int END;

  mutual := EXISTS (SELECT 1 FROM public.watch w
                    WHERE w.watcher_id = v_target AND w.target_id = me_id AND w.state='invited');

  IF mutual THEN
    UPDATE public.watch w SET state='chat', ended_at=NULL, watcher_reason=NULL, target_reason=NULL,
      invited_at=NULL, expires_at=NULL, extended=false,
      watcher_slot_at=now(), target_slot_at=now(),
      watcher_cleared_at=NULL, target_cleared_at=NULL, updated_at=now()
    WHERE (w.watcher_id = me_id AND w.target_id = v_target)
       OR (w.watcher_id = v_target AND w.target_id = me_id);

    UPDATE public.users SET relations = public._credits_refund(relations, public._credits_cost('invite'))
    WHERE user_id = v_target;
    UPDATE public.users SET discoverable = false WHERE user_id IN (me_id, v_target);

    FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, v_target, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code','kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_page1_at(v_target, me_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code','kick-match'));
    END LOOP;

    PERFORM public._watch_project(ARRAY[me_id, v_target]);
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id,   'code','match'));
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', v_target,'code','match'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.watch w SET state='invited',
    invited_at=v_invited, expires_at=v_expires, extended=false,
    ended_at=NULL, watcher_reason=NULL, watcher_cleared_at=NULL,
    target_reason=NULL, target_cleared_at=NULL,
    watcher_slot_at=now(), target_slot_at=now(), updated_at=now()
  WHERE w.watcher_id = me_id AND w.target_id = v_target;

  UPDATE public.users SET relations = public._credits_hold(relations, public._credits_cost('invite'))
  WHERE user_id = me_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(v_target, me_id, 'invite') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code','kick-invitee'));
  END LOOP;

  PERFORM public._watch_project(ARRAY[me_id, v_target]);
  notify := notify || jsonb_build_array(jsonb_build_object('user_id', v_target, 'code','invite-in'));
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_cancel(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_target uuid; v_exp timestamptz; notify jsonb; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT w.target_id, w.expires_at INTO v_target, v_exp
  FROM public.watch w WHERE w.watcher_id = me_id AND w.state='invited';

  IF v_target IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.watch w WHERE w.watcher_id = me_id AND w.watcher_slot_at IS NOT NULL) THEN
      RETURN jsonb_build_object('error','not_waiting');
    END IF;
    RETURN jsonb_build_object('error','no_target');
  END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, v_target) ORDER BY user_id FOR UPDATE;

  -- already expired -> the expire landing, not a cancel (unchanged). That helper
  -- still writes boards; the sync records it, which is why both paths coexist.
  IF v_exp <= now() THEN
    notify := public._expire_invite_pair(me_id, v_target);
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.watch w SET
    state='ended', ended_at=now(),
    watcher_reason=NULL, watcher_slot_at=NULL,
    target_reason='cancel', target_cleared_at=NULL, target_slot_at=now(),
    updated_at=now()
  WHERE w.watcher_id = me_id AND w.target_id = v_target;

  UPDATE public.users SET relations = public._credits_clear_hold(relations, public._credits_cost('invite'))
  WHERE user_id = me_id;

  PERFORM public._add_restriction(me_id, v_target, 'cancel');
  PERFORM public._watch_project(ARRAY[me_id, v_target]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', v_target, 'code','cancelled-in')));
END;
$function$;
