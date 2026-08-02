-- Keeps `watch` in step with whatever a watcher's own page1 says, and recomputes
-- the viewer list of everyone he just left or joined.
--
-- Not attached to anything by this migration — the trigger is the next one, so
-- this could be exercised against live data first.

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
BEGIN
  mapped := CASE new_state
    WHEN 'watching' THEN 'watching'
    WHEN 'waiting'  THEN 'invited'
    WHEN 'chat'     THEN 'chat'
    ELSE NULL          -- free / locked: nothing live on this board
  END;

  -- Close the row this watcher has just moved off, if he moved.
  IF old_target IS NOT NULL AND old_target IS DISTINCT FROM new_target THEN
    UPDATE public.watch SET
      state = 'ended',
      ended_at = COALESCE(ended_at, now()),
      ended_reason = COALESCE(ended_reason, NULLIF(p_new_page1->>'message','')),
      updated_at = now()
    WHERE watcher_id = p_watcher AND target_id = old_target AND state <> 'ended';
  END IF;

  IF new_target IS NOT NULL THEN
    INSERT INTO public.watch (
      watcher_id, target_id, state, invited_at, expires_at, extended,
      ended_at, ended_reason, watcher_cleared_at, watcher_slot_at, target_slot_at, target_profile_last)
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
      state        = EXCLUDED.state,
      invited_at   = EXCLUDED.invited_at,
      expires_at   = EXCLUDED.expires_at,
      extended     = EXCLUDED.extended,
      ended_at     = CASE WHEN EXCLUDED.state = 'ended'
                          THEN COALESCE(public.watch.ended_at, now()) END,
      ended_reason = CASE WHEN EXCLUDED.state = 'ended' THEN EXCLUDED.ended_reason END,
      watcher_cleared_at = EXCLUDED.watcher_cleared_at,
      watcher_slot_at    = now(),
      target_slot_at     = CASE WHEN EXCLUDED.state <> 'ended'
                                THEN now() ELSE public.watch.target_slot_at END,
      target_profile_last = COALESCE(EXCLUDED.target_profile_last, public.watch.target_profile_last),
      updated_at   = now();
  END IF;

  -- Recompute the viewer list of everyone this watcher just left or joined.
  -- Only a FREE board carries one, which is the same guard _remove_from_profiles
  -- has always applied.
  FOREACH t IN ARRAY ARRAY[old_target, new_target] LOOP
    CONTINUE WHEN t IS NULL;
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2,profiles}',
      COALESCE((
        SELECT jsonb_agg(public._watch_profile(v.user_id, t, false, true, null) ORDER BY v.user_id)
        FROM public.users v
        WHERE v.relations->'page1'->>'state' = 'watching'
          AND (v.relations->'page1'->'profile'->>'user_id')::uuid = t
      ), '[]'::jsonb))
    WHERE user_id = t
      AND relations->'page2'->>'state' = 'free';
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public._watch_sync(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_sync(uuid, jsonb, jsonb) TO service_role;
