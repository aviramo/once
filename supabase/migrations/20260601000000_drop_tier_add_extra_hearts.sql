-- Drop the tier model (free/pro) and introduce purchasable EXTRA hearts.
--
-- New credits wallet shape:
--   relations.credits = {
--     balance: 0..3       -- daily pool, refilled to 3 every 20:00 Asia/Jerusalem
--     extra:   0..N       -- purchased pool (via app_buy_extra), no daily cap
--     held:    0..N       -- reserved against a live waiting invite
--     granted_on, next_grant_at
--   }
--   (the `tier` key is removed)
--
-- Charge order: balance FIRST, then extra (user request 2026-06-01).
-- Refund order: balance up to cap=3 first, overflow into extra (no hearts
--   are ever lost on a hold+refund cycle).
-- Affordability is `_credits_total = balance + extra`. The deployed mobile
-- build reads credits.balance only — old clients see only the daily pool
-- and treat tier-undefined as 'free' (existing fallback) → degrades cleanly.
--
-- Endpoint changes:
--   - app_set_tier kept as a no-op (deprecated; deployed builds still call
--     it from the settings popup; new mobile UI removes the button).
--   - app_buy_extra(me_id, count) NEW: validates count ∈ {5,10,50} (the
--     three options the new mobile popup surfaces), adds to credits.extra.
--
-- Auto-hide on zero hearts is implemented in the edge dispatcher (not here):
--   when balance + extra hits 0 and page2.state='free', the dispatcher
--   fires app_lock2 fire-and-forget. The mobile hidden-state UI then
--   shows a "buy extra hearts" CTA in place of the "go visible" button.

-- 1) Cap constant (replaces the tier-cfg lookup; daily == cap == 3).

CREATE OR REPLACE FUNCTION public._credits_cap()
RETURNS int LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 3 $$;

-- 2) New default wallet shape.

CREATE OR REPLACE FUNCTION public._credits_default()
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'balance', public._credits_cap(),
    'extra',   0,
    'held',    0,
    'granted_on',    public._credits_grant_day()::text,
    'next_grant_at', public._credits_next_grant_at()
  )
$$;

-- 3) Rebuild a credits subtree so every wallet carries `balance`, `extra`,
-- `held`, plus the optional grant fields. Strips any legacy `tier` key.

CREATE OR REPLACE FUNCTION public._credits_ensure(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN coalesce(rel, '{}'::jsonb) ? 'credits' THEN
      jsonb_set(rel, '{credits}', jsonb_strip_nulls(jsonb_build_object(
        'balance', COALESCE((rel->'credits'->>'balance')::int, 0),
        'extra',   COALESCE((rel->'credits'->>'extra')::int,   0),
        'held',    COALESCE((rel->'credits'->>'held')::int,    0),
        'granted_on',    rel->'credits'->>'granted_on',
        'next_grant_at', rel->'credits'->'next_grant_at'
      )))
    ELSE jsonb_set(coalesce(rel, '{}'::jsonb), '{credits}', public._credits_default())
  END
$$;

-- 4) Accessors. `_credits_balance` keeps its old "daily pool" semantics so
-- the few callers reading the daily-pool count continue to work; the new
-- `_credits_total` is what every affordability / gate check uses.

