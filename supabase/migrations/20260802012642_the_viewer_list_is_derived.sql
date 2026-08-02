-- The viewer list stops being written and starts being derived.
--
-- "Who is looking at me" is the other side of every watcher's own page1, and
-- page1 is the reliable side: it is the watcher's own state, written by his own
-- action. page2.profiles[] was a mirror maintained by hand in half a dozen
-- places, and where the two disagreed the mirror was wrong — live, a real user's
-- whole profile (name, bio, four photos) sat in another real user's viewer list
-- three weeks after she stopped watching him, because _expire_watch_one's
-- detach-the-other-side half is conditional on `p_target IS NOT NULL`. Her card
-- was being counted to him by the dock's preferences key and the visibility row.
--
-- Two parts, doing different jobs:
--   * the TRIGGER stops new ones being created. Proven idempotent against every
--     live board first — fed each user's own current page1 as both sides, zero
--     boards moved — so attaching it could not disturb anything.
--   * the SWEEP removes the ones already there. The trigger alone cannot: a
--     stale watcher points at nobody, so nothing he ever does touches the board
--     he is stuck on.
--
-- The trigger fires only when page1 changes, and writes only `watch` (which has
-- no trigger) and other users' page2.profiles (their page1 is unchanged, so the
-- WHEN clause is false and it cannot re-fire). No loop is possible; the
-- pg_trigger_depth guard is belt and braces.
--
-- Verified after applying: 0 ghosts left, 0 watchers lost, and app_find on the
-- test partition grew `watch` by itself.

CREATE OR REPLACE FUNCTION public._watch_sync_tg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM public._watch_sync(NEW.user_id, OLD.relations->'page1', NEW.relations->'page1');
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS users_watch_sync ON public.users;
CREATE TRIGGER users_watch_sync
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.relations->'page1' IS DISTINCT FROM NEW.relations->'page1')
  EXECUTE FUNCTION public._watch_sync_tg();

-- One-time sweep: every free board's viewer list becomes exactly the set of
-- users whose own page1 says they are watching it. Anything else was a ghost.
UPDATE public.users t SET relations = jsonb_set(
  t.relations, '{page2,profiles}',
  COALESCE((
    SELECT jsonb_agg(public._watch_profile(v.user_id, t.user_id, false, true, null) ORDER BY v.user_id)
    FROM public.users v
    WHERE v.relations->'page1'->>'state' = 'watching'
      AND (v.relations->'page1'->'profile'->>'user_id')::uuid = t.user_id
  ), '[]'::jsonb))
WHERE t.relations->'page2'->>'state' = 'free';
