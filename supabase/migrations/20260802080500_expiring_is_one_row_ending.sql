-- The expiry family comes over. This is where the ghost was born.
--
-- _expire_watch_one closed the watcher's board and detached him from the other
-- side only `IF did AND p_target IS NOT NULL` — two conditions on a step that
-- should never have been separate. When it did not fire, the watcher stopped
-- watching and stayed in the target's viewer list for good: live, a real user's
-- whole profile sat in another real user's list for three weeks and was counted
-- to him by the dock's number and the visibility row's sentence. As a row
-- ending there is no second side to remember, so the shape that produced it is
-- gone rather than guarded.
--
-- Both sides of an expiry are the same single row: the inviter's held credit
-- comes back, he is told 'expire' and keeps the card, and the invitee is told
-- 'expire' too — the one event both boards genuinely agree on, which is why
-- 'expire' is the only word their two vocabularies share.
--
-- The sweeps stop scanning `users` for a board in a state and scan `watch` for a
-- clock that has run out, which is what the partial index on expires_at is for.
--
-- Verified end to end, committed: an invitation and a watch both run past due,
-- both sweeps run — zero live rows left, zero viewer entries, ZERO GHOSTS, the
-- deposit back in the wallet, both cards carrying the right word, zero board
-- mismatches.

CREATE OR REPLACE FUNCTION public._expire_invite_pair(p_inviter uuid, p_invitee uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE did boolean := false; notify jsonb := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_inviter, p_invitee]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  UPDATE public.watch w SET
    state='ended', ended_at=now(),
    watcher_reason='expire', watcher_cleared_at=NULL,
    target_reason='expire',  target_cleared_at=NULL, target_slot_at=now(),
    updated_at=now()
  WHERE w.state='invited' AND w.expires_at <= now()
    AND (p_inviter IS NULL OR w.watcher_id = p_inviter)
    AND (p_invitee IS NULL OR w.target_id  = p_invitee);
  IF FOUND THEN did := true; END IF;

  IF did THEN
    -- the invitation died without a chat, so the deposit comes back
    UPDATE public.users SET relations = public._credits_refund(relations, public._credits_cost('invite'))
    WHERE user_id = p_inviter;

    PERFORM public._watch_project(ARRAY[p_inviter, p_invitee]);

    IF p_inviter IS NOT NULL THEN
      notify := notify || jsonb_build_array(jsonb_build_object(
        'user_id', p_inviter, 'actor_id', p_invitee, 'code','expired-out'));
    END IF;
    IF p_invitee IS NOT NULL THEN
      notify := notify || jsonb_build_array(jsonb_build_object(
        'user_id', p_invitee, 'actor_id', p_inviter, 'code','expired-in'));
    END IF;
  END IF;

  RETURN notify;
END;
$function$;

CREATE OR REPLACE FUNCTION public._expire_watch_one(p_watcher uuid, p_target uuid)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE did boolean := false;
BEGIN
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_watcher, p_target]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- one row ending. There is no other side to detach, which is the whole point.
  UPDATE public.watch w SET
    state='ended', ended_at=now(),
    watcher_reason=NULL, watcher_slot_at=NULL, updated_at=now()
  WHERE w.watcher_id = p_watcher AND w.state='watching'
    AND (w.expires_at IS NULL OR w.expires_at <= now())
    AND (p_target IS NULL OR w.target_id = p_target);
  IF FOUND THEN did := true; END IF;

  IF did THEN PERFORM public._watch_project(ARRAY[p_watcher, p_target]); END IF;
  RETURN did;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_expire_sweep()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE r record; pair jsonb; notify jsonb := '[]'::jsonb; n int := 0;
BEGIN
  FOR r IN SELECT w.watcher_id, w.target_id FROM public.watch w
           WHERE w.state='invited' AND w.expires_at <= now()
           ORDER BY w.expires_at LIMIT 2000
  LOOP
    pair := public._expire_invite_pair(r.watcher_id, r.target_id);
    IF jsonb_array_length(pair) > 0 THEN notify := notify || pair; n := n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('processed', n, 'notify', notify);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_expire_watch_sweep()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE r record; processed int := 0; seen int := 0; cap int := 2000;
BEGIN
  FOR r IN SELECT w.watcher_id, w.target_id FROM public.watch w
           WHERE w.state='watching' AND (w.expires_at IS NULL OR w.expires_at <= now())
           ORDER BY w.expires_at NULLS FIRST LIMIT cap
  LOOP
    seen := seen + 1;
    IF public._expire_watch_one(r.watcher_id, r.target_id) THEN processed := processed + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('processed', processed, 'capped', seen >= cap);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_expire_self(me_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE notify jsonb := '[]'::jsonb; r record; result_user json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = me_id) THEN
    RETURN jsonb_build_object('error','not_found');
  END IF;

  FOR r IN SELECT w.watcher_id, w.target_id FROM public.watch w
           WHERE w.watcher_id = me_id AND w.state='invited' AND w.expires_at <= now() LOOP
    notify := notify || public._expire_invite_pair(r.watcher_id, r.target_id);
  END LOOP;

  FOR r IN SELECT w.watcher_id, w.target_id FROM public.watch w
           WHERE w.target_id = me_id AND w.state='invited' AND w.expires_at <= now() LOOP
    notify := notify || public._expire_invite_pair(r.watcher_id, r.target_id);
  END LOOP;

  FOR r IN SELECT w.watcher_id, w.target_id FROM public.watch w
           WHERE w.watcher_id = me_id AND w.state='watching'
             AND (w.expires_at IS NULL OR w.expires_at <= now()) LOOP
    PERFORM public._expire_watch_one(r.watcher_id, r.target_id);
  END LOOP;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;