CREATE OR REPLACE FUNCTION public._credits_extra(rel jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE
AS $$ SELECT COALESCE((rel->'credits'->>'extra')::numeric, 0) $$;

CREATE OR REPLACE FUNCTION public._credits_total(rel jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE((rel->'credits'->>'balance')::numeric, 0)
       + COALESCE((rel->'credits'->>'extra')::numeric,   0)
$$;

-- 5) Charging takes from balance first, then extra. Refunds restore balance
-- up to cap; overflow lands in extra so no hearts are lost on a hold+refund
-- cycle (e.g. when the daily grant topped up balance while a heart was held).

CREATE OR REPLACE FUNCTION public._credits_charge(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH r AS (
    SELECT public._credits_ensure(rel) AS r, GREATEST(0, amount) AS amt
  ), v AS (
    SELECT r.r,
           COALESCE((r.r->'credits'->>'balance')::int, 0) AS bal,
           COALESCE((r.r->'credits'->>'extra')::int,   0) AS ext,
           r.amt
    FROM r
  )
  SELECT jsonb_set(
           jsonb_set(v.r, '{credits,balance}',
             to_jsonb(v.bal - LEAST(v.bal, v.amt))),
           '{credits,extra}',
             to_jsonb(GREATEST(0, v.ext - GREATEST(0, v.amt - v.bal))))
  FROM v
$$;

CREATE OR REPLACE FUNCTION public._credits_hold(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  -- Charge from balance first / extra second; add the same amount to held.
  WITH c AS (SELECT public._credits_charge(rel, amount) AS r)
  SELECT jsonb_set(c.r, '{credits,held}',
    to_jsonb(GREATEST(0, COALESCE((c.r->'credits'->>'held')::int, 0) + amount)))
  FROM c
$$;

CREATE OR REPLACE FUNCTION public._credits_refund(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH r AS (
    SELECT public._credits_ensure(rel) AS r, GREATEST(0, amount) AS amt
  ), v AS (
    SELECT r.r,
           COALESCE((r.r->'credits'->>'balance')::int, 0) AS bal,
           COALESCE((r.r->'credits'->>'extra')::int,   0) AS ext,
           COALESCE((r.r->'credits'->>'held')::int,    0) AS hld,
           r.amt,
           public._credits_cap() AS cap
    FROM r
  )
  SELECT jsonb_set(
           jsonb_set(
             jsonb_set(v.r, '{credits,balance}',
               to_jsonb(LEAST(v.cap, v.bal + v.amt))),
             '{credits,extra}',
               to_jsonb(v.ext + GREATEST(0, v.bal + v.amt - v.cap))),
           '{credits,held}',
             to_jsonb(GREATEST(0, v.hld - v.amt)))
  FROM v
$$;

-- _credits_clear_hold body is unchanged; recreate to refresh the search path
-- (and dropping the old version would cascade unnecessarily).
CREATE OR REPLACE FUNCTION public._credits_clear_hold(rel jsonb, amount integer)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  WITH r AS (SELECT public._credits_ensure(rel) AS rel)
  SELECT jsonb_set(r.rel, '{credits,held}',
    to_jsonb(GREATEST(0, COALESCE((r.rel->'credits'->>'held')::int, 0) - amount)))
  FROM r
$$;

-- 6) Daily grant: top balance up to cap. Extra is preserved verbatim (it's
-- the purchased pool, not part of the daily replenishment cycle).

CREATE OR REPLACE FUNCTION public.app_credits_grant()
RETURNS jsonb LANGUAGE plpgsql
AS $$
DECLARE
  v_day  date        := public._credits_grant_day();
  v_next timestamptz := public._credits_next_grant_at();
  v_cap  int         := public._credits_cap();
  r      record;
  newbal int;
  cnt    int := 0;
BEGIN
  FOR r IN
    SELECT user_id, relations
    FROM public.users
    WHERE COALESCE(relations->'credits'->>'granted_on', '') <> v_day::text
  LOOP
    newbal := LEAST(
                v_cap,
                COALESCE((public._credits_ensure(r.relations)->'credits'->>'balance')::int, 0) + v_cap);
    UPDATE public.users u
    SET relations = jsonb_set(
      jsonb_set(
        jsonb_set(public._credits_ensure(u.relations), '{credits,balance}', to_jsonb(newbal)),
        '{credits,granted_on}', to_jsonb(v_day::text)),
      '{credits,next_grant_at}', to_jsonb(v_next))
    WHERE u.user_id = r.user_id;
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('processed', cnt, 'day', v_day::text);
END;
$$;

-- 7) Purchase RPC. count is validated against the offered options. Adds the
-- count to credits.extra, leaving balance / held / grant fields untouched.
-- Pricing isn't modeled server-side (mobile shows them as "Free"); when
-- real pricing is wired up the receipt verification happens in mobile (or
-- a separate edge fn) and only on success is this RPC invoked.

CREATE OR REPLACE FUNCTION public.app_buy_extra(me_id uuid, p_count integer)
RETURNS jsonb LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt       int := COALESCE(p_count, 0);
  result_user json;
BEGIN
  IF v_cnt NOT IN (5, 10, 50) THEN
    RETURN jsonb_build_object('error', 'bad_count');
  END IF;

  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  UPDATE public.users
  SET relations = jsonb_set(
    public._credits_ensure(relations),
    '{credits,extra}',
    to_jsonb(COALESCE((public._credits_ensure(relations)->'credits'->>'extra')::int, 0) + v_cnt))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- 8) app_set_tier: kept as a no-op so the deployed mobile build's
-- "Upgrade to Pro" button doesn't error out. The new mobile UI removes the
-- button; once that build is live everywhere, this RPC can be dropped (see
-- BACKWARD_COMPAT.md). Validates the input shape so a malformed call is
-- still rejected, but never mutates the wallet.

CREATE OR REPLACE FUNCTION public.app_set_tier(me_id uuid, new_tier text)
RETURNS jsonb LANGUAGE plpgsql
AS $$
DECLARE
  v_tier      text := lower(coalesce(new_tier, ''));
  result_user json;
BEGIN
  IF v_tier NOT IN ('free', 'pro') THEN
    RETURN jsonb_build_object('error', 'bad_tier');
  END IF;
  -- DEPRECATED: tier model retired 2026-06-01. The RPC stays here as a
  -- friendly no-op for the deployed mobile build (returns the current user
  -- so the client renders no error); the new mobile UI does not call it.
  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- 9) Affordability gates in the three charging RPCs now consult total
