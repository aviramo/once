-- What running the real RPCs through their real transitions taught the model.
--
-- CONSOLIDATED. Applied live as five migrations (20260802014359 … 20260802014902).
-- The 84/84 proof before this had only ever compared RESTING states; every gap
-- below was invisible until app_find / app_invite / app_approve / app_leave /
-- app_ignore / app_cancel / app_lock2 / app_free2 / app_pause / app_resume /
-- app_clear1 / app_block were actually executed on the test partition inside a
-- rollback and the boards compared after each one.
--
--   1. A BARE BOARD IS BARE. app_leave / app_block write the leaver's own page1
--      as `{state:'locked'}` and nothing else — no card — while the post-clear1
--      shape keeps its card and drops only the message. Indistinguishable to the
--      projection, which drew a card where the board shows none. They differ at
--      the source: a new page1 with no profile in it means that side's board was
--      emptied, so its slot is released.
--
--   2. THE PROJECTION MATCHES THE REFRESHED SHAPE. _page1_locked writes an ended
--      card through _profile_clean (no distance, no last_seen); then
--      app_refresh_snapshots rebuilds it with make_profile and puts both back,
--      stripping `distance` only for `chat`. So an ended board has two shapes in
--      this system depending on whether a refresh has run since — and a refresh
--      runs on every start, focus and location. Teaching the projection to clean
--      fixed the instant after an RPC and broke the resting state for eight live
--      boards. It matches the refreshed shape; the difference in between is a
--      distance and a last_seen the refresh was about to restore anyway.
--
--   3. THE ACCOUNT FLAGS FOLLOW THE BOARDS, for as long as the boards are what
--      gets written. app_lock2 hides a user by locking page2 and app_resume
--      opens one by freeing page1; `seeking` and `discoverable` were not
--      hearing about it. A BEFORE trigger sets them on the row being written —
--      no second write, no extra Realtime event, no way to loop.
--
--   4. A BOARD RETURNING TO `free` HAS DISMISSED WHAT WAS ON IT. _watch_sync_target
--      knew locked-with-a-message, locked-without and pending, and did nothing
--      for free, so app_resume left the row's word standing and the projection
--      went on drawing a card the user had already cleared.
--
--   5. A LIVE ROW MAY STILL CARRY AN UNREAD WORD. The constraint said a row that
--      is not `ended` carries no words, and the sync nulled them when a row came
--      back to life. Both wrong, for the reason this model exists: the two
--      mailboxes are INDEPENDENT. A can start watching B again while B is still
--      holding the "A cancelled" card — B has not dismissed it and only B may,
--      and others() allows it (a locked board with a message is `_page2_open`).
--      `state` describes the relation as it stands; each side's word describes
--      what that side is still being shown about however it last ended.
--
-- After all five, across nine transitions: page1 identical at every step, page2
-- identical at every step but one — a transient viewer-list ORDER difference
-- right after app_ignore (this recompute sorts by user_id, app_find appends),
-- which the next step resolves.

-- 5: the words come loose from the state
ALTER TABLE public.watch DROP CONSTRAINT IF EXISTS watch_ended_consistent;
ALTER TABLE public.watch ADD CONSTRAINT watch_ended_consistent CHECK (
  (state = 'ended' AND ended_at IS NOT NULL)
  OR (state <> 'ended' AND ended_at IS NULL)
);

-- 3: the flags follow the boards, set in place rather than by a second write
CREATE OR REPLACE FUNCTION public._watch_flags_tg()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.seeking      := COALESCE(NEW.relations->'page1'->>'state','free') = 'free';
  NEW.discoverable := public._page2_open(NEW.relations->'page2');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS users_watch_flags ON public.users;
CREATE TRIGGER users_watch_flags
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public._watch_flags_tg();

UPDATE public.users SET
  seeking      = (COALESCE(relations->'page1'->>'state','free') = 'free'),
  discoverable = public._page2_open(relations->'page2')
WHERE seeking      IS DISTINCT FROM (COALESCE(relations->'page1'->>'state','free') = 'free')
   OR discoverable IS DISTINCT FROM public._page2_open(relations->'page2');

