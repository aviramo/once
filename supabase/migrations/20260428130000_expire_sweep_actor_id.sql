-- Include actor_id in expire-sweep notify entries so the cron handler can
-- build a localized push (title = actor name, body = localized text).
CREATE OR REPLACE FUNCTION public.app_expire_sweep()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  row_rec         record;
  inviter_id      uuid;
  invitee_id      uuid;
  notify          jsonb := '[]'::jsonb;
  count_processed int := 0;
BEGIN
  FOR row_rec IN
    SELECT user_id, relations->'page1'->'profile'->>'user_id' AS target_id
    FROM public.users
    WHERE relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
  LOOP
    inviter_id := row_rec.user_id;
    invitee_id := row_rec.target_id::uuid;

    PERFORM 1 FROM public.users WHERE user_id IN (inviter_id, invitee_id) ORDER BY user_id FOR UPDATE;

    IF (SELECT relations->'page1'->>'state' FROM public.users WHERE user_id = inviter_id) <> 'waiting' THEN
      CONTINUE;
    END IF;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('profile', relations->'page1'->'profile', 'state', 'missed', 'event', 'expire')
    ) WHERE user_id = inviter_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      (relations->'page2') || jsonb_build_object('state', 'missed', 'event', 'expire')
    ) WHERE user_id = invitee_id
      AND jsonb_typeof(relations->'page2') = 'object'
      AND (relations->'page2'->>'user_id')::uuid = inviter_id;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'actor_id', invitee_id, 'code', 'expired-out'))
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'actor_id', inviter_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$$;
