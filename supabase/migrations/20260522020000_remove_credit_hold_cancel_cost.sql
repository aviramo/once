-- Remove the credits hold/refund mechanism + make `cancel` cost 1 heart.
--
-- User decisions 2026-05-22:
--   1. Inviting is free (cost 0) — already true; no badge on the invite button.
--   2. Cancelling a sent invite (app_cancel) costs the inviter 1 heart.
--   3. The inviter-refund mechanism is removed entirely: since the inviter
--      never pays for the invite, there is nothing to refund / hold / forfeit.
--
-- The hold/refund machinery has been dormant since 2026-05-22 (invite cost 0
-- ⇒ held always 0 ⇒ _credits_refund / _credits_clear_hold were no-ops), so
-- dropping it is behavior-preserving for production. The only real new
-- behavior is app_cancel charging 1 (GREATEST(0,…)-floored, so a 0-balance
-- user is never trapped in `waiting`). Additive / not breaking for the
-- deployed app: response shapes unchanged; an old build just doesn't render
-- the cancel-popup cost badge (cosmetic, self-corrects on app update).

-- ── _credits_cost: invite removed (free), cancel added ──────────────────────
CREATE OR REPLACE FUNCTION public._credits_cost(action text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(action)
    WHEN 'approve'   THEN 1
    WHEN 'broadcast' THEN 1
    WHEN 'cancel'    THEN 1
    ELSE 0
  END
$function$;

-- ── _credits_charge: drop the hold capability (now 2-arg, balance only) ─────
DROP FUNCTION IF EXISTS public._credits_charge(jsonb, integer, boolean);
CREATE OR REPLACE FUNCTION public._credits_charge(rel jsonb, amount integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  WITH r AS (SELECT public._credits_ensure(rel) AS rel)
  SELECT jsonb_set(r.rel, '{credits,balance}',
    to_jsonb(GREATEST(0, COALESCE((r.rel->'credits'->>'balance')::int,0) - amount)))
  FROM r
$function$;

-- ── _credits_default / _credits_reset_to_cap: drop the `held` key ───────────
CREATE OR REPLACE FUNCTION public._credits_default()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'balance', (public._credits_tier_cfg('free')->>'daily')::int,
    'tier',    'free',
    'granted_on', public._credits_grant_day()::text,
    'next_grant_at', public._credits_next_grant_at()
  )
$function$;

CREATE OR REPLACE FUNCTION public._credits_reset_to_cap(rel jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'balance',       (public._credits_tier_cfg(t.tier)->>'cap')::int,
    'tier',          t.tier,
    'granted_on',    public._credits_grant_day()::text,
    'next_grant_at', public._credits_next_grant_at()
  )
  from (
    select coalesce(public._credits_ensure(rel)->'credits'->>'tier', 'free') as tier
  ) t
$function$;

-- ── _kick_page1_at: no refund branch (the CASE collapses to a plain lock) ────
CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.users u
  SET relations = jsonb_set(relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', msg))
  WHERE relations->'page1'->'profile'->>'user_id' = target_id::text
    AND COALESCE(relations->'page1'->>'state', '') <> 'locked'
    AND (exclude_id IS NULL OR u.user_id <> exclude_id)
  RETURNING u.user_id;
END;
$function$;

-- ── app_invite: inviting is free — no charge, no hold, no credit precondition
CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  target_id  uuid;
  target_row public.users;
  invited_at timestamptz := now();
  expires_at timestamptz := now() + interval '10 minutes';
  dist_m     int;
  result_user json;
  notify     jsonb := '[]'::jsonb;
  kicked     uuid;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF me_row.relations->'page1'->>'state' <> 'watching' THEN
    RETURN jsonb_build_object('error', 'not_watching');
  END IF;
  target_id := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF target_id IS NULL THEN RETURN jsonb_build_object('error', 'no_target'); END IF;

  PERFORM 1 FROM public.users
  WHERE user_id = me_id
     OR user_id = target_id
     OR relations->'page1'->'profile'->>'user_id' = target_id::text
     OR relations->'page1'->'profile'->>'user_id' = me_id::text
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  SELECT * INTO target_row FROM public.users WHERE user_id = target_id;

  IF me_row.relations->'page1'->>'state' <> 'watching'
     OR (me_row.relations->'page1'->'profile'->>'user_id')::uuid <> target_id
     OR COALESCE(target_row.relations->'page2'->>'state', 'free') NOT IN ('free') THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'invite')
    ) WHERE user_id = me_id;
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'invite-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR target_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, target_row.location::extensions.geography)::int END;

  IF target_row.relations->'page1'->>'state' = 'waiting'
     AND (target_row.relations->'page1'->'profile'->>'user_id')::uuid = me_id THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m) - 'distance')
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance')
    ) WHERE user_id = target_id;

    FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, target_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'match'));
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'match'));

    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object(
      'state', 'pending',
      'profile', public.make_profile(me_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = target_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-invitee'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'invite-in'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- ── app_approve: no own-invite refund, no inviter hold-clear ────────────────
CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
  v_approve_cost int;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  inviter_id    := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  my_old_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users
  WHERE user_id IN (me_id, inviter_id)
     OR (my_old_target IS NOT NULL AND user_id = my_old_target)
     OR relations->'page1'->'profile'->>'user_id' IN (me_id::text, inviter_id::text)
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  -- Broadcasting → accepting is free (the user already paid to broadcast).
  -- Same 30-minute window as app_add / others.relevance_broadcast.
  v_approve_cost := CASE
    WHEN COALESCE(
           NULLIF(me_row.relations->>'last_add_at','')::timestamptz
             > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_balance(me_row.relations) < v_approve_cost THEN

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'approve')
    ) WHERE user_id = me_id;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id, 'code', 'approve-fail'));
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  SELECT * INTO inviter_row FROM public.users WHERE user_id = inviter_id;

  IF my_old_target IS NOT NULL AND my_old_target <> inviter_id THEN
    PERFORM public._remove_from_profiles(my_old_target, me_id);
  END IF;

  dist_m := CASE WHEN me_row.location IS NULL OR inviter_row.location IS NULL THEN NULL
    ELSE extensions.st_distance(me_row.location::extensions.geography, inviter_row.location::extensions.geography)::int END;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_row.relations, v_approve_cost)->'credits'
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_ensure(relations)->'credits'
  ) WHERE user_id = inviter_id;

  FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, inviter_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;
  FOR kicked IN SELECT * FROM public._kick_page1_at(inviter_id, me_id, 'approve') LOOP
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
  END LOOP;

  notify := notify || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'match'));

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;

