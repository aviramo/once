-- ── app_expire_sweep: restore actor_id on expire pushes ───────────────────
-- Regression introduced by state_machine_v3 (20260429120000) — the first
-- migration that added actor_id to the expire notify entries
-- (20260428130000_expire_sweep_actor_id) was wholesale-replaced and the
-- actor_id was dropped. Every subsequent rewrite (credits, hold removal)
-- preserved the regression. Net effect: expired-out / expired-in arrive
-- with title="Once" because ext/firePush has no actor_id to look up the
-- other user's name. Re-add actor_id on both passes. Pass 2's inviter_id
-- may be NULL (the inviter already left waiting); jsonb_build_object writes
-- "actor_id": null which ext/firePush treats as no-actor (title falls back
-- to "Once" only in that edge case). Behaviour-preserving on the cron's
-- success path; just attaches the missing piece for the lookup.

CREATE OR REPLACE FUNCTION public.app_expire_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
      public._page1_locked(relations->'page1'->'profile', 'expire')
    ) WHERE user_id = inviter_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = invitee_id
      AND relations->'page2'->>'state' = 'pending'
      AND relations->'page2'->'profile'->>'user_id' = inviter_id::text;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'actor_id', invitee_id, 'code', 'expired-out'))
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'actor_id', inviter_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  FOR row_rec IN
    SELECT user_id, relations->'page2'->'profile'->>'user_id' AS inviter
    FROM public.users
    WHERE relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->>'expires_at')::timestamptz <= now()
  LOOP
    invitee_id := row_rec.user_id;
    inviter_id := NULLIF(row_rec.inviter, '')::uuid;

    PERFORM 1 FROM public.users
    WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[invitee_id, inviter_id]) x WHERE x IS NOT NULL))
    ORDER BY user_id FOR UPDATE;

    IF (SELECT relations->'page2'->>'state' FROM public.users WHERE user_id = invitee_id) <> 'pending'
       OR (SELECT (relations->'page2'->>'expires_at')::timestamptz FROM public.users WHERE user_id = invitee_id) > now() THEN
      CONTINUE;
    END IF;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = invitee_id;

    IF inviter_id IS NOT NULL THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'expire')
      ) WHERE user_id = inviter_id
        AND relations->'page1'->>'state' = 'waiting'
        AND relations->'page1'->'profile'->>'user_id' = invitee_id::text;
    END IF;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'actor_id', inviter_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$function$;
