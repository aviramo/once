-- A DEPOSIT PAYS FOR AN ACCEPT, AND IT STAYS SPENT (user directive 2026-07-31).
--
-- `credits.held` is a credit that has ALREADY left balance/extra: it went in
-- when I sent an invitation of my own and it sits with us until that
-- invitation resolves. With a daily pool of 1 (CREDIT_CAP) that is the whole
-- wallet, so a user who had invited somebody could not answer an invitation
-- that arrived while he waited: `_credits_total` is balance + extra and never
-- counts the deposit, so app_approve took the fail branch — page2 locked with
-- an 'approve' message and an approve-fail push — for a user who HAD paid,
-- and whose money we were holding.
--
-- So the accept may now be paid out of the deposit, and only when the wallet
-- cannot cover it (balance and extra are spent first, exactly as everywhere
-- else). It is spent with `_credits_clear_hold`, not refunded-then-charged:
-- the deposit stays with us, which is the same thing that happens to the
-- INVITER's deposit the moment his invitation is accepted (a chat costs one
-- credit on each side).
--
-- Accepting also ENDS an invitation of my own that was still waiting — I am
-- about to be in a chat, so the person I invited can no longer answer me. Two
-- things follow, and both are new here:
--   * that person's pending card lands on 'cancel', the same landing
--     app_cancel and app_report give it, with the same 'cancelled-in' push.
--     Without it he was left holding a live invitation from somebody already
--     in a chat, and answering it would have overwritten that chat.
--   * the deposit is resolved either way: spent when it paid for the accept,
--     REFUNDED when the wallet paid instead (an invitation that dies without
--     a chat gives its credit back — expiry, decline, the target matching
--     someone else, and now this). It used to be stranded: page1 was
--     overwritten to 'chat' and `held` stayed on the wallet forever.
--
-- Charge first, refund second: `_credits_refund` drops whatever overflows the
-- daily cap, so the deposit is returned into a pool the accept has just
-- emptied rather than against a full one.
--
-- Nothing on the wire changes shape: no new field, no new push code, no new
-- page2 message. Not a breaking change, so no BACKWARD_COMPAT entry.

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
  v_approve_cost  int;
  v_broke         boolean;
  v_pay_from_hold boolean;
  v_hold_live     boolean;
  v_my_invitee    uuid;
  v_credits       jsonb;
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

  v_approve_cost := CASE
    WHEN COALESCE(
           NULLIF(me_row.relations->>'last_add_at','')::timestamptz
             > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  -- A deposit of mine that is still live: I am waiting on an invitation of my
  -- own, and this accept is about to end it.
  v_hold_live :=
        me_row.relations->'page1'->>'state' = 'waiting'
    AND public._credits_held(me_row.relations) >= public._credits_cost('invite');

  -- Who is holding that invitation. Only the row we locked above is ever
  -- touched, and never the inviter (a mutual invite matches inside app_invite
  -- and never reaches here).
  v_my_invitee := CASE
    WHEN me_row.relations->'page1'->>'state' = 'waiting'
     AND (me_row.relations->'page1'->'profile'->>'user_id')::uuid = my_old_target
     AND my_old_target IS DISTINCT FROM inviter_id
    THEN my_old_target ELSE NULL END;

  -- The deposit pays only where the wallet cannot.
  v_pay_from_hold :=
        public._credits_total(me_row.relations) < v_approve_cost
    AND public._credits_held(me_row.relations) >= v_approve_cost;

  -- "Pressed approve on a live invitation and could not pay for it." A user
  -- whose deposit covers it HAS paid, so he is never stamped unpaid.
  v_broke :=
        me_row.relations->'page2'->>'state' = 'pending'
    AND (me_row.relations->'page2'->'profile'->>'user_id')::uuid = inviter_id
    AND (me_row.relations->'page2'->>'expires_at')::timestamptz > now()
    AND public._credits_total(me_row.relations) < v_approve_cost
    AND NOT v_pay_from_hold;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR (public._credits_total(me_row.relations) < v_approve_cost
         AND NOT v_pay_from_hold) THEN

    UPDATE public.users SET relations = jsonb_set(
      CASE WHEN v_broke THEN public._credits_mark_unpaid(relations) ELSE relations END,
      '{page2}',
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

  IF v_pay_from_hold THEN
    -- The deposit is the payment, and it stays with us.
    v_credits := public._credits_clear_hold(me_row.relations, public._credits_cost('invite'));
  ELSE
    v_credits := public._credits_charge(me_row.relations, v_approve_cost);
    -- The wallet paid, so my own invitation dies without a chat and its
    -- deposit comes back like any other death.
    IF v_hold_live THEN
      v_credits := public._credits_refund(v_credits, public._credits_cost('invite'));
    END IF;
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m, me_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    v_credits->'credits'
  ) WHERE user_id = me_id;

  -- The invitation I was still waiting on is over. Same landing as a cancel,
  -- because that is what it is.
  IF v_my_invitee IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'cancel')
    ) WHERE user_id = v_my_invitee
      AND relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->'profile'->>'user_id')::uuid = me_id;

    IF FOUND THEN
      notify := notify || jsonb_build_array(
        jsonb_build_object('user_id', v_my_invitee, 'code', 'cancelled-in'));
    END IF;
  END IF;

  -- The invitation was accepted: the inviter's hold is SPENT, not returned.
  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, inviter_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_clear_hold(relations, public._credits_cost('invite'))->'credits'
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
$function$;
