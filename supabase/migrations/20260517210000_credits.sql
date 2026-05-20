-- Credits economy.
--
-- relations.credits = { balance:int, tier:'free'|'pro', granted_on:'YYYY-MM-DD'|null, held:int }
--
-- * Daily grant at 20:00 Asia/Jerusalem (driven by /ext/cron → app_credits_grant).
--   Tier caps: free 5/day (cap 5), pro 10/day (cap 10). Pro is not yet assigned.
--   "Max accumulation" == the tier's daily amount: grant = LEAST(cap, balance+daily).
-- * Costs: invite 1, approve 1, broadcast 2.
-- * An invite holds 1 credit until the invitee responds. The hold is REFUNDED
--   when the invite ends through no self-teardown by the sender (declined /
--   expired / kicked because the target matched or got invited elsewhere) and
--   FORFEITED when the sender tears it down himself (app_cancel / app_pause /
--   logout). On accept/match the hold is consumed.
-- * Findability gate: a user whose balance < cost('approve') (= 1) is dropped
--   from others() so nobody can invite someone who can't afford to accept.
--
-- Cost / tier numbers are mirrored in mobile/src/lib/credits.ts and the
-- server-side defaultRelations seed in supabase/functions/user.ts. The three
-- MUST stay in sync (see CLAUDE.md "Credits economy").

-- ── Config helpers (pure) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._credits_tier_cfg(tier text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(tier,'free'))
    WHEN 'pro' THEN jsonb_build_object('daily', 10, 'cap', 10)
    ELSE jsonb_build_object('daily', 5, 'cap', 5)
  END
$$;

CREATE OR REPLACE FUNCTION public._credits_cost(action text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(action)
    WHEN 'invite'    THEN 1
    WHEN 'approve'   THEN 1
    WHEN 'broadcast' THEN 2
    ELSE 0
  END
$$;

-- The grant "day" key = date of the most recent 20:00 Asia/Jerusalem boundary.
-- Before 20:00 local it is yesterday's date; at/after 20:00 it flips to today.
CREATE OR REPLACE FUNCTION public._credits_grant_day()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (timezone('Asia/Jerusalem', now()) - interval '20 hours')::date
$$;

-- The next 20:00 Asia/Jerusalem boundary as an absolute instant. Stored in
-- credits.next_grant_at so the client can format it without any client-side
-- timezone math (it just formats the timestamp).
CREATE OR REPLACE FUNCTION public._credits_next_grant_at()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT timezone('Asia/Jerusalem',
    ( (timezone('Asia/Jerusalem', now())::date
        + CASE WHEN timezone('Asia/Jerusalem', now())::time < time '20:00' THEN 0 ELSE 1 END)::timestamp
      + time '20:00' ))
$$;

-- Initial credits object for a brand-new / reset / freshly-granted user.
-- balance = the tier daily amount (free). granted_on = current grant day so the
-- next 20:00 tops up rather than the very next cron tick.
CREATE OR REPLACE FUNCTION public._credits_default()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'balance', (public._credits_tier_cfg('free')->>'daily')::int,
    'tier',    'free',
    'granted_on', public._credits_grant_day()::text,
    'next_grant_at', public._credits_next_grant_at(),
    'held',    0
  )
$$;