-- ── app_cancel: cancelling a sent invite costs the inviter 1 heart ──────────
CREATE OR REPLACE FUNCTION public.app_cancel(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row    public.users;
  target_id uuid;
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

  -- Inviting is free; backing out costs 1 heart. _credits_charge floors the
  -- balance at 0, so a 0-balance user can always still cancel (never trapped
  -- in `waiting`) — they simply pay what they have.
  UPDATE public.users SET relations = public._credits_charge(jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  ), public._credits_cost('cancel')) WHERE user_id = me_id;

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

-- ── app_decline: no inviter refund ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_decline(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  inviter_id uuid;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;
  inviter_id := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  PERFORM 1 FROM public.users WHERE user_id IN (me_id, inviter_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page2'->>'state' <> 'pending' THEN
    RETURN jsonb_build_object('error', 'no_incoming');
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'decline')
  ) WHERE user_id = inviter_id
    AND relations->'page1'->>'state' = 'waiting'
    AND relations->'page1'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, inviter_id, 'decline');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'declined')));
END;
$function$;

-- ── app_expire_sweep: no inviter refund (both passes) ──────────────────────
CREATE OR REPLACE FUNCTION public.app_expire_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  row_rec         record;
  inviter_id      uuid;
  invitee_id      uuid;
  notify          jsonb := '[]'::jsonb;
  count_processed int := 0;
