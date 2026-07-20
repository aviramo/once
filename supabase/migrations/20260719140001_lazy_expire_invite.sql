-- Lazy invitation expiry.
--
-- Until now an expired invitation was closed ONLY by the per-minute
-- app_expire_sweep cron. The inviter sitting on the waiting card therefore
-- watched the clock hit 00:00 and then stared at a live "Cancel invitation"
-- button for up to 60s. Worse, app_cancel had no expires_at check, so tapping
-- it in that window ran _credits_clear_hold (FORFEIT) instead of the refund the
-- sweep would have applied a moment later: the user lost a heart on an
-- invitation that had already expired.
--
-- The per-pair close was written inline twice (both sweep passes). This
-- extracts it once as _expire_invite_pair and adds two more callers:
--   * app_expire_self  -- the client fires it at 00:00 via start/location/focus
--   * app_cancel       -- defensive guard, routes an expired cancel to expire
--
-- The cron keeps running unchanged as the safety net for closed apps.

-- ── _expire_invite_pair ─────────────────────────────────────────────────────
-- Closes one expired invitation pair. Self-guarding: every write re-checks
-- state AND expires_at under the lock, so it is a no-op when the invite is not
-- actually expired (or was already closed, or was extended concurrently).
-- Safe to call from anywhere, and idempotent under concurrent callers.
--
-- Either id may be NULL (pass 2 of the sweep can reach a pending page2 whose
-- inviter reference is gone); the corresponding side is then skipped.
--
-- Returns the notify array. An entry is emitted ONLY for a side that actually
-- changed -- so no expired-in push is sent for an invitee whose page2 had
-- already moved on. (The old sweep pass 1 emitted both entries unconditionally.)
create or replace function public._expire_invite_pair(p_inviter uuid, p_invitee uuid)
returns jsonb
language plpgsql
as $function$
DECLARE
  did_inviter boolean := false;
  did_invitee boolean := false;
  notify      jsonb   := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p_inviter, p_invitee]) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  -- Inviter side: page1 waiting past due -> locked/expire, held heart REFUNDED.
  IF p_inviter IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      public._credits_refund(relations, public._credits_cost('invite')),
      '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'expire')
    ) WHERE user_id = p_inviter
      AND relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
      AND (p_invitee IS NULL OR relations->'page1'->'profile'->>'user_id' = p_invitee::text);
    IF FOUND THEN did_inviter := true; END IF;
  END IF;

  -- Invitee side: page2 pending past due -> locked/expire (profile preserved
  -- so the message card has data and clear2 still works).
  IF p_invitee IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = p_invitee
      AND relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->>'expires_at')::timestamptz <= now()
      AND (p_inviter IS NULL OR relations->'page2'->'profile'->>'user_id' = p_inviter::text);
    IF FOUND THEN did_invitee := true; END IF;
  END IF;

  IF did_inviter THEN
    notify := notify || jsonb_build_array(jsonb_build_object(
      'user_id', p_inviter, 'actor_id', p_invitee, 'code', 'expired-out'));
  END IF;
  IF did_invitee THEN
    notify := notify || jsonb_build_array(jsonb_build_object(
      'user_id', p_invitee, 'actor_id', p_inviter, 'code', 'expired-in'));
  END IF;

  RETURN notify;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._expire_invite_pair(uuid, uuid) FROM anon, authenticated;

-- ── app_expire_sweep ────────────────────────────────────────────────────────
-- Same two passes, same order, same envelope -- the per-pair body is now the
-- shared helper. Pass 1 is inviter-driven; pass 2 catches a pending page2 whose
-- inviter left 'waiting' for some other reason (matched elsewhere, paused),
-- which pass 1 can never reach. A pair closed by pass 1 is already non-pending
-- by pass 2, so it is not counted twice.
create or replace function public.app_expire_sweep()
returns jsonb
language plpgsql
as $function$
DECLARE
  row_rec         record;
  pair_notify     jsonb;
  notify          jsonb := '[]'::jsonb;
  count_processed int := 0;