-- spendable (balance + extra). Apart from the helper swap the bodies are
-- preserved verbatim from the live functions.

CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql
AS $$
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

  -- Inviting holds 1 heart (balance first, extra second). Block when the
  -- wallet can't cover. No state change on this failure branch.
  IF public._credits_total(me_row.relations) < public._credits_cost('invite') THEN
    RETURN jsonb_build_object('error', 'no_credits');
  END IF;

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
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m, me_id) - 'distance')
    ) WHERE user_id = me_id;

    UPDATE public.users SET relations = jsonb_set(
      public._credits_refund(relations, public._credits_cost('invite')),
      '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, target_id) - 'distance')
    ) WHERE user_id = target_id;

    FOR kicked IN SELECT * FROM public._kick_page1_at(me_id, target_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;
    FOR kicked IN SELECT * FROM public._kick_page1_at(target_id, me_id, 'invite') LOOP
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', kicked, 'code', 'kick-match'));
    END LOOP;

    notify := notify || jsonb_build_array(jsonb_build_object('user_id', me_id,     'code', 'match'));
    notify := notify || jsonb_build_array(jsonb_build_object('user_id', target_id, 'code', 'match'));

    SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
    RETURN jsonb_build_object('user', result_user, 'notify', notify);
  END IF;

  UPDATE public.users SET relations = jsonb_set(
    public._credits_hold(relations, public._credits_cost('invite')),
    '{page1}',
    jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m, me_id),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2}',
    jsonb_build_object(
      'state', 'pending',
      'profile', public.make_profile(me_row, dist_m, target_id),
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
$$;

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql
AS $$
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

  v_approve_cost := CASE
    WHEN COALESCE(
           NULLIF(me_row.relations->>'last_add_at','')::timestamptz
             > now() - interval '30 minutes', false)
    THEN 0 ELSE public._credits_cost('approve') END;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_total(me_row.relations) < v_approve_cost THEN

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
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m, me_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_row.relations, v_approve_cost)->'credits'
  ) WHERE user_id = me_id;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m, inviter_id) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_refund(relations, public._credits_cost('invite'))->'credits'
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
$$;

CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql
AS $$
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
  viewer_ids uuid[];
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

  viewer_ids := ARRAY(
    SELECT (p->>'user_id')::uuid
    FROM jsonb_array_elements(COALESCE(me_row.relations->'page2'->'profiles', '[]'::jsonb)) p
    WHERE p->>'user_id' IS NOT NULL
  );

  SELECT array_agg(o.user_id ORDER BY rn), array_agg(o.distance ORDER BY rn)
  INTO cand_ids, cand_dists
  FROM (
    SELECT o.user_id, o.distance, ROW_NUMBER() OVER (ORDER BY o.relevance DESC) rn
    FROM public.others(me_row, true) o
    WHERE o.relevance > 0
      AND NOT (o.user_id = ANY(viewer_ids))
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
  IF public._credits_total(me_row.relations) < public._credits_cost('broadcast') THEN
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
          'profile', public.make_profile(me_row, cand_dist, cand_id)
        )
      ) WHERE user_id = cand_id;

      UPDATE public.users SET relations = jsonb_set(
        relations, '{page2,profiles}',
        COALESCE(relations->'page2'->'profiles', '[]'::jsonb) || jsonb_build_array(public._slim_viewer(public.make_profile(cand_row, cand_dist)))
      ) WHERE user_id = me_id
        AND relations->'page2'->>'state' = 'free';

      notify_arr := notify_arr || jsonb_build_array(jsonb_build_object('user_id', cand_id::text, 'code', 'candidate', 'actor_id', me_id::text));
    END IF;
  END LOOP;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_arr);
