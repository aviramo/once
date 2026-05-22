-- app_cancel: block cancelling a sent invite when the inviter cannot afford it.
--
-- User decision 2026-05-22: cancelling an invitation must require the 1-heart
-- cost up front. Previously app_cancel had NO credit precondition — it relied
-- on _credits_charge flooring the balance at 0, so a 0-heart user could always
-- cancel (charged whatever they had, often 0). The user reported this as a
-- bug: with 0 hearts the cancel went through with no check. Per their decision
-- cancel is now blocked when balance < _credits_cost('cancel').
--
-- Consequence (intended, user-acknowledged): a 0-heart user who already sent
-- an invite stays in `waiting` until the invite expires (10 min) or the
-- invitee responds. Cancelling IS the exit, and it now costs a heart.
--
-- The mobile client gates the cancel-confirm popup on the same balance check
-- (it opens the not-enough-hearts explainer instead of the confirm popup).
-- This server precondition is the enforcement backstop — consistent with
-- app_add ('no_credits') and app_approve, which both enforce their credit
-- costs server-side.
--
-- Backward-compat: this TIGHTENS a precondition the deployed mobile build can
-- currently call successfully (a 0-heart cancel). An old build that hits the
-- new 400 'no_credits' degrades gracefully to exactly the intended behavior
-- (the cancel is blocked, the user stays in `waiting`); it just lacks the
-- explainer popup and briefly flickers the card. See BACKWARD_COMPAT.md.

CREATE OR REPLACE FUNCTION public.app_cancel(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row    public.users;
  target_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, target_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' <> 'waiting' THEN
    RETURN jsonb_build_object('error', 'not_waiting');
  END IF;

  -- Cancelling a sent invite costs 1 heart. A user who cannot afford it is
  -- blocked here — they stay in `waiting` until the invite expires or the
  -- invitee responds. The mobile client gates the confirm popup on the same
  -- check; this is the server-side enforcement backstop.
  IF public._credits_balance(me_row.relations) < public._credits_cost('cancel') THEN
    RETURN jsonb_build_object('error', 'no_credits');
  END IF;

  UPDATE public.users SET relations = public._credits_charge(jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  ), public._credits_cost('cancel')) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_locked(relations->'page2'->'profile', 'cancel')
  ) WHERE user_id = target_id
    AND relations->'page2'->>'state' = 'pending'
    AND relations->'page2'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, target_id, 'cancel');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'cancelled-in')));
END;
$function$;
