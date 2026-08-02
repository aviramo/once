-- Each side of an ended relation is told a different thing.
--
-- CONSOLIDATED. Applied live as four migrations (versions 20260802013232,
-- ...13312, ...13353, ...13506) — the split itself and three corrections it
-- exposed. Only the end state matters to a replay. The corrections, because each
-- is a trap worth not re-entering:
--
--   * renaming `ended_reason` to `watcher_reason` carried the TARGET's word to
--     the wrong side for every row the backfill had sourced from page2, which is
--     how 'cancel' — a word page1 never speaks — turned up in the watcher's
--     vocabulary. A row that is not on a side's board cannot be telling that
--     side anything.
--   * rows backfilled before the sync trigger existed could be live with no
--     watcher confirming them, and the replay could not reach those: a watcher
--     whose page1 points at nobody has no target to sync, so the loop never
--     touches the row he left behind. Live means the watcher says so.
--   * the target-side sync was an UPDATE, so it silently did nothing when no row
--     existed — which is exactly the case that matters, because the watcher's
--     page1 has usually been overwritten by then and the message in the target's
--     mailbox is the only surviving trace. Either side can be the last one
--     holding a relation, so either side must be able to create its row.
--
-- One `ended_reason` was wrong because the two boards speak different
-- vocabularies for the same event and always have: live, page1 carried
-- leave / expire / invite / approve / remove and page2 carried expire / cancel,
-- overlapping on exactly one word.
--
-- After this, public._watch_pages() reproduces EVERY live board exactly:
-- page1 84/84, page2 84/84, zero differences, measured in-transaction so the
-- clock could not drift.

ALTER TABLE public.watch RENAME COLUMN ended_reason TO watcher_reason;
ALTER TABLE public.watch ADD COLUMN IF NOT EXISTS target_reason text;

ALTER TABLE public.watch DROP CONSTRAINT IF EXISTS watch_ended_consistent;
ALTER TABLE public.watch ADD CONSTRAINT watch_ended_consistent CHECK (
  (state = 'ended' AND ended_at IS NOT NULL)
  OR (state <> 'ended' AND ended_at IS NULL AND watcher_reason IS NULL AND target_reason IS NULL)
);

UPDATE public.watch w
SET target_reason = NULLIF(u.relations->'page2'->>'message','')
FROM public.users u
WHERE u.user_id = w.target_id
  AND u.relations->'page2'->>'state' = 'locked'
  AND u.relations->'page2' ? 'message'
  AND (u.relations->'page2'->'profile'->>'user_id')::uuid = w.watcher_id;

-- a word belongs to the side whose board is showing the row
UPDATE public.watch SET watcher_reason = NULL WHERE watcher_slot_at IS NULL AND watcher_reason IS NOT NULL;
UPDATE public.watch SET target_reason  = NULL WHERE target_slot_at  IS NULL AND target_reason  IS NOT NULL;

-- live means the watcher's own page1 says so
UPDATE public.watch w SET
  state = 'ended', ended_at = COALESCE(w.ended_at, now()), watcher_slot_at = NULL, updated_at = now()
WHERE w.state <> 'ended'
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = w.watcher_id
      AND (u.relations->'page1'->'profile'->>'user_id')::uuid = w.target_id
      AND u.relations->'page1'->>'state' IN ('watching','waiting','chat'));

