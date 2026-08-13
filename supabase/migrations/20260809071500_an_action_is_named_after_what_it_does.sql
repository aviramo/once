-- AN ACTION IS NAMED AFTER WHAT IT DOES, NEVER AFTER WHICH BOARD IT WROTE
--
-- `clear1` / `clear2` / `free2` / `lock2` are the last four names in the system
-- carrying a BOARD NUMBER. page1 and page2 are an internal data-model term --
-- CLAUDE.md has said so for months, and the whole `watch` table exists to
-- replace them -- so an endpoint whose name is the number is a name that will
-- outlive the thing it refers to, and that meanwhile tells a reader nothing:
-- `clear1` and `clear2` are two different actions with one word between them,
-- and the admin console had to translate BOTH of them to the same sentence
-- ("dismissed a system message") because their names could not tell them apart.
--
--   clear1 -> clear_watch    I have read the card about the person I watched
--   clear2 -> clear_invite   I have read the card about the invitation I got
--   free2  -> show_me        show me to people again
--   lock2  -> hide_me        hide me from everyone
--
-- The two clears keep the verb the DB itself already uses: their whole effect
-- is a `*_cleared_at` stamp, and the side is now said in the name instead of in
-- a number (`watcher_cleared_at` <- clear_watch, `target_cleared_at` <-
-- clear_invite).
--
-- EXPAND, not rename: `/app/clear1` is on the wire, and the published build
-- posts it. The old four names stay as one-line wrappers so nothing can be
-- broken by the order in which the migration and the function deploy land, and
-- the edge function keeps accepting the old PATHS for as long as an old build
-- is out there (see BACKWARD_COMPAT.md). Each body lives in exactly one place,
-- under the new name.

-- ── clear_watch (was app_clear1) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_clear_watch(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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

-- ── clear_invite (was app_clear2) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_clear_invite(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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

-- ── show_me (was app_free2) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_show_me(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result_user json;
BEGIN
  -- not while a chat has the board (unchanged precondition)
  IF EXISTS (SELECT 1 FROM public.watch
             WHERE state = 'chat' AND (watcher_id = me_id OR target_id = me_id)) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
  END IF;

  -- opening the board dismisses whatever it was showing
  UPDATE public.watch SET target_cleared_at = now(), updated_at = now()
  WHERE target_id = me_id AND state = 'ended'
    AND target_slot_at IS NOT NULL AND target_cleared_at IS NULL;

  UPDATE public.users SET discoverable = true WHERE user_id = me_id AND NOT discoverable;

  PERFORM public._watch_project(ARRAY[me_id]);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$function$;

-- ── hide_me (was app_lock2) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_hide_me(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  result_user json;
  notify      jsonb := '[]'::jsonb;
  w           uuid;
  watchers    uuid[];
BEGIN
  IF NOT COALESCE((SELECT discoverable FROM public.users WHERE user_id = me_id), false) THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT COALESCE(array_agg(watcher_id), '{}'::uuid[]) INTO watchers
  FROM public.watch WHERE target_id = me_id AND state = 'watching';

  PERFORM 1 FROM public.users WHERE user_id = ANY(ARRAY[me_id] || watchers) ORDER BY user_id FOR UPDATE;

  -- every watch on me ends, and each watcher is told the same word as before
  UPDATE public.watch SET
    state = 'ended', ended_at = now(), watcher_reason = 'remove',
    watcher_cleared_at = NULL, updated_at = now()
  WHERE target_id = me_id AND state = 'watching';

  IF array_length(watchers, 1) IS NOT NULL THEN
    FOREACH w IN ARRAY watchers LOOP
      PERFORM public._add_restriction(me_id, w, 'remove');
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', w, 'code', 'removed'));
    END LOOP;
  END IF;

  UPDATE public.users
  SET discoverable = false, relations = relations - 'last_add_at'
  WHERE user_id = me_id;

  PERFORM public._watch_project(ARRAY[me_id] || watchers);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- ── The four old names, now one line each ──────────────────────────────────
-- Kept only so that the migration and the edge-function deploy may land in
-- either order, and so a direct caller that predates the rename still works.
-- They hold no behaviour of their own -- delete them with their
-- BACKWARD_COMPAT.md entry.
CREATE OR REPLACE FUNCTION public.app_clear1(me_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'extensions'
AS $function$ SELECT public.app_clear_watch(me_id) $function$;

CREATE OR REPLACE FUNCTION public.app_clear2(me_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'extensions'
AS $function$ SELECT public.app_clear_invite(me_id) $function$;

CREATE OR REPLACE FUNCTION public.app_free2(me_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'extensions'
AS $function$ SELECT public.app_show_me(me_id) $function$;

CREATE OR REPLACE FUNCTION public.app_lock2(me_id uuid)
 RETURNS jsonb LANGUAGE sql SET search_path TO 'public', 'extensions'
AS $function$ SELECT public.app_hide_me(me_id) $function$;

-- The new names take exactly the ACL the old ones carry -- a rename may not be
-- a permission change.
GRANT EXECUTE ON FUNCTION public.app_clear_watch(uuid)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_clear_invite(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_show_me(uuid)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_hide_me(uuid)      TO anon, authenticated, service_role;
