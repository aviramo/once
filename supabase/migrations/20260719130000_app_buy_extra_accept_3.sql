-- app_buy_extra: accept the option set the client/edge actually offer.
-- The mobile BuyExtraPopup and the /app/buy_extra dispatcher have offered
-- {3, 10, 50} since buy_extra shipped (2026-06-01), but this RPC still
-- validated the pre-launch {5, 10, 50} set. Buying the only ENABLED option
-- (3) therefore always failed with bad_count / HTTP 400.
CREATE OR REPLACE FUNCTION public.app_buy_extra(me_id uuid, p_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cnt       int := COALESCE(p_count, 0);
  result_user json;
BEGIN
  IF v_cnt NOT IN (3, 10, 50) THEN
    RETURN jsonb_build_object('error', 'bad_count');
  END IF;

  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  UPDATE public.users
  SET relations = jsonb_set(
    public._credits_ensure(relations),
    '{credits,extra}',
    to_jsonb(COALESCE((public._credits_ensure(relations)->'credits'->>'extra')::int, 0) + v_cnt))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;