END;
$$;

-- 10) others() credit candidacy clause: now sums balance + extra.

DROP FUNCTION IF EXISTS public.others(public.users, boolean);
CREATE OR REPLACE FUNCTION public.others(me public.users, only_available boolean DEFAULT false)
RETURNS TABLE(user_id uuid, "user" json, distance integer,
              relevance_gender double precision, relevance_restriction double precision,
              relevance_age double precision, relevance_location double precision,
              relevance_time double precision, relevance_watchers double precision,
              relevance_schedule double precision, relevance_kids double precision,
              relevance_broadcast double precision, relevance_group double precision,
              relevance double precision)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
WITH relations AS (
  SELECT
    other.user_id,
    row_to_json(other) "user",
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography)::int AS distance,
    extensions.st_distance((me).location::extensions.geography, other.location::extensions.geography) AS dist_meters,
    other.range AS other_range,
    1::double precision relevance_gender,
    1::double precision relevance_restriction,
    (CASE WHEN (me).age_from = (me).age_to
      THEN CASE WHEN EXTRACT(year FROM age(other.birth_date)) = (me).age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age(other.birth_date)) - ((me).age_from + (me).age_to) / 2.0) / (((me).age_to - (me).age_from) / 2.0))
    END)
    *
    (CASE WHEN other.age_from = other.age_to
      THEN CASE WHEN EXTRACT(year FROM age((me).birth_date)) = other.age_from THEN 1.0 ELSE 0.0 END
      ELSE GREATEST(0.0, 1 - abs(EXTRACT(year FROM age((me).birth_date)) - (other.age_from + other.age_to) / 2.0) / ((other.age_to - other.age_from) / 2.0))
    END) relevance_age,
    GREATEST(0.0, 1 - (EXTRACT(epoch FROM (now() - other.last_seen)) / 60.0 / 60.0 / 24.0 / 365.0)) relevance_time,
    GREATEST(0.0, (5 - COALESCE(jsonb_array_length(other.relations->'page2'->'profiles'), 0)) / 5.0) relevance_watchers,
    public.schedule_overlap((me).data, other.data) relevance_schedule,
    public.kids_preference_match((me).data, other.data) relevance_kids,
    (CASE
      WHEN NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      THEN 2.0 ELSE 1.0
    END) relevance_broadcast,
    (CASE
      WHEN public._shared_group_name((me).user_id, other.user_id) IS NOT NULL
      THEN 3.0 ELSE 1.0
    END) relevance_group
  FROM public.users other
  WHERE other.user_id IS DISTINCT FROM (me).user_id
    AND (
      LEAST((me).range, other.range) IS NULL
      OR (me).location IS NULL
      OR other.location IS NULL
      OR extensions.st_dwithin(
        (me).location::extensions.geography,
        other.location::extensions.geography,
        LEAST((me).range, other.range)
      )
    )
    AND (
      ((me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_male) OR
      ((me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_male) OR
      (NOT (me).is_male AND other.is_male AND (me).is_for_male AND other.is_for_female) OR
      (NOT (me).is_male AND NOT other.is_male AND (me).is_for_female AND other.is_for_female)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.restrictions r
      WHERE ((r.user_id = (me).user_id AND r.other_id = other.user_id)
          OR (r.other_id = (me).user_id AND r.user_id = other.user_id))
        AND ((r.key IN ('ignore', 'cancel', 'remove') AND r.created_at > now() - interval '1 day')
          OR (r.key = 'decline' AND r.created_at > now() - interval '7 days')
          OR (r.key = 'leave'   AND r.created_at > now() - interval '14 days')
          OR r.key = 'block')
    )
    AND NOT (
      jsonb_typeof((me).data->'family'->'isForKids') = 'boolean'
      AND jsonb_typeof(other.data->'family'->'isForKids') = 'boolean'
      AND ((me).data->'family'->>'isForKids')::bool IS DISTINCT FROM (other.data->'family'->>'isForKids')::bool
    )
    AND (
      NOT only_available
      OR (
        COALESCE(other.relations->'page1'->>'state', 'free') <> 'chat'
        AND COALESCE(other.relations->'page2'->>'state', 'free') NOT IN ('locked', 'pending')
      )
    )
    AND (
      NOT only_available
      OR other.location IS NOT NULL
    )
    AND (
      NOT only_available
      OR NOT public.push_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR NOT public.group_blocked(other.user_id)
    )
    AND (
      NOT only_available
      OR public.area_available(other.location)
    )
    AND (
      NOT only_available
      OR NULLIF(other.relations->>'last_add_at', '')::timestamptz > now() - interval '30 minutes'
      OR (COALESCE((other.relations->'credits'->>'balance')::numeric, 0)
        + COALESCE((other.relations->'credits'->>'extra')::numeric,   0))
        >= public._credits_cost('approve')
    )
)
SELECT
  user_id,
  "user",
  distance,
  relevance_gender,
  relevance_restriction,
  relevance_age,
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END) relevance_location,
  relevance_time,
  relevance_watchers,
  relevance_schedule,
  relevance_kids,
  relevance_broadcast,
  relevance_group,
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast * relevance_group relevance
FROM relations
$$;

