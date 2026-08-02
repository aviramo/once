-- Signing out is a fact about the ACCOUNT, and a flag changing projects too.
--
-- CONSOLIDATED (the logout conversion, then the projection gap it exposed).
--
-- app_logout_cleanup wrote page2 = {state:'locked', message:'logout'} — a
-- message with no relation behind it, used as a MARKER: the edge function's
-- re-login reset reads it to tell "logged out" (comes back discoverable) from
-- "explicitly hid" (stays hidden across re-logins). The projection cannot carry
-- it, because there is no row to carry it on, so from the moment the projection
-- became authoritative that marker was being erased — a LIVE REGRESSION I had
-- introduced, and one that would have left a returning user permanently hidden.
-- Caught by running the real function and reading the board back: the message
-- was simply gone. The marker becomes the column it always was.
--
-- AND A FLAG CHANGING NOW PROJECTS. `seeking` and `discoverable` are two of the
-- three things a board is built from, but only a RELATION changing ever fired a
-- projection. A writer touching a flag alone — the re-login open-up is exactly
-- that — left the board saying the old thing: the account came back open in its
-- columns and stayed `locked` on its face.
--
-- app_logout_cleanup also rebuilt `relations` wholesale, the same data loss
-- app_approve had (availability, push, communities). Writing flags and rows
-- leaves them alone.
--
-- The edge function is deployed alongside this: its re-login reset reads
-- `signed_out` instead of the message, and sets the properties on the User
-- object rather than on db.new, because persist() builds its delta by diffing
-- the object against db.old and a write to db.new is never sent.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signed_out boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._kick_page2_pending_at(target_id uuid, exclude_id uuid, msg text)
 RETURNS TABLE(user_id uuid) LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.watch w SET
    state='ended', ended_at=now(),
    target_reason=msg, target_cleared_at=NULL, target_slot_at=now(), updated_at=now()
  WHERE w.watcher_id = _kick_page2_pending_at.target_id
    AND w.state='invited'
    AND (exclude_id IS NULL OR w.target_id <> exclude_id)
  RETURNING w.target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE me_row public.users; notify_list jsonb := '[]'::jsonb; vid uuid; touched uuid[];
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}'::uuid[]) INTO touched
  FROM (SELECT w.watcher_id x FROM public.watch w WHERE w.target_id = me_id AND w.state <> 'ended'
        UNION SELECT w.target_id FROM public.watch w WHERE w.watcher_id = me_id AND w.state <> 'ended') q;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY[me_id] || touched) ORDER BY user_id FOR UPDATE;

  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, 'logout') LOOP
    notify_list := notify_list || jsonb_build_array(jsonb_build_object('user_id', vid, 'code','left'));
  END LOOP;
  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, 'logout') LOOP
    notify_list := notify_list || jsonb_build_array(jsonb_build_object('user_id', vid, 'code','cancelled-in'));
  END LOOP;

  UPDATE public.watch w SET state='ended', ended_at=now(),
    watcher_reason=NULL, watcher_slot_at=NULL, updated_at=now()
  WHERE w.watcher_id = me_id AND w.state <> 'ended';

  -- logout is not a cancel: anything still held comes back
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  UPDATE public.users SET
    signed_out = true, seeking = false, discoverable = false,
    relations = jsonb_set(relations, '{credits}',
      public._credits_refund(me_row.relations,
        public._credits_held(public._credits_ensure(me_row.relations))::int)->'credits')
  WHERE user_id = me_id;

  PERFORM public._watch_project(ARRAY[me_id] || touched);
  RETURN jsonb_build_object('notify', notify_list);
END;
$function$;

CREATE OR REPLACE FUNCTION public._watch_flags_project_tg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM public._watch_project(ARRAY[NEW.user_id]);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS users_flags_project ON public.users;
CREATE TRIGGER users_flags_project
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.seeking IS DISTINCT FROM NEW.seeking
     OR OLD.discoverable IS DISTINCT FROM NEW.discoverable)
  EXECUTE FUNCTION public._watch_flags_project_tg();

REVOKE ALL ON FUNCTION public._watch_flags_project_tg() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE u uuid; BEGIN
  FOR u IN SELECT user_id FROM public.users LOOP
    PERFORM public._watch_project(ARRAY[u]);
  END LOOP;
END $$;
