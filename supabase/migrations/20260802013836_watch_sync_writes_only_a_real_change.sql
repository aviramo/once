-- Do not rewrite a board that did not change.
--
-- The viewer-list recompute fired an UPDATE on the WATCHED person's row on every
-- page1 change, whether or not the list came out different — and `users` is in
-- the Realtime publication, so each of those was a wasted event delivered to
-- that person's device, plus the WAL behind it. It is also noise on the row of
-- somebody who is not the one who acted: the watcher's own row is written by the
-- RPC as it always was, and only the target's is touched here.
--
-- Measured before: replaying the current state through the sync rewrote a target
-- row that had nothing new in it. Measured after: zero rewrites on a replay, and
-- a real change still propagates — a watcher dropped off his target and that
-- target's list went 1 -> 0 with the row rewritten, so the event still fires
-- exactly when there is something to say.
--
-- (`public.watch` is deliberately NOT in the publication, so it produces no
-- Realtime traffic of its own.)

CREATE OR REPLACE FUNCTION public._watch_sync(p_watcher uuid, p_old_page1 jsonb, p_new_page1 jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  old_target uuid := NULLIF(p_old_page1->'profile'->>'user_id','')::uuid;
  new_target uuid := NULLIF(p_new_page1->'profile'->>'user_id','')::uuid;
  new_state  text := COALESCE(p_new_page1->>'state','free');
  mapped     text;
  t          uuid;
  fresh      jsonb;
BEGIN
  mapped := CASE new_state
    WHEN 'watching' THEN 'watching' WHEN 'waiting' THEN 'invited'
    WHEN 'chat' THEN 'chat' ELSE NULL END;

  IF old_target IS NOT NULL AND old_target IS DISTINCT FROM new_target THEN
    UPDATE public.watch SET
      state = 'ended',
      ended_at = COALESCE(ended_at, now()),
      watcher_reason = COALESCE(watcher_reason, NULLIF(p_new_page1->>'message','')),
      updated_at = now()
    WHERE watcher_id = p_watcher AND target_id = old_target AND state <> 'ended';
  END IF;

  IF new_target IS NOT NULL THEN
    INSERT INTO public.watch (
      watcher_id, target_id, state, invited_at, expires_at, extended,
      ended_at, watcher_reason, watcher_cleared_at, watcher_slot_at, target_slot_at, target_profile_last)
    VALUES (
      p_watcher, new_target, COALESCE(mapped,'ended'),
      NULLIF(p_new_page1->>'invited_at','')::timestamptz,
      NULLIF(p_new_page1->>'expires_at','')::timestamptz,
      COALESCE((p_new_page1->>'extended')::boolean, false),
      CASE WHEN mapped IS NULL THEN now() END,
      CASE WHEN mapped IS NULL THEN NULLIF(p_new_page1->>'message','') END,
      CASE WHEN mapped IS NULL AND NULLIF(p_new_page1->>'message','') IS NULL THEN now() END,
      now(),
      CASE WHEN mapped IS NOT NULL THEN now() END,
      p_new_page1->'profile')
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state          = EXCLUDED.state,
      invited_at     = EXCLUDED.invited_at,
      expires_at     = EXCLUDED.expires_at,
      extended       = EXCLUDED.extended,
      ended_at       = CASE WHEN EXCLUDED.state = 'ended' THEN COALESCE(public.watch.ended_at, now()) END,
      watcher_reason = CASE WHEN EXCLUDED.state = 'ended' THEN EXCLUDED.watcher_reason END,
      target_reason  = CASE WHEN EXCLUDED.state = 'ended' THEN public.watch.target_reason END,
      watcher_cleared_at = EXCLUDED.watcher_cleared_at,
      watcher_slot_at    = now(),
      target_slot_at     = CASE WHEN EXCLUDED.state <> 'ended' THEN now() ELSE public.watch.target_slot_at END,
      target_profile_last = COALESCE(EXCLUDED.target_profile_last, public.watch.target_profile_last),
      updated_at     = now();
  END IF;

  FOREACH t IN ARRAY ARRAY[old_target, new_target] LOOP
    CONTINUE WHEN t IS NULL;

    SELECT COALESCE((
      SELECT jsonb_agg(public._watch_profile(v.user_id, t, false, true, null) ORDER BY v.user_id)
      FROM public.users v
      WHERE v.relations->'page1'->>'state' = 'watching'
        AND (v.relations->'page1'->'profile'->>'user_id')::uuid = t
    ), '[]'::jsonb) INTO fresh;

    UPDATE public.users
    SET relations = jsonb_set(relations, '{page2,profiles}', fresh)
    WHERE user_id = t
      AND relations->'page2'->>'state' = 'free'
      -- a board that did not change is not rewritten, so it does not cost the
      -- person a Realtime event about nothing
      AND relations->'page2'->'profiles' IS DISTINCT FROM fresh;
  END LOOP;
END;
$function$;