-- 11) Admin metrics + facets: replace tier counts with extra_total / with_extra.
-- Both overloads need DROP first because PG refuses to remove the DEFAULT
-- on an existing function's parameter via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.admin_dashboard_metrics();
DROP FUNCTION IF EXISTS public.admin_dashboard_metrics(uuid[]);

CREATE FUNCTION public.admin_dashboard_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men', (SELECT count(*) FROM public.users WHERE is_male = true),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL),
      'os_ios', (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android')
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.users),
      'new_today', (SELECT count(*) FROM public.users
        WHERE (created_at at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'new_7d', (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'),
      'new_30d', (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days'),
      'online_5m', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes'),
      'active_today', (SELECT count(*) FROM public.users
        WHERE (last_seen at time zone 'Asia/Jerusalem')::date
            = (now() at time zone 'Asia/Jerusalem')::date),
      'active_7d', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'),
      'active_30d', (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days'),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL)
    ),
    'engagement', jsonb_build_object(
      'chat', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'chat'),
      'waiting', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'waiting'),
      'watching', (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'watching'),
      'pending', (SELECT count(*) FROM public.users WHERE relations->'page2'->>'state' = 'pending'),
      'broadcasting', (SELECT count(*) FROM public.users
        WHERE (relations->>'last_add_at') IS NOT NULL
          AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes')
    ),
    'availability', jsonb_build_object(
      'available', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable'),
      'not_yet', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'),
      'unknown', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL),
      'no_notif', (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$'),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0)
    ),
    'areas', jsonb_build_object(
      'total', (SELECT count(*) FROM public.areas),
      'active', (SELECT count(*) FROM public.areas WHERE mode = 'active'),
      'scheduled', (SELECT count(*) FROM public.areas WHERE mode = 'scheduled'),
      'disabled', (SELECT count(*) FROM public.areas WHERE mode = 'disabled')
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days'),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days'),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days'),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days')
    )
  )
$$;

