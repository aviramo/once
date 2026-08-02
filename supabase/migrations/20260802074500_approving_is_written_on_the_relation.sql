-- app_approve comes over — the biggest transition in the system.
--
-- It opens a chat on both sides, closes an invitation of MY own if I had one
-- standing, pays from the deposit when the wallet cannot, and takes every third
-- party off both cards. Every one of those rules is preserved exactly; what
-- changes is that they are stated about relations instead of about boards.
--
-- AND IT FIXES A BUG THE CODE ITSELF DOCUMENTED. The old body rebuilt
-- `relations` wholesale for both users — jsonb_build_object('page1',...,
-- 'page2',...) with credits set on top — which DROPPED availability, push,
-- last_add_at and communities from both of them on every match. app_invite's own
-- comment names it ("jsonb_set over the existing relations, rather than
-- app_approve's rebuild, so availability / push / last_add_at survive the
-- match"), so the mutual path was fixed and this one was left. Writing only
-- credits and the rows leaves everything else untouched by construction.
-- Verified after the conversion: zero users lose their communities on a match.
--
-- A chat needs a row in BOTH directions. The invitation only gives inviter->me,
-- so me->inviter is upserted alongside it — the same shape app_invite's mutual
-- branch produces, and the reason leaving a chat has two rows to end.
--
-- Verified end to end on the test partition, committed rather than rolled back:
-- two chat rows, two chat boards, nobody left visible, credits and the deposit
-- exactly as before, zero board mismatches.

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row public.users; inviter_row public.users;
  v_inviter uuid; v_old uuid; v_invitee uuid; v_exp timestamptz;
  dist_m int; result_user json; notify jsonb := '[]'::jsonb; kicked uuid;
  v_cost int; v_broke boolean; v_from_hold boolean; v_hold_live boolean; v_credits jsonb;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT w.watcher_id, w.expires_at INTO v_inviter, v_exp
  FROM public.watch w WHERE w.target_id = me_id AND w.state = 'invited';
  IF v_inviter IS NULL THEN RETURN jsonb_build_object('error','no_incoming'); END IF;

  SELECT w.target_id INTO v_old FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state IN ('watching','invited');

  PERFORM 1 FROM public.users u
  WHERE u.user_id IN (me_id, v_inviter)
     OR (v_old IS NOT NULL AND u.user_id = v_old)
     OR u.user_id IN (SELECT w.watcher_id FROM public.watch w
                      WHERE w.target_id IN (me_id, v_inviter) AND w.state IN ('watching','invited'))
  ORDER BY u.user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  v_cost := CASE
    WHEN COALESCE(NULLIF(me_row.relations->>'last_add_at','')::timestamptz
                    > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  v_hold_live := EXISTS (SELECT 1 FROM public.watch w WHERE w.watcher_id = me_id AND w.state='invited')
             AND public._credits_held(me_row.relations) >= public._credits_cost('invite');

  SELECT w.target_id INTO v_invitee FROM public.watch w
  WHERE w.watcher_id = me_id AND w.state='invited' AND w.target_id IS DISTINCT FROM v_inviter;

  v_from_hold := public._credits_total(me_row.relations) < v_cost
             AND public._credits_held(me_row.relations) >= v_cost;

  v_broke := v_exp > now()
         AND public._credits_total(me_row.relations) < v_cost
         AND NOT v_from_hold;

  IF v_exp <= now() OR (public._credits_total(me_row.relations) < v_cost AND NOT v_from_hold) THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      target_reason='approve', target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
    WHERE w.watcher_id = v_inviter AND w.target_id = me_id;

    IF v_broke THEN
      UPDATE public.users SET relations = public._credits_mark_unpaid(relations) WHERE user_id = me_id;
    END IF;

    PERFORM public._watch_project(ARRAY[me_id, v_inviter]);
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code','approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = v_inviter;
  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography,
                                inviter_row.location::extensions.geography)::int END;

  IF v_from_hold THEN
    v_credits := public._credits_clear_hold(me_row.relations, public._credits_cost('invite'));
  ELSE
    v_credits := public._credits_charge(me_row.relations, v_cost);
    IF v_hold_live THEN
      v_credits := public._credits_refund(v_credits, public._credits_cost('invite'));
    END IF;
  END IF;

  IF v_invitee IS NOT NULL THEN
    UPDATE public.watch w SET state='ended', ended_at=now(),
      watcher_reason=NULL, watcher_slot_at=NULL,
      target_reason='cancel', target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
    WHERE w.watcher_id = me_id AND w.target_id = v_invitee;
    IF FOUND THEN
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', v_invitee, 'code','cancelled-in'));
    END IF;
  END IF;

  UPDATE public.watch w SET state='ended', ended_at=now(), watcher_slot_at=NULL, updated_at=now()
  WHERE w.watcher_id = me_id AND w.state IN ('watching','invited');

  UPDATE public.watch w SET state='chat', ended_at=NULL, watcher_reason=NULL, target_reason=NULL,
    invited_at=NULL, expires_at=NULL, extended=false,
    watcher_slot_at=now(), target_slot_at=now(),
    watcher_cleared_at=NULL, target_cleared_at=NULL, updated_at=now()
  WHERE w.watcher_id = v_inviter AND w.target_id = me_id;

  INSERT INTO public.watch (watcher_id, target_id, state, watcher_slot_at, target_slot_at)
  VALUES (me_id, v_inviter, 'chat', now(), now())
  ON CONFLICT (watcher_id, target_id) DO UPDATE SET
    state='chat', ended_at=NULL, watcher_reason=NULL, target_reason=NULL,
    invited_at=NULL, expires_at=NULL, extended=false,
    watcher_slot_at=now(), target_slot_at=now(),
    watcher_cleared_at=NULL, target_cleared_at=NULL, updated_at=now();

  UPDATE public.users SET relations = jsonb_set(relations, '{credits}', v_credits->'credits'),
    discoverable = false
  WHERE user_id = me_id;

  -- the invitation was accepted: the inviter's hold is SPENT, not returned
  UPDATE public.users SET relations = jsonb_set(relations, '{credits}',
      public._credits_clear_hold(relations, public._credits_cost('invite'))->'credits'),
    discoverable = false
  WHERE user_id = v_inviter;

  FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, v_inviter, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code','kick-match'));
  END LOOP;
  FOR kicked IN SELECT * FROM public._kick_page1_at(v_inviter, me_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code','kick-match'));
  END LOOP;

  PERFORM public._watch_project(ARRAY[me_id, v_inviter, v_old, v_invitee]);
  notify := notify || jsonb_build_array(jsonb_build_object('user_id', v_inviter, 'code','match'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;