-- 2: no cleaning — match what app_refresh_snapshots produces
CREATE OR REPLACE FUNCTION public._watch_profile(
  p_of uuid, p_viewer uuid, p_chat boolean, p_listed boolean, p_last jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'extensions'
AS $function$
DECLARE subject public.users; viewer public.users; dist int; prof jsonb;
BEGIN
  SELECT * INTO subject FROM public.users WHERE user_id = p_of;
  IF NOT FOUND THEN RETURN p_last; END IF;
  SELECT * INTO viewer FROM public.users WHERE user_id = p_viewer;
  dist := CASE WHEN viewer.location IS NULL OR subject.location IS NULL THEN NULL
               ELSE extensions.st_distance(viewer.location::extensions.geography,
                                           subject.location::extensions.geography)::int END;
  prof := CASE WHEN p_listed THEN public.make_profile(subject, dist)
               ELSE public.make_profile(subject, dist, p_viewer) END;
  IF p_chat THEN prof := prof - 'distance'; END IF;
  RETURN prof;
END;
$function$;
DROP FUNCTION IF EXISTS public._watch_profile(uuid, uuid, boolean, boolean, jsonb, boolean);

-- 1 + 5: a bare board releases its slot; a revived row keeps the other side's word
CREATE OR REPLACE FUNCTION public._watch_sync(p_watcher uuid, p_old_page1 jsonb, p_new_page1 jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  old_target uuid := NULLIF(p_old_page1->'profile'->>'user_id','')::uuid;
  new_target uuid := NULLIF(p_new_page1->'profile'->>'user_id','')::uuid;
  new_state  text := COALESCE(p_new_page1->>'state','free');
  mapped text; t uuid; fresh jsonb;
BEGIN
  mapped := CASE new_state WHEN 'watching' THEN 'watching' WHEN 'waiting' THEN 'invited'
                           WHEN 'chat' THEN 'chat' ELSE NULL END;

  IF old_target IS NOT NULL AND old_target IS DISTINCT FROM new_target THEN
    UPDATE public.watch SET state='ended', ended_at=COALESCE(ended_at,now()),
      watcher_reason=COALESCE(watcher_reason, NULLIF(p_new_page1->>'message','')), updated_at=now()
    WHERE watcher_id=p_watcher AND target_id=old_target AND state<>'ended';
  END IF;

  IF new_target IS NULL THEN
    UPDATE public.watch SET watcher_slot_at=NULL, updated_at=now()
    WHERE watcher_id=p_watcher AND watcher_slot_at IS NOT NULL;
  ELSE
    INSERT INTO public.watch (
      watcher_id, target_id, state, invited_at, expires_at, extended,
      ended_at, watcher_reason, watcher_cleared_at, watcher_slot_at, target_slot_at, target_profile_last)
    VALUES (p_watcher, new_target, COALESCE(mapped,'ended'),
      NULLIF(p_new_page1->>'invited_at','')::timestamptz,
      NULLIF(p_new_page1->>'expires_at','')::timestamptz,
      COALESCE((p_new_page1->>'extended')::boolean,false),
      CASE WHEN mapped IS NULL THEN now() END,
      CASE WHEN mapped IS NULL THEN NULLIF(p_new_page1->>'message','') END,
      CASE WHEN mapped IS NULL AND NULLIF(p_new_page1->>'message','') IS NULL THEN now() END,
      now(),
      CASE WHEN mapped IS NOT NULL THEN now() END,
      p_new_page1->'profile')
    ON CONFLICT (watcher_id, target_id) DO UPDATE SET
      state=EXCLUDED.state, invited_at=EXCLUDED.invited_at, expires_at=EXCLUDED.expires_at,
      extended=EXCLUDED.extended,
      ended_at=CASE WHEN EXCLUDED.state='ended' THEN COALESCE(public.watch.ended_at,now()) END,
      watcher_reason=CASE WHEN EXCLUDED.state='ended' THEN EXCLUDED.watcher_reason
                          ELSE public.watch.watcher_reason END,
      target_reason=public.watch.target_reason,
      watcher_cleared_at=EXCLUDED.watcher_cleared_at,
      watcher_slot_at=now(),
      target_slot_at=CASE WHEN EXCLUDED.state<>'ended' THEN now() ELSE public.watch.target_slot_at END,
      target_profile_last=COALESCE(EXCLUDED.target_profile_last, public.watch.target_profile_last),
      updated_at=now();
  END IF;

  FOREACH t IN ARRAY ARRAY[old_target, new_target] LOOP
    CONTINUE WHEN t IS NULL;
    SELECT COALESCE((SELECT jsonb_agg(public._watch_profile(v.user_id, t, false, true, null) ORDER BY v.user_id)
                     FROM public.users v
                     WHERE v.relations->'page1'->>'state'='watching'
                       AND (v.relations->'page1'->'profile'->>'user_id')::uuid = t), '[]'::jsonb) INTO fresh;
    UPDATE public.users SET relations = jsonb_set(relations,'{page2,profiles}', fresh)
    WHERE user_id=t AND relations->'page2'->>'state'='free'
      AND relations->'page2'->'profiles' IS DISTINCT FROM fresh;
  END LOOP;
END;
$function$;

-- 4: free is a dismissal
CREATE OR REPLACE FUNCTION public._watch_sync_target(p_target uuid, p_new_page2 jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  other uuid := NULLIF(p_new_page2->'profile'->>'user_id','')::uuid;
  st text := COALESCE(p_new_page2->>'state','free');
  msg text := NULLIF(p_new_page2->>'message','');
BEGIN
  IF st = 'free' THEN
    UPDATE public.watch SET target_cleared_at=now(), updated_at=now()
    WHERE target_id=p_target AND state='ended'
      AND target_slot_at IS NOT NULL AND target_cleared_at IS NULL;
    RETURN;
  END IF;

  IF other IS NULL OR other = p_target THEN RETURN; END IF;

  IF st='locked' AND msg IS NOT NULL THEN
    INSERT INTO public.watch (watcher_id,target_id,state,ended_at,target_reason,target_slot_at,watcher_profile_last)
    VALUES (other,p_target,'ended',now(),msg,now(),p_new_page2->'profile')
    ON CONFLICT (watcher_id,target_id) DO UPDATE SET
      state='ended', ended_at=COALESCE(public.watch.ended_at,now()),
      target_reason=EXCLUDED.target_reason, target_slot_at=now(), target_cleared_at=NULL,
      watcher_profile_last=COALESCE(EXCLUDED.watcher_profile_last, public.watch.watcher_profile_last),
      updated_at=now();
  ELSIF st='locked' AND msg IS NULL THEN
    UPDATE public.watch SET target_cleared_at=now(), updated_at=now()
    WHERE watcher_id=other AND target_id=p_target AND target_cleared_at IS NULL;
  ELSIF st='pending' THEN
    INSERT INTO public.watch (watcher_id,target_id,state,invited_at,expires_at,extended,target_slot_at,watcher_profile_last)
    VALUES (other,p_target,'invited',
      COALESCE(NULLIF(p_new_page2->>'invited_at','')::timestamptz,now()),
      COALESCE(NULLIF(p_new_page2->>'expires_at','')::timestamptz,now()),
      COALESCE((p_new_page2->>'extended')::boolean,false), now(), p_new_page2->'profile')
    ON CONFLICT (watcher_id,target_id) DO UPDATE SET
      state='invited',
      invited_at=COALESCE(EXCLUDED.invited_at, public.watch.invited_at),
      expires_at=COALESCE(EXCLUDED.expires_at, public.watch.expires_at),
      extended=EXCLUDED.extended, ended_at=NULL, watcher_reason=NULL, target_reason=NULL,
      target_slot_at=now(),
      watcher_profile_last=COALESCE(EXCLUDED.watcher_profile_last, public.watch.watcher_profile_last),
      updated_at=now();
  END IF;
END;
$function$;

-- and the projection shows each side whatever that side has not dismissed,
-- whether or not the pair has since started something new
CREATE OR REPLACE FUNCTION public._watch_pages(p_user uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'extensions'
AS $function$
DECLARE me public.users; slot public.watch; inv public.watch;
        page1 jsonb; page2 jsonb; views jsonb;
BEGIN
  SELECT * INTO me FROM public.users WHERE user_id=p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.watcher_id=p_user AND w.watcher_slot_at IS NOT NULL
  ORDER BY w.watcher_slot_at DESC LIMIT 1;

  IF NOT FOUND THEN
    page1 := jsonb_build_object('state', CASE WHEN me.seeking THEN 'free' ELSE 'locked' END);
  ELSE
    page1 := jsonb_build_object(
      'state', CASE slot.state WHEN 'invited' THEN 'waiting' WHEN 'ended' THEN 'locked' ELSE slot.state END,
      'profile', public._watch_profile(slot.target_id, p_user, slot.state='chat', false, slot.target_profile_last));
    IF slot.state='watching' AND slot.expires_at IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('expires_at', slot.expires_at);
    ELSIF slot.state='invited' THEN
      page1 := page1
        || CASE WHEN slot.invited_at IS NOT NULL THEN jsonb_build_object('invited_at',slot.invited_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.expires_at IS NOT NULL THEN jsonb_build_object('expires_at',slot.expires_at) ELSE '{}'::jsonb END
        || CASE WHEN slot.extended THEN jsonb_build_object('extended',true) ELSE '{}'::jsonb END;
    ELSIF slot.state='ended' AND slot.watcher_cleared_at IS NULL AND slot.watcher_reason IS NOT NULL THEN
      page1 := page1 || jsonb_build_object('message', slot.watcher_reason);
    END IF;
  END IF;

  SELECT * INTO inv FROM public.watch w
  WHERE w.target_id=p_user AND w.state IN ('invited','chat') LIMIT 1;

  IF FOUND AND inv.state='invited' THEN
    page2 := jsonb_build_object('state','pending',
      'profile', public._watch_profile(inv.watcher_id, p_user, false, false, inv.watcher_profile_last))
      || CASE WHEN inv.invited_at IS NOT NULL THEN jsonb_build_object('invited_at',inv.invited_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.expires_at IS NOT NULL THEN jsonb_build_object('expires_at',inv.expires_at) ELSE '{}'::jsonb END
      || CASE WHEN inv.extended THEN jsonb_build_object('extended',true) ELSE '{}'::jsonb END;
    RETURN jsonb_build_object('page1',page1,'page2',page2);
  ELSIF FOUND THEN
    RETURN jsonb_build_object('page1',page1,'page2',jsonb_build_object('state','locked'));
  END IF;

  SELECT * INTO slot FROM public.watch w
  WHERE w.target_id=p_user AND w.target_slot_at IS NOT NULL
    AND w.target_cleared_at IS NULL AND w.target_reason IS NOT NULL
  ORDER BY w.target_slot_at DESC LIMIT 1;

  IF FOUND THEN
    page2 := jsonb_build_object('state','locked','message',slot.target_reason,
      'profile', public._watch_profile(slot.watcher_id, p_user, false, false, slot.watcher_profile_last),
      'profiles','[]'::jsonb);
  ELSIF NOT me.discoverable THEN
    page2 := jsonb_build_object('state','locked');
  ELSE
    SELECT COALESCE(jsonb_agg(public._watch_profile(w.watcher_id, p_user, false, true, w.watcher_profile_last)
                              ORDER BY w.created_at), '[]'::jsonb) INTO views
    FROM public.watch w
    WHERE w.target_id=p_user AND w.state='watching'
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=w.watcher_id);
    page2 := jsonb_build_object('state','free','profiles',views);
  END IF;

  RETURN jsonb_build_object('page1',page1,'page2',page2);
END;
$function$;

UPDATE public.watch w SET target_cleared_at=now(), updated_at=now()
WHERE w.state='ended' AND w.target_slot_at IS NOT NULL AND w.target_cleared_at IS NULL
  AND EXISTS (SELECT 1 FROM public.users u
              WHERE u.user_id=w.target_id AND u.relations->'page2'->>'state'='free');