BEGIN
  FOR row_rec IN
    SELECT user_id, relations->'page1'->'profile'->>'user_id' AS target_id
    FROM public.users
    WHERE relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->>'expires_at')::timestamptz <= now()
  LOOP
    inviter_id := row_rec.user_id;
    invitee_id := row_rec.target_id::uuid;

    PERFORM 1 FROM public.users WHERE user_id IN (inviter_id, invitee_id) ORDER BY user_id FOR UPDATE;

    IF (SELECT relations->'page1'->>'state' FROM public.users WHERE user_id = inviter_id) <> 'waiting' THEN
      CONTINUE;
    END IF;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'expire')
    ) WHERE user_id = inviter_id;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = invitee_id
      AND relations->'page2'->>'state' = 'pending'
      AND relations->'page2'->'profile'->>'user_id' = inviter_id::text;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'expired-out'))
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  FOR row_rec IN
    SELECT user_id, relations->'page2'->'profile'->>'user_id' AS inviter
    FROM public.users
    WHERE relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->>'expires_at')::timestamptz <= now()
  LOOP
    invitee_id := row_rec.user_id;
    inviter_id := NULLIF(row_rec.inviter, '')::uuid;

    PERFORM 1 FROM public.users
    WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[invitee_id, inviter_id]) x WHERE x IS NOT NULL))
    ORDER BY user_id FOR UPDATE;

    IF (SELECT relations->'page2'->>'state' FROM public.users WHERE user_id = invitee_id) <> 'pending'
       OR (SELECT (relations->'page2'->>'expires_at')::timestamptz FROM public.users WHERE user_id = invitee_id) > now() THEN
      CONTINUE;
    END IF;

    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'expire')
    ) WHERE user_id = invitee_id;

    IF inviter_id IS NOT NULL THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'expire')
      ) WHERE user_id = inviter_id
        AND relations->'page1'->>'state' = 'waiting'
        AND relations->'page1'->'profile'->>'user_id' = invitee_id::text;
    END IF;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$function$;

-- ── app_pause: no inviter refund, no hold-clear (just carry credits) ────────
CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row        public.users;
  page1_state   text;
  page2_state   text;
  page1_target  uuid;
  page2_inviter uuid;
  watcher_ids   uuid[] := '{}';
  lock_ids      uuid[];
  notify_list   jsonb := '[]'::jsonb;
  vid           uuid;
  result_user   json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  page1_state  := me_row.relations->'page1'->>'state';
  page2_state  := me_row.relations->'page2'->>'state';
  page1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF page2_state = 'pending' THEN
    page2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  END IF;

  IF page2_state = 'free' THEN
    SELECT COALESCE(
      (SELECT array_agg((p->>'user_id')::uuid)
       FROM jsonb_array_elements(COALESCE(me_row.relations->'page2'->'profiles', '[]'::jsonb)) AS p
       WHERE p->>'user_id' IS NOT NULL),
      '{}'::uuid[]
    ) INTO watcher_ids;
    IF watcher_ids IS NULL THEN watcher_ids := '{}'; END IF;
  END IF;

  lock_ids := ARRAY[me_id] || watcher_ids;
  IF page1_target  IS NOT NULL THEN lock_ids := lock_ids || page1_target;  END IF;
  IF page2_inviter IS NOT NULL THEN lock_ids := lock_ids || page2_inviter; END IF;
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  IF page1_state = 'waiting' AND page1_target IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page2}',
      public._page2_locked(relations->'page2'->'profile', 'cancel')
    ) WHERE user_id = page1_target
      AND relations->'page2'->>'state' = 'pending'
      AND relations->'page2'->'profile'->>'user_id' = me_id::text;
    PERFORM public._add_restriction(me_id, page1_target, 'cancel');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page1_target, 'code', 'cancelled-in'));
  ELSIF page1_state = 'chat' AND page1_target IS NOT NULL THEN
    UPDATE public.users SET relations =
      jsonb_set(
        jsonb_set(
          relations, '{page1}',
          public._page1_locked(relations->'page1'->'profile', 'leave')
        ),
        '{page2}',
        jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    WHERE user_id = page1_target
      AND relations->'page1'->>'state' = 'chat';
    PERFORM public._add_restriction(me_id, page1_target, 'leave');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page1_target, 'code', 'left'));
  END IF;

  IF page2_state = 'pending' AND page2_inviter IS NOT NULL THEN
    UPDATE public.users SET relations = jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'decline')
    ) WHERE user_id = page2_inviter
      AND relations->'page1'->>'state' = 'waiting'
      AND relations->'page1'->'profile'->>'user_id' = me_id::text;
    PERFORM public._add_restriction(me_id, page2_inviter, 'decline');
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', page2_inviter, 'code', 'declined'));
  END IF;

  IF array_length(watcher_ids, 1) IS NOT NULL THEN
    FOREACH vid IN ARRAY watcher_ids LOOP
      UPDATE public.users SET relations = jsonb_set(relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'remove'))
      WHERE user_id = vid
        AND relations->'page1'->>'state' = 'watching'
        AND relations->'page1'->'profile'->>'user_id' = me_id::text;
      PERFORM public._add_restriction(me_id, vid, 'remove');
      notify_list := notify_list || jsonb_build_array(
        jsonb_build_object('user_id', vid, 'code', 'removed'));
    END LOOP;
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  UPDATE public.users SET relations =
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'locked')
    )
    || jsonb_strip_nulls(jsonb_build_object(
      'credits',      public._credits_ensure(relations)->'credits',
      'availability', public.user_availability(me_id, location::extensions.geography),
      'push',         relations->'push',
      'join_request', relations->'join_request'
    ))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_list);
