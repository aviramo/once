-- After declining an incoming invitation, the decliner returns to free.
-- Previously app_decline left the decliner's page2 in
-- {state: 'locked', profile: <inviter>} (no message), which made them
-- invisible to new finds until they tapped "Back to the game" (free2).
-- Product policy is users return to free as soon as a page2 process
-- ends, unless they explicitly hid via lock2 — so the decline path now
-- flips page2 to {state: 'free', profiles: []} in the same UPDATE.

CREATE OR REPLACE FUNCTION public.app_decline(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  inviter_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;
  inviter_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, inviter_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'decline')
  ) WHERE user_id = inviter_id
    AND relations->'page1'->>'state' = 'waiting'
    AND relations->'page1'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, inviter_id, 'decline');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'declined')));
END;
$$;