-- Returns relations guaranteed to carry a well-formed credits object.
CREATE OR REPLACE FUNCTION public._credits_ensure(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN coalesce(rel, '{}'::jsonb) ? 'credits'
      THEN coalesce(rel, '{}'::jsonb)
    ELSE jsonb_set(coalesce(rel, '{}'::jsonb), '{credits}', public._credits_default())
  END
$$;

CREATE OR REPLACE FUNCTION public._credits_balance(rel jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((rel->'credits'->>'balance')::numeric, 0)
$$;

-- Spend `amount`. When `hold` is true the spent amount is also recorded in
-- credits.held so it can be refunded if the invite is not accepted.
CREATE OR REPLACE FUNCTION public._credits_charge(rel jsonb, amount int, hold boolean)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH r AS (SELECT public._credits_ensure(rel) AS rel)
  SELECT jsonb_set(
    jsonb_set(r.rel, '{credits,balance}',
      to_jsonb(GREATEST(0, COALESCE((r.rel->'credits'->>'balance')::int,0) - amount))),
    '{credits,held}',
    to_jsonb(COALESCE((r.rel->'credits'->>'held')::int,0) + CASE WHEN hold THEN amount ELSE 0 END))
  FROM r
$$;

-- Refund a held credit: balance += held (capped at the tier cap), held = 0.
CREATE OR REPLACE FUNCTION public._credits_refund(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH r AS (SELECT public._credits_ensure(rel) AS rel)
  SELECT jsonb_set(
    jsonb_set(r.rel, '{credits,balance}',
      to_jsonb(LEAST(
        (public._credits_tier_cfg(COALESCE(r.rel->'credits'->>'tier','free'))->>'cap')::int,
        COALESCE((r.rel->'credits'->>'balance')::int,0) + COALESCE((r.rel->'credits'->>'held')::int,0)
      ))),
    '{credits,held}', '0'::jsonb)
  FROM r
$$;

-- Consume / forfeit a held credit without crediting balance (accept/match, or
-- a self-teardown where no refund is owed).
CREATE OR REPLACE FUNCTION public._credits_clear_hold(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_set(public._credits_ensure(rel), '{credits,held}', '0'::jsonb)
$$;

-- ── Backfill every existing user ───────────────────────────────────────────

UPDATE public.users
SET relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{credits}', public._credits_default())
WHERE NOT (coalesce(relations, '{}'::jsonb) ? 'credits');

-- ── Daily grant (called every minute by /ext/cron; acts once per grant day) ─

CREATE OR REPLACE FUNCTION public.app_credits_grant()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_day  date := public._credits_grant_day();
  v_next timestamptz := public._credits_next_grant_at();
  r      record;
  tier   text;
  cfg    jsonb;
  newbal int;
  cnt    int := 0;
BEGIN
  FOR r IN
    SELECT user_id, relations
    FROM public.users
    WHERE COALESCE(relations->'credits'->>'granted_on', '') <> v_day::text
  LOOP
    tier   := COALESCE(public._credits_ensure(r.relations)->'credits'->>'tier', 'free');
    cfg    := public._credits_tier_cfg(tier);
    newbal := LEAST(
                (cfg->>'cap')::int,
                COALESCE((public._credits_ensure(r.relations)->'credits'->>'balance')::int, 0)
                  + (cfg->>'daily')::int);
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

-- ── _kick_page1_at: refund a kicked WAITING user's held credit ─────────────
-- Every caller (approve / invite mass-kick, logout, delete) kicks the user
-- through no self-teardown of their own invite, so a waiting kickee is always
-- owed the refund.

CREATE OR REPLACE FUNCTION public._kick_page1_at(target_id uuid, exclude_id uuid, msg text)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE public.users u
  SET relations = CASE
    WHEN relations->'page1'->>'state' = 'waiting'
      THEN public._credits_refund(jsonb_set(relations, '{page1}',
             public._page1_locked(relations->'page1'->'profile', msg)))
    ELSE jsonb_set(relations, '{page1}',
           public._page1_locked(relations->'page1'->'profile', msg))
  END
  WHERE relations->'page1'->'profile'->>'user_id' = target_id::text
    AND COALESCE(relations->'page1'->>'state', '') <> 'locked'
    AND (exclude_id IS NULL OR u.user_id <> exclude_id)
  RETURNING u.user_id;
END;
$$;

-- ── app_invite: cost 1, held; mutual match consumes both sides ─────────────

CREATE OR REPLACE FUNCTION public.app_invite(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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
     OR COALESCE(target_row.relations->'page2'->>'state', 'free') NOT IN ('free')
     OR public._credits_balance(me_row.relations) < public._credits_cost('invite') THEN

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

    -- Mutual: both go to chat. me pays the invite cost (consumed, no hold);
    -- target's earlier invite hold is consumed.
    UPDATE public.users SET relations = public._credits_charge(jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(target_row, dist_m) - 'distance')
    ), public._credits_cost('invite'), false) WHERE user_id = me_id;

    UPDATE public.users SET relations = public._credits_clear_hold(jsonb_set(
      relations, '{page1}',
      jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance')
    )) WHERE user_id = target_id;

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

  -- Standard: me → waiting, charge 1 and HOLD it pending the response.
  UPDATE public.users SET relations = public._credits_charge(jsonb_set(
    relations, '{page1}',
    jsonb_build_object(
      'state', 'waiting',
      'profile', public.make_profile(target_row, dist_m),
      'invited_at', invited_at,
      'expires_at', expires_at
    )
  ), public._credits_cost('invite'), true) WHERE user_id = me_id;

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
$$;

-- ── app_approve: cost 1; refund approver's own abandoned invite ────────────

CREATE OR REPLACE FUNCTION public.app_approve(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  me_row        public.users;
  inviter_id    uuid;
  inviter_row   public.users;
  my_old_target uuid;
  dist_m        int;
  result_user   json;
  notify        jsonb := '[]'::jsonb;
  kicked        uuid;
  me_credits    jsonb;
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

  -- Effective credits for me: if I had an outgoing invite (page1='waiting')
  -- it is abandoned by matching here (NOT a self-cancel) → refund that hold
  -- first, then pay the approve cost.
  me_credits := CASE WHEN me_row.relations->'page1'->>'state' = 'waiting'
                     THEN public._credits_refund(me_row.relations)
                     ELSE me_row.relations END;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_balance(me_credits) < public._credits_cost('approve') THEN

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

  -- me: chat + page2 cleared. Keep credits: refund my own abandoned invite
  -- (already folded into me_credits) then charge the approve cost (consumed).
  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(inviter_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_charge(me_credits, public._credits_cost('approve'), false)->'credits'
  ) WHERE user_id = me_id;

  -- inviter: chat + page2 cleared. The inviter's invite to me is accepted →
  -- the held credit is consumed (no refund), balance preserved.
  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'chat', 'profile', public.make_profile(me_row, dist_m) - 'distance'),
      'page2', public._page2_locked(NULL, NULL)
    ),
    '{credits}',
    public._credits_clear_hold(relations)->'credits'
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

-- ── app_decline: refund the inviter's held credit ─────────────────────────

CREATE OR REPLACE FUNCTION public.app_decline(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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

  UPDATE public.users SET relations = public._credits_refund(jsonb_set(
    relations, '{page1}',
    public._page1_locked(relations->'page1'->'profile', 'decline')
  )) WHERE user_id = inviter_id
    AND relations->'page1'->>'state' = 'waiting'
    AND relations->'page1'->'profile'->>'user_id' = me_id::text;

  PERFORM public._add_restriction(me_id, inviter_id, 'decline');

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify',
    jsonb_build_array(jsonb_build_object('user_id', inviter_id, 'code', 'declined')));
END;
$$;

-- ── app_cancel: sender self-cancel → forfeit the held credit (NO refund) ───

CREATE OR REPLACE FUNCTION public.app_cancel(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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

  UPDATE public.users SET relations = public._credits_clear_hold(jsonb_set(
    relations, '{page1}',
    jsonb_build_object('state', 'locked')
  )) WHERE user_id = me_id;

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
$$;

-- ── app_add (broadcast): cost 2, consumed on activation ────────────────────

CREATE OR REPLACE FUNCTION public.app_add(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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
        public._credits_cost('broadcast'), false)
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
$$;

-- ── app_expire_sweep: refund the inviter on timeout ───────────────────────

CREATE OR REPLACE FUNCTION public.app_expire_sweep()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  row_rec         record;
  inviter_id      uuid;
  invitee_id      uuid;
  notify          jsonb := '[]'::jsonb;
  count_processed int := 0;
BEGIN
  -- Pass 1: inviter-driven -- locks inviter.page1 + invitee.page2.
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

    UPDATE public.users SET relations = public._credits_refund(jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'expire')
    )) WHERE user_id = inviter_id;

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

  -- Pass 2: orphaned incoming invites.
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
      UPDATE public.users SET relations = public._credits_refund(jsonb_set(
        relations, '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'expire')
      )) WHERE user_id = inviter_id
        AND relations->'page1'->>'state' = 'waiting'
        AND relations->'page1'->'profile'->>'user_id' = invitee_id::text;
    END IF;

    notify := notify
      || jsonb_build_array(jsonb_build_object('user_id', invitee_id, 'code', 'expired-in'));
    count_processed := count_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', count_processed, 'notify', notify);
END;
$$;

-- ── app_pause: self-teardown → forfeit own hold; refund declined inviter ──

CREATE OR REPLACE FUNCTION public.app_pause(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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
    UPDATE public.users SET relations = public._credits_refund(jsonb_set(
      relations, '{page1}',
      public._page1_locked(relations->'page1'->'profile', 'decline')
    )) WHERE user_id = page2_inviter
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

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'locked')
    ),
    '{credits}',
    public._credits_clear_hold(public._credits_ensure(relations))->'credits'
  ) WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify_list);