CREATE FUNCTION public.admin_dashboard_metrics(p_user_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'demographics', jsonb_build_object(
      'men',   (SELECT count(*) FROM public.users WHERE is_male = true  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'women', (SELECT count(*) FROM public.users WHERE is_male = false AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'avg_age', (SELECT coalesce(floor(avg(extract(year from age(now(), birth_date))))::int, 0)
        FROM public.users WHERE birth_date IS NOT NULL AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_ios',     (SELECT count(*) FROM public.users WHERE data->>'os' = 'ios'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'os_android', (SELECT count(*) FROM public.users WHERE data->>'os' = 'android' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'users', jsonb_build_object(
      'total',         (SELECT count(*) FROM public.users WHERE (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_today',     (SELECT count(*) FROM public.users WHERE (created_at at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_7d',        (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'new_30d',       (SELECT count(*) FROM public.users WHERE created_at > now() - interval '30 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'online_5m',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '5 minutes' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_today',  (SELECT count(*) FROM public.users WHERE (last_seen at time zone 'Asia/Jerusalem')::date = (now() at time zone 'Asia/Jerusalem')::date AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_7d',     (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '7 days'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'active_30d',    (SELECT count(*) FROM public.users WHERE last_seen > now() - interval '30 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_location', (SELECT count(*) FROM public.users WHERE location IS NOT NULL                   AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'engagement', jsonb_build_object(
      'chat',         (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'chat'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'waiting',      (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'waiting'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'watching',     (SELECT count(*) FROM public.users WHERE relations->'page1'->>'state' = 'watching' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'pending',      (SELECT count(*) FROM public.users WHERE relations->'page2'->>'state' = 'pending'  AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'broadcasting', (SELECT count(*) FROM public.users WHERE (relations->>'last_add_at') IS NOT NULL AND (relations->>'last_add_at')::timestamptz > now() - interval '30 minutes' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'availability', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'available'   AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unavailable', (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'unavailable' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'not_yet',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' = 'not_yet'     AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'unknown',     (SELECT count(*) FROM public.users WHERE relations->'availability'->>'state' IS NULL          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'no_notif',    (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id) AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids)))
    ),
    'credits', jsonb_build_object(
      'balance_total', (SELECT coalesce(sum((relations->'credits'->>'balance')::int), 0)
        FROM public.users WHERE relations->'credits'->>'balance' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'held_total', (SELECT coalesce(sum((relations->'credits'->>'held')::int), 0)
        FROM public.users WHERE relations->'credits'->>'held' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'extra_total', (SELECT coalesce(sum((relations->'credits'->>'extra')::int), 0)
        FROM public.users WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'with_extra', (SELECT count(*) FROM public.users
        WHERE relations->'credits'->>'extra' ~ '^[0-9]+$'
          AND (relations->'credits'->>'extra')::int > 0
          AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    ),
    'areas', jsonb_build_object(
      'total',     (SELECT count(*) FROM public.areas),
      'active',    (SELECT count(*) FROM public.areas WHERE mode = 'active'),
      'scheduled', (SELECT count(*) FROM public.areas WHERE mode = 'scheduled'),
      'disabled',  (SELECT count(*) FROM public.areas WHERE mode = 'disabled')
    ),
    'groups', jsonb_build_object(
      'total', (SELECT count(*) FROM public.groups)
    ),
    'funnel_7d', jsonb_build_object(
      'signups',  (SELECT count(*) FROM public.users WHERE created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'invites',  (SELECT count(*) FROM public.log WHERE key = 'invite'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'approves', (SELECT count(*) FROM public.log WHERE key = 'approve' AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'messages', (SELECT count(*) FROM public.chat WHERE created_at > now() - interval '7 days' AND coalesce(is_event, false) = false AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids) OR other_id = ANY(p_user_ids))),
      'logouts',  (SELECT count(*) FROM public.log WHERE key = 'logout'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids))),
      'deletes',  (SELECT count(*) FROM public.log WHERE key = 'delete'  AND status < 400 AND created_at > now() - interval '7 days' AND (p_user_ids IS NULL OR user_id = ANY(p_user_ids)))
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_metrics()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_metrics(uuid[]) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_facet_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.users),
    'groups_none', (
      SELECT count(*) FROM public.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.user_groups ug WHERE ug.user_id = u.user_id)
    ),
    'p1', coalesce((
      SELECT jsonb_object_agg(st, c)
      FROM (
        SELECT u.relations->'page1'->>'state' AS st, count(*) c
        FROM public.users u
        WHERE u.relations->'page1'->>'state' IS NOT NULL
        GROUP BY 1
      ) q
    ), '{}'::jsonb),
    'p2', coalesce((
      SELECT jsonb_object_agg(st, c)
      FROM (
        SELECT u.relations->'page2'->>'state' AS st, count(*) c
        FROM public.users u
        WHERE u.relations->'page2'->>'state' IS NOT NULL
        GROUP BY 1
      ) q
    ), '{}'::jsonb),
    'groups', coalesce((
      SELECT jsonb_object_agg(group_id::text, c)
      FROM (
        SELECT ug.group_id, count(*) c
        FROM public.user_groups ug
        GROUP BY ug.group_id
      ) q
    ), '{}'::jsonb),
    'avail', jsonb_build_object(
      'available',   (SELECT count(*) FROM public.users u WHERE u.relations->'availability'->>'state' = 'available'),
      'unavailable', (SELECT count(*) FROM public.users u WHERE u.relations->'availability'->>'state' = 'unavailable'),
      'not_yet',     (SELECT count(*) FROM public.users u WHERE u.relations->'availability'->>'state' = 'not_yet'),
      'unknown',     (SELECT count(*) FROM public.users u WHERE u.relations->'availability'->>'state' IS NULL)
    ),
    'gender', jsonb_build_object(
      'male',   (SELECT count(*) FROM public.users u WHERE u.is_male = true),
      'female', (SELECT count(*) FROM public.users u WHERE u.is_male = false)
    ),
    'os', jsonb_build_object(
      'ios',     (SELECT count(*) FROM public.users u WHERE u.data->>'os' = 'ios'),
      'android', (SELECT count(*) FROM public.users u WHERE u.data->>'os' = 'android')
    ),
    'seg', jsonb_build_object(
      'online',       (SELECT count(*) FROM public.users u WHERE u.last_seen >= now() - interval '5 minutes'),
      'active_today', (SELECT count(*) FROM public.users u WHERE u.last_seen >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'active_7d',    (SELECT count(*) FROM public.users u WHERE u.last_seen >= now() - interval '7 days'),
      'active_30d',   (SELECT count(*) FROM public.users u WHERE u.last_seen >= now() - interval '30 days'),
      'new_today',    (SELECT count(*) FROM public.users u WHERE u.created_at >= (date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')),
      'new_7d',       (SELECT count(*) FROM public.users u WHERE u.created_at >= now() - interval '7 days'),
      'new_30d',      (SELECT count(*) FROM public.users u WHERE u.created_at >= now() - interval '30 days'),
      'located',      (SELECT count(*) FROM public.users u WHERE u.location IS NOT NULL),
      'broadcasting', (SELECT count(*) FROM public.users u WHERE nullif(u.relations->>'last_add_at','')::timestamptz >= now() - interval '30 minutes'),
      'held',         (SELECT count(*) FROM public.users u WHERE u.relations->'credits'->>'held' IS NOT NULL AND u.relations->'credits'->>'held' <> '0'),
      'extra',        (SELECT count(*) FROM public.users u WHERE u.relations->'credits'->>'extra' ~ '^[0-9]+$' AND (u.relations->'credits'->>'extra')::int > 0),
      'no_notif',     (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id))
    )
  )
$$;

-- 12) Data backfill: drop `tier`, add `extra`, preserving total hearts. A
-- user with balance>3 (only legacy `pro` could have that) gets the spillover
-- moved into `extra`. Apply to every row so post-migration state is clean.

UPDATE public.users
SET relations = jsonb_set(
  relations,
  '{credits}',
  jsonb_strip_nulls(jsonb_build_object(
    'balance', LEAST(COALESCE((relations->'credits'->>'balance')::int, 3), public._credits_cap()),
    'extra',   COALESCE((relations->'credits'->>'extra')::int, 0)
               + GREATEST(0, COALESCE((relations->'credits'->>'balance')::int, 0) - public._credits_cap()),
    'held',    COALESCE((relations->'credits'->>'held')::int, 0),
    'granted_on',    to_jsonb(relations->'credits'->>'granted_on'),
    'next_grant_at', relations->'credits'->'next_grant_at'
  ))
)
WHERE user_id IS NOT NULL;

-- _credits_tier_cfg + _credits_reset_to_cap are no longer needed (no tier),
-- but they're still referenced by nothing live and harmless. Drop them to
-- keep the namespace tidy.

DROP FUNCTION IF EXISTS public._credits_reset_to_cap(jsonb);
DROP FUNCTION IF EXISTS public._credits_tier_cfg(text);
