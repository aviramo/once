-- The projection moves onto `watch`, and the first two writers come over.
--
-- CONSOLIDATED (applied as two migrations: the trigger, then the two functions).
--
-- WHY THE TRIGGER MOVES. Until now the projection fired from the users trigger,
-- so it only ever ran when somebody wrote a BOARD. A function converted to write
-- `watch` and nothing else would have updated the relation and left both boards
-- untouched. Hanging the projection on the table it projects FROM means a writer
-- no longer has to know it exists — which is the property that lets the
-- thirty-four come over one at a time instead of all at once.
--
-- One projection point now, for both kinds of writer:
--   unconverted   RPC -> users -> sync -> watch -> project -> users (guarded)
--   converted     RPC -> watch -> project -> users (guarded)
--
-- No loop either way: the projection writes `users` at depth 2, where
-- users_watch_sync's guard stops it, and the sync writes `watch` at depth 2,
-- where this trigger's guard stops a second projection of the same change.
--
-- THE FIRST TWO. Dismissing a card is a fact about the RELATION — "I have read
-- this" — so it is written there and the board follows. These are the smallest
-- transitions in the system and they make the pattern plain: the function states
-- what happened between two people and says nothing at all about page1 or page2.
-- Each side's dismissal is its own stamp, because app_clear1 and app_clear2 are
-- independent actions and either end can put its card away while the other still
-- stands.
--
-- Behaviour is unchanged: before this, app_clear1 wrote the board and the sync
-- inferred the stamp from it; now the stamp is written directly and the board is
-- projected. Same end state, one less round trip, one less place to disagree.
-- Verified: a card raised on both sides, then cleared from both — no messages
-- left, the cards themselves still on their boards (the post-clear1 shape), and
-- zero mismatches against the projection.

CREATE OR REPLACE FUNCTION public._watch_project_tg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- depth 1 = a writer touched `watch` directly. Deeper than that and we are
  -- inside the sync, which projects for itself.
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public._watch_project(ARRAY[OLD.watcher_id, OLD.target_id]);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public._watch_project(ARRAY[NEW.watcher_id, NEW.target_id]);
  ELSE
    PERFORM public._watch_project(ARRAY[NEW.watcher_id, NEW.target_id,
                                        OLD.watcher_id, OLD.target_id]);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS watch_project ON public.watch;
CREATE TRIGGER watch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.watch
  FOR EACH ROW
  EXECUTE FUNCTION public._watch_project_tg();

REVOKE ALL ON FUNCTION public._watch_project_tg() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_clear1(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  UPDATE public.watch SET watcher_cleared_at = now(), updated_at = now()
  WHERE watcher_id = me_id
    AND watcher_slot_at IS NOT NULL
    AND state = 'ended'
    AND watcher_reason IS NOT NULL
    AND watcher_cleared_at IS NULL;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_clear2(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  UPDATE public.watch SET target_cleared_at = now(), updated_at = now()
  WHERE target_id = me_id
    AND target_slot_at IS NOT NULL
    AND state = 'ended'
    AND target_reason IS NOT NULL
    AND target_cleared_at IS NULL;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;
