-- The inviter's held credit is CONSUMED on a match, not refunded.
--
-- app_invite holds 1 credit (_credits_hold: it leaves balance/extra and parks
-- in held/held_extra). Until now the hold came back on every terminal outcome
-- EXCEPT a self-cancel — including a successful match, which meant a chat cost
-- the system exactly one credit (the approver's) and inviting was free as long
-- as it ended in a match, a decline or an expiry.
--
-- Intended rule (user directive 2026-07-29): the invite's credit is returned
-- ONLY when the invitation dies without a chat — expiry, decline, or being
-- kicked because the target matched someone else. The moment the invitation is
-- ACCEPTED the credit is spent, so a chat costs one credit on each side.
--
-- Only the inviter branch changes: _credits_refund -> _credits_clear_hold
-- (same helper app_cancel already uses; drops held + held_extra without
-- returning anything to balance/extra). Note _credits_refund also cleared
-- `unpaid_at`; clear_hold deliberately does not — no funding happened here, so
-- an unpaid user stays unpaid until a real credit arrives.
--
-- No client-visible shape change: the mobile wallet never displays `held` (the
-- spend already left balance when the invite was sent), so old builds simply
-- stop seeing a credit reappear at match time. Nothing for BACKWARD_COMPAT.md.

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
  v_approve_cost int;
  v_broke        boolean;
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

  -- "Pressed approve on a live invitation and could not pay for it."
  v_broke :=
        me_row.relations->'page2'->>'state' = 'pending'
    AND (me_row.relations->'page2'->'profile'->>'user_id')::uuid = inviter_id
    AND (me_row.relations->'page2'->>'expires_at')::timestamptz > now()
    AND public._credits_total(me_row.relations) < v_approve_cost
    AND COALESCE((me_row.relations->'credits'->>'held')::int, 0) = 0;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_total(me_row.relations) < v_approve_cost THEN

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

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m, me_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_row.relations, v_approve_cost)->'credits'
  ) WHERE user_id = me_id;

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

GRANT EXECUTE ON FUNCTION public.app_approve(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.app_approve(uuid) FROM PUBLIC, anon, authenticated;