-- ── the target side of the sync, able to create its own row ────────────────
CREATE OR REPLACE FUNCTION public._watch_sync_target(p_target uuid, p_new_page2 jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  other uuid := NULLIF(p_new_page2->'profile'->>'user_id','')::uuid;
  st    text := COALESCE(p_new_page2->>'state','free');
  msg   text := NULLIF(p_new_page2->>'message','');
BEGIN
  IF other IS NULL OR other = p_target THEN RETURN; END IF;

  IF st = 'locked' AND msg IS NOT NULL THEN
    INSERT INTO public.watch (
      watcher_id, target_id, state, ended_at, target_reason, target_slot_at, watcher_profile_last)
    VALUES (other, p_target, 'ended', now(), msg, now(), p_new_page2->'profile')
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state             = 'ended',
      ended_at          = COALESCE(public.watch.ended_at, now()),
      target_reason     = EXCLUDED.target_reason,
      target_slot_at    = now(),
      target_cleared_at = NULL,
      watcher_profile_last = COALESCE(EXCLUDED.watcher_profile_last, public.watch.watcher_profile_last),
      updated_at        = now();

  ELSIF st = 'locked' AND msg IS NULL THEN
    UPDATE public.watch SET target_cleared_at = now(), updated_at = now()
    WHERE watcher_id = other AND target_id = p_target AND target_cleared_at IS NULL;

  ELSIF st = 'pending' THEN
    INSERT INTO public.watch (
      watcher_id, target_id, state, invited_at, expires_at, extended, target_slot_at, watcher_profile_last)
    VALUES (other, p_target, 'invited',
      COALESCE(NULLIF(p_new_page2->>'invited_at','')::timestamptz, now()),
      COALESCE(NULLIF(p_new_page2->>'expires_at','')::timestamptz, now()),
      COALESCE((p_new_page2->>'extended')::boolean, false),
      now(), p_new_page2->'profile')
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state          = 'invited',
      invited_at     = COALESCE(EXCLUDED.invited_at, public.watch.invited_at),
      expires_at     = COALESCE(EXCLUDED.expires_at, public.watch.expires_at),
      extended       = EXCLUDED.extended,
      ended_at       = NULL,
      watcher_reason = NULL,
      target_reason  = NULL,
      target_slot_at = now(),
      watcher_profile_last = COALESCE(EXCLUDED.watcher_profile_last, public.watch.watcher_profile_last),
      updated_at     = now();
  END IF;
END;
$function$;

-- ── the watcher side, with the renamed column ──────────────────────────────
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
      -- the target's word survives the watcher moving on: it is that side's own
      -- mailbox and only that side may clear it.
      target_reason  = CASE WHEN EXCLUDED.state = 'ended' THEN public.watch.target_reason END,
      watcher_cleared_at = EXCLUDED.watcher_cleared_at,
      watcher_slot_at    = now(),
      target_slot_at     = CASE WHEN EXCLUDED.state <> 'ended' THEN now() ELSE public.watch.target_slot_at END,
      target_profile_last = COALESCE(EXCLUDED.target_profile_last, public.watch.target_profile_last),
      updated_at     = now();
  END IF;

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
    WHERE user_id = t AND relations->'page2'->>'state' = 'free';
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public._watch_sync_tg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF OLD.relations->'page1' IS DISTINCT FROM NEW.relations->'page1' THEN
    PERFORM public._watch_sync(NEW.user_id, OLD.relations->'page1', NEW.relations->'page1');
  END IF;
  IF OLD.relations->'page2' IS DISTINCT FROM NEW.relations->'page2' THEN
    PERFORM public._watch_sync_target(NEW.user_id, NEW.relations->'page2');
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS users_watch_sync ON public.users;
CREATE TRIGGER users_watch_sync
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.relations->'page1' IS DISTINCT FROM NEW.relations->'page1'
     OR OLD.relations->'page2' IS DISTINCT FROM NEW.relations->'page2')
  EXECUTE FUNCTION public._watch_sync_tg();

-- every message already sitting in a mailbox with no row behind it
INSERT INTO public.watch (
  watcher_id, target_id, state, ended_at, target_reason, target_slot_at, watcher_profile_last)
SELECT (u.relations->'page2'->'profile'->>'user_id')::uuid, u.user_id, 'ended', now(),
       NULLIF(u.relations->'page2'->>'message',''), now(), u.relations->'page2'->'profile'
FROM public.users u
WHERE u.relations->'page2'->>'state' = 'locked'
  AND u.relations->'page2' ? 'message'
  AND (u.relations->'page2'->'profile'->>'user_id')::uuid IS DISTINCT FROM u.user_id