BEGIN
  FOR row_rec IN
    SELECT user_id, NULLIF(relations->'page1'->'profile'->>'user_id', '')::uuid AS other_id
    FROM public.users
    WHERE relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
  LOOP
    pair_notify := public._expire_invite_pair(row_rec.user_id, row_rec.other_id);
    IF jsonb_array_length(pair_notify) > 0 THEN
      notify := notify || pair_notify;
      count_processed := count_processed + 1;
    END IF;
  END LOOP;

  FOR row_rec IN
    SELECT user_id, NULLIF(relations->'page2'->'profile'->>'user_id', '')::uuid AS other_id
    FROM public.users
    WHERE relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->>'expires_at')::timestamptz <= now()
  LOOP
    pair_notify := public._expire_invite_pair(row_rec.other_id, row_rec.user_id);
    IF jsonb_array_length(pair_notify) > 0 THEN
      notify := notify || pair_notify;
      count_processed := count_processed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$function$;

-- ── app_expire_self ─────────────────────────────────────────────────────────
-- Closes the CALLER's own expired invitation, either direction. Called from the
-- start/location/focus dispatcher case when the caller's own relations show a
-- past-due waiting/pending, which the client triggers the moment its countdown
-- reaches 00:00. Standard {user, notify} envelope; a no-op returns the user
-- with an empty notify array.
--
-- Both sides are checked because either party's clock can be the one that
-- lapses first, and the caller may be the inviter or the invitee.
create or replace function public.app_expire_self(me_id uuid)
returns jsonb
language plpgsql
as $function$
DECLARE
  me_row      public.users;
  notify      jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page1'->>'state' = 'waiting'
     AND (me_row.relations->'page1'->>'expires_at')::timestamptz <= now() THEN
    notify := notify || public._expire_invite_pair(
      me_id, NULLIF(me_row.relations->'page1'->'profile'->>'user_id', '')::uuid);
  END IF;

  IF me_row.relations->'page2'->>'state' = 'pending'
     AND (me_row.relations->'page2'->>'expires_at')::timestamptz <= now() THEN
    notify := notify || public._expire_invite_pair(
      NULLIF(me_row.relations->'page2'->'profile'->>'user_id', '')::uuid, me_id);
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.app_expire_self(uuid) FROM anon, authenticated;

-- ── app_cancel ──────────────────────────────────────────────────────────────
-- Unchanged except for the expiry guard: an invitation that is already past due
-- is closed as an EXPIRE (heart refunded, both sides message='expire', no
-- 'cancel' restriction) rather than as a cancel (heart forfeited). Lands the tap
-- in exactly the state the sweep would have produced a moment later.
--
-- With the client now firing app_expire_self at 00:00 this should rarely be
-- reached, but it closes the window for slow clients, old builds and direct
-- API calls -- and a heart must never be lost to a race.
create or replace function public.app_cancel(me_id uuid)
returns jsonb
language plpgsql
as $function$
DECLARE
  me_row    public.users;
  target_id uuid;
  notify    jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, target_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' <> 'waiting' THEN
    RETURN jsonb_build_object('error', 'not_waiting');
  END IF;

  -- Already expired -> expire landing, not a cancel. NULL expires_at compares
  -- to NULL (never true), so a legacy row with no clock still cancels normally.
  IF (me_row.relations->'page1'->>'expires_at')::timestamptz <= now() THEN
    notify := public._expire_invite_pair(me_id, target_id);
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    public._credits_clear_hold(relations, public._credits_cost('invite')),
    '{page1}',
    jsonb_build_object('state', 'locked')
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    public._page2_locked(relations->'page2'->'profile', 'cancel')
  ) WHERE user_id = target_id
    AND relations->'page2'->>'state' = 'pending'
    AND relations->'page2'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, target_id, 'cancel');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'cancelled-in')));
END;
$function$;
