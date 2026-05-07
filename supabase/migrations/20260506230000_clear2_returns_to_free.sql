-- app_clear2: returning to free instead of just clearing message.
-- Previously clear2 would clear page2.message but leave state=locked,
-- requiring a follow-up free2 to make the user discoverable. Under the
-- "users auto-return to free at the end of every page2 process unless
-- they explicitly hid" policy this endpoint now flips page2 all the way
-- back to {state: 'free', profiles: []} when there's a message to clear.
-- The explicit-hide case (locked + no message) is intentionally not
-- touched: those users must tap "Show my profile" (free2) to come out.

CREATE OR REPLACE FUNCTION public.app_clear2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
  ) WHERE user_id = me_id
    AND relations->'page2'->>'state' = 'locked'
    AND relations->'page2' ? 'message';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;
