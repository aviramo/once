-- ── leave/block: partner's page2 → free ──────────────────────────────────
-- After A leaves (or blocks) a chat, B's page1 was set to locked + message,
-- but B's page2 was left at locked-no-message (the resting state from
-- approve). That made B invisible to new finds until B manually tapped
-- "Back to the game" (free2). Product policy is that users should be
-- discoverable again the moment a chat ends, so we flip B.page2 to
-- {state: 'free', profiles: []} in the same UPDATE as the page1 lock.
-- The leaver A was already being reset to free in this same RPC; only B's
-- branch needed the addition.

CREATE OR REPLACE FUNCTION public.app_leave(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  partner_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'chat' THEN
    RETURN jsonb_build_object('error', 'not_in_chat');
  END IF;
  partner_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations =
    jsonb_set(
      jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked')),
      '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    )
  WHERE user_id = me_id;

  UPDATE public.users SET relations =
    jsonb_set(
      jsonb_set(
        relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'leave')
      ),
      '{page2}',
      jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    )
  WHERE user_id = partner_id
    AND relations->'page1'->>'state' = 'chat';

  PERFORM public._add_restriction(me_id, partner_id, 'leave');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$$;

CREATE OR REPLACE FUNCTION public.app_block(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row     public.users;
  partner_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'chat' THEN
    RETURN jsonb_build_object('error', 'not_in_chat');
  END IF;
  partner_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, partner_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.users SET relations =
    jsonb_set(
      jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked')),
      '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    )
  WHERE user_id = me_id;

  UPDATE public.users SET relations =
    jsonb_set(
      jsonb_set(
        relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'block')
      ),
      '{page2}',
      jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    )
  WHERE user_id = partner_id
    AND relations->'page1'->>'state' = 'chat';

  PERFORM public._add_restriction(me_id, partner_id, 'block');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', partner_id, 'code', 'left')));
END;
$$;
