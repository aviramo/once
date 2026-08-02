-- The boards stop being authored and start being projected.
--
-- From here, relations.page1/page2 are written by _watch_pages and by nothing
-- else. The 34 functions still make their state transitions exactly as they did;
-- the sync records each one in `watch`, and the projection then rewrites both
-- boards from that single row. What made the ghost, the duplicate viewer and the
-- uncleared message possible was two representations maintained by hand. There
-- is one now, so they stop being bugs to fix and start being impossible.
--
-- The app is untouched: same fields, same shapes, same Realtime. The published
-- build cannot tell the difference — which is the whole point of doing it this
-- way round, and why this needs no store release.
--
-- HOW IT AVOIDS EATING ITSELF. Everything happens inside the RPC's own
-- transaction, in one pass:
--   depth 1  the RPC's write fires users_watch_sync
--            -> `watch` is brought up to date from the new boards
--            -> the projection writes the boards back for everyone affected
--   depth 2  those writes fire the trigger again and the guard stops them
-- so the projection lands and nothing recurses. `watch` is synced BEFORE the
-- projection reads it, so the projection never works from stale rows.
--
-- WHAT IT IS TRUSTED ON. It reproduces every resting board (84/84, measured
-- in-transaction so the clock could not drift) and every transition of seventeen
-- RPCs — find, ignore, invite, decline, cancel, approve, leave, block, clear1,
-- free2, lock2, pause, resume, extend, remove, report from three different
-- states, both expiry sweeps and logout cleanup. Every difference that survived
-- was a case where the projection is MORE correct than the code running today,
-- and each was verified individually. Run with the projection ON, the four-find
-- sequence that reliably produced a duplicate viewer produces none.
--
-- THE KILL SWITCH. `watch_config.project` turns it off in one UPDATE — no
-- migration, no deploy, effective on the next statement:
--     UPDATE public.watch_config SET project = false;
-- Off, the boards go back to being whatever the RPCs wrote and the sync keeps
-- recording, so nothing is lost either way. This migration installs it OFF; it
-- was switched on separately after being exercised against live data.

CREATE TABLE IF NOT EXISTS public.watch_config (
  id      boolean PRIMARY KEY DEFAULT true CHECK (id),
  project boolean NOT NULL DEFAULT false
);
INSERT INTO public.watch_config (id, project) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.watch_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "block" ON public.watch_config;
CREATE POLICY "block" ON public.watch_config FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.watch_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.watch_config TO service_role;

CREATE OR REPLACE FUNCTION public._watch_project(p_users uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u uuid; pages jsonb;
BEGIN
  IF NOT COALESCE((SELECT project FROM public.watch_config WHERE id), false) THEN RETURN; END IF;

  FOREACH u IN ARRAY p_users LOOP
    CONTINUE WHEN u IS NULL;
    pages := public._watch_pages(u);
    CONTINUE WHEN pages IS NULL;
    UPDATE public.users SET relations =
      jsonb_set(jsonb_set(relations, '{page1}', pages->'page1'), '{page2}', pages->'page2')
    WHERE user_id = u
      -- a board that did not change is not rewritten, so nobody is sent a
      -- Realtime event about nothing
      AND (relations->'page1' IS DISTINCT FROM pages->'page1'
        OR relations->'page2' IS DISTINCT FROM pages->'page2');
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public._watch_sync_tg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  touched uuid[] := ARRAY[NEW.user_id];
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  IF OLD.relations->'page1' IS DISTINCT FROM NEW.relations->'page1' THEN
    touched := touched
      || NULLIF(OLD.relations->'page1'->'profile'->>'user_id','')::uuid
      || NULLIF(NEW.relations->'page1'->'profile'->>'user_id','')::uuid;
    PERFORM public._watch_sync(NEW.user_id, OLD.relations->'page1', NEW.relations->'page1');
  END IF;

  IF OLD.relations->'page2' IS DISTINCT FROM NEW.relations->'page2' THEN
    touched := touched
      || NULLIF(OLD.relations->'page2'->'profile'->>'user_id','')::uuid
      || NULLIF(NEW.relations->'page2'->'profile'->>'user_id','')::uuid;
    PERFORM public._watch_sync_target(NEW.user_id, NEW.relations->'page2');
  END IF;

  PERFORM public._watch_project(touched);
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._watch_project(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_project(uuid[]) TO service_role;