ON CONFLICT (watcher_id, target_id) DO UPDATE SET
  target_reason     = EXCLUDED.target_reason,
  target_slot_at    = COALESCE(public.watch.target_slot_at, now()),
  target_cleared_at = NULL,
  watcher_profile_last = COALESCE(EXCLUDED.watcher_profile_last, public.watch.watcher_profile_last),
  updated_at        = now();

-- ── the projection reads each side's own word ──────────────────────────────
CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me public.users; slot public.watch; inv public.watch;
  page1 jsonb; page2 jsonb; views jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id = p_user AND w.watcher_slot_at IS NOT NULL
  ORDER BY w.watcher_slot_at DESC LIMIT 1;

  IF NOT FOUND THEN
    page1 := jsonb_build_object('state', CASE WHEN me.seeking THEN 'free' ELSE 'locked' END);
  ELSE
    page1 := jsonb_build_object(
      'state', CASE slot.state WHEN 'invited' THEN 'waiting' WHEN 'ended' THEN 'locked' ELSE slot.state END,
      'profile', public._watch_profile(slot.target_id, p_user, slot.state='chat', false, slot.target_profile_last));
    IF slot.state = 'watching' AND slot.expires_at IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('expires_at', slot.expires_at);
    ELSIF slot.state = 'invited' THEN
      page1 := page1
        || CASE WHEN slot.invited_at IS NOT NULL THEN jsonb_build_object('invited_at', slot.invited_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.expires_at IS NOT NULL THEN jsonb_build_object('expires_at', slot.expires_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.extended THEN jsonb_build_object('extended', true) ELSE '{}'::jsonb END;
    ELSIF slot.state = 'ended' AND slot.watcher_cleared_at IS NULL AND slot.watcher_reason IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('message', slot.watcher_reason);
    END IF;
  END IF;

  SELECT * INTO inv FROM public.watch w
  WHERE w.target_id = p_user AND w.state IN ('invited','chat') LIMIT 1;

  IF FOUND AND inv.state = 'invited' THEN
    page2 := jsonb_build_object('state','pending',
      'profile', public._watch_profile(inv.watcher_id, p_user, false, false, inv.watcher_profile_last))
      || CASE WHEN inv.invited_at IS NOT NULL THEN jsonb_build_object('invited_at', inv.invited_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.expires_at IS NOT NULL THEN jsonb_build_object('expires_at', inv.expires_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.extended THEN jsonb_build_object('extended', true) ELSE '{}'::jsonb END;
    RETURN jsonb_build_object('page1', page1, 'page2', page2);
  ELSIF FOUND THEN
    RETURN jsonb_build_object('page1', page1, 'page2', jsonb_build_object('state','locked'));
  END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.target_id = p_user AND w.target_slot_at IS NOT NULL AND w.state = 'ended'
  ORDER BY w.target_slot_at DESC LIMIT 1;

  IF FOUND AND slot.target_cleared_at IS NULL AND slot.target_reason IS NOT NULL THEN
    page2 := jsonb_build_object('state','locked','message', slot.target_reason,
      'profile', public._watch_profile(slot.watcher_id, p_user, false, false, slot.watcher_profile_last),
      'profiles','[]'::jsonb);
  ELSIF NOT me.discoverable THEN
    page2 := jsonb_build_object('state','locked');
  ELSE
    SELECT COALESCE(jsonb_agg(public._watch_profile(w.watcher_id, p_user, false, true, w.watcher_profile_last)
                              ORDER BY w.created_at), '[]'::jsonb) INTO views
    FROM public.watch w
    WHERE w.target_id = p_user AND w.state = 'watching'
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = w.watcher_id);
    page2 := jsonb_build_object('state','free','profiles', views);
  END IF;

  RETURN jsonb_build_object('page1', page1, 'page2', page2);
END;
$function$;

REVOKE ALL ON FUNCTION public._watch_sync_target(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._watch_sync_target(uuid, jsonb) TO service_role;