END;
$function$;

-- ── app_logout_cleanup: no hold-clear (just carry credits) ─────────────────
CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row       public.users;
  page1_target uuid;
  page2_inviter uuid;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
  vid          uuid;
  msg          text := 'logout';
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  page1_target  := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  IF me_row.relations->'page2'->>'state' = 'pending' THEN
    page2_inviter := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;
  END IF;

  lock_ids := ARRAY[me_id];
  IF page1_target  IS NOT NULL THEN lock_ids := lock_ids || page1_target;  END IF;
  IF page2_inviter IS NOT NULL THEN lock_ids := lock_ids || page2_inviter; END IF;
  lock_ids := lock_ids || ARRAY(
    SELECT user_id FROM public.users
    WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
           OR relations->'page2'->'profile'->>'user_id' = me_id::text)
      AND user_id <> me_id
  );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'left'));
  END LOOP;

  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'cancelled-in'));
  END LOOP;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'locked', 'message', 'logout')
    ),
    '{credits}',
    public._credits_ensure(relations)->'credits'
  ) WHERE user_id = me_id;

  RETURN jsonb_build_object('notify', notify_list);
END;
$function$;

-- ── app_add: 2-arg _credits_charge ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row     public.users;
  cand_ids   uuid[];
  cand_dists int[];
  cand_id    uuid;
  cand_dist  int;
  cand_row   public.users;
  notify_arr jsonb := '[]'::jsonb;
  result_user json;
  i          int;
  last_add   timestamptz;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;

  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;

  SELECT array_agg(o.user_id ORDER BY rn), array_agg(o.distance ORDER BY rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.users w
        WHERE w.user_id = o.user_id
          AND w.relations->'page1'->'profile'->>'user_id' = me_id::text
          AND w.relations->'page1'->>'state' = 'watching'
      )
  ) o
  WHERE rn <= 2;

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(
    ARRAY[me_id] || COALESCE(cand_ids, ARRAY[]::uuid[])
  ) x))
  ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF me_row.relations->'page1'->>'state' = 'chat' THEN
    RETURN jsonb_build_object('error', 'in_chat');
  END IF;
  IF me_row.relations->'page2'->'profile' IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'page2_has_profile');
  END IF;
  last_add := NULLIF(me_row.relations->>'last_add_at', '')::timestamptz;
  IF last_add IS NOT NULL AND last_add > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('error', 'rate_limited', 'last_add_at', last_add);
  END IF;
  IF public._credits_balance(me_row.relations) < public._credits_cost('broadcast') THEN
    RETURN jsonb_build_object('error', 'no_credits');
  END IF;

  UPDATE public.users
  SET relations = public._credits_charge(
        jsonb_set(
          jsonb_set(relations, '{last_add_at}', to_jsonb(now())),
          '{page2}',
          CASE
            WHEN relations->'page2'->>'state' = 'free' THEN relations->'page2'
            ELSE jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
          END
        ),
        public._credits_cost('broadcast'))
  WHERE user_id = me_id;

  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;

  IF cand_ids IS NULL OR array_length(cand_ids, 1) = 0 THEN
    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
  END IF;

  FOR i IN 1..array_length(cand_ids, 1) LOOP
    cand_id   := cand_ids[i];
    cand_dist := cand_dists[i];
    SELECT * INTO cand_row FROM public.users WHERE user_id = cand_id;
    IF COALESCE(cand_row.relations->'page1'->>'state', 'free') IN ('free', 'locked')
       AND COALESCE(cand_row.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending') THEN
      UPDATE public.users SET relations = jsonb_set(
        relations, '{page1}',
        jsonb_build_object(
          'state', 'watching',
          'profile', public.make_profile(me_row, cand_dist)
        )
      ) WHERE user_id = cand_id;

      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profiles}',
        COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public.make_profile(cand_row, cand_dist))
      ) WHERE user_id = me_id
        AND relations->'page2'->>'state' = 'free';

      notify_arr := notify_arr || jsonb_build_array(jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text));
    END IF;
  END LOOP;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$function$;

-- ── Drop the now-orphaned hold/refund helpers ──────────────────────────────
DROP FUNCTION IF EXISTS public._credits_refund(jsonb);
DROP FUNCTION IF EXISTS public._credits_clear_hold(jsonb);