END;
$$;

-- ── app_resume: preserve credits across the relations rebuild ─────────────

CREATE OR REPLACE FUNCTION public.app_resume(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user json;
BEGIN
  PERFORM 1 FROM public.users WHERE user_id = me_id FOR UPDATE;

  UPDATE public.users SET relations = jsonb_set(
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    ),
    '{credits}',
    public._credits_ensure(relations)->'credits'
  ) WHERE user_id = me_id
    AND relations->'page1'->>'state' = 'locked'
    AND relations->'page2'->>'state' = 'locked';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- ── app_logout_cleanup: preserve credits, forfeit own hold ────────────────

CREATE OR REPLACE FUNCTION public.app_logout_cleanup(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
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
    public._credits_clear_hold(public._credits_ensure(relations))->'credits'
  ) WHERE user_id = me_id;

  RETURN jsonb_build_object('notify', notify_list);
END;
$$;

-- ── app_admin_reset: seed fresh credits for every user on a global reset ───

CREATE OR REPLACE FUNCTION public.app_admin_reset()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_users int;
begin
  delete from public.chat where user_id is not null;
  delete from public.log where user_id is not null;
  delete from public.restrictions where id is not null;

  update public.users set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.area_state(location),
      'credits', public._credits_default()
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

-- ── others(): drop users who can't afford to accept an invite ─────────────

CREATE OR REPLACE FUNCTION public.others(me users, only_available boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, "user" json, distance integer, relevance_gender double precision, relevance_restriction double precision, relevance_age double precision, relevance_location double precision, relevance_time double precision, relevance_watchers double precision, relevance_schedule double precision, relevance_kids double precision, relevance_broadcast double precision, relevance double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    END) relevance_broadcast
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
      OR public.area_available(other.location::extensions.geography)
    )
    AND (
      NOT only_available
      OR COALESCE((other.relations->'credits'->>'balance')::numeric, 0) >= public._credits_cost('approve')
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
  relevance_age *
  (CASE WHEN (me).range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / (me).range) END)
  *
  (CASE WHEN other_range IS NULL THEN 1.0 ELSE GREATEST(0.0, 1 - dist_meters / other_range) END)
  * relevance_time * relevance_watchers * relevance_schedule * relevance_kids * relevance_broadcast relevance
FROM relations
$function$;
