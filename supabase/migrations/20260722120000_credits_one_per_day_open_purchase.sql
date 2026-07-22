-- Credits rework 2026-07-22: one credit a day, purchase always open, and a
-- zero-credit user stays discoverable until they actually refuse to pay.
--
-- WHY. The economy was inert: 82 users, 4 invites/7d, nobody had ever spent
-- below 3/3, zero purchases. Three rules were working against the goal
-- ("make people pay as early as possible"):
--
--   1. The daily grant (3) was far above real usage, so the wallet never
--      became a decision.
--   2. app_buy_extra refused a purchase unless the wallet was EMPTY
--      ('has_credits') and allowed at most one purchase per grant day
--      ('already_bought_today'). Paying was structurally discouraged.
--   3. Hitting zero auto-hid the user (the edge dispatcher's maybeAutoHide
--      -> app_lock2) and others() dropped them from candidacy, so a
--      zero-credit user never received the invitation that would have been
--      the reason to pay. The paywall moment could not happen.
--
-- WHAT CHANGES.
--   * _credits_cap 3 -> 1. One credit a day.
--   * app_buy_extra drops both gates. Counts stay {3,10,50} -- the deployed
--     mobile build posts count=3 and must keep working (no wire break).
--   * others(): a user at zero credits IS still discoverable, so an invite
--     can reach them and the accept button becomes the paywall. They drop
--     out of the pool only once they have hit "approve" and could not pay
--     (credits.unpaid_at), and they come back the moment the wallet is
--     funded again (every funding path clears the mark).
--   * A HELD credit never hides anyone. With a daily pool of 1, sending an
--     invite zeroes the wallet; the sender has money in play, not a refusal,
--     so app_approve does not mark them and others() keeps them listed.
--
-- The matching edge-function change (deleting maybeAutoHide) ships with this
-- migration -- without it the auto-lock would still remove zero-credit users
-- from the pool and defeat rule 3 above.
--
-- Nothing here changes a response shape, a field the app reads, or an
-- endpoint. `credits.unpaid_at` is a new server-only key (old clients ignore
-- unknown keys). See BACKWARD_COMPAT.md for the two cross-version notes.

-- 1) Daily cap: 3 -> 1. Read by _credits_default (new wallets),
--    app_credits_grant (the 20:00 Asia/Jerusalem top-up) and _credits_refund
--    (the balance ceiling; overflow spills into `extra`, never lost).
--    Existing balances are NOT clamped: the next grant lands them on 1 by
--    itself, and taking hearts off a live wallet buys nothing.

CREATE OR REPLACE FUNCTION public._credits_cap()
RETURNS int LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 1 $$;

-- 2) _credits_ensure rebuilds the whole credits subtree, so every key that
--    must survive a credit RPC has to be listed here. `unpaid_at` joins
--    `bought_on` for the same reason.

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
        'next_grant_at', rel->'credits'->'next_grant_at',
        'bought_on',     rel->'credits'->>'bought_on',
        'unpaid_at',     rel->'credits'->>'unpaid_at'
      )))
    ELSE jsonb_set(coalesce(rel, '{}'::jsonb), '{credits}', public._credits_default())
  END
$$;

-- 3) The unpaid mark. Set ONLY by app_approve, when a live invitation was
--    declined by the wallet rather than by the user. Cleared by every path
--    that puts credits back in the wallet (grant / buy / refund), which is
--    what "until they have credits" means operationally.

CREATE OR REPLACE FUNCTION public._credits_mark_unpaid(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT jsonb_set(public._credits_ensure(rel), '{credits,unpaid_at}', to_jsonb(now()))
$$;

CREATE OR REPLACE FUNCTION public._credits_clear_unpaid(rel jsonb)
RETURNS jsonb LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN coalesce(rel, '{}'::jsonb)->'credits' ? 'unpaid_at'
      THEN jsonb_set(rel, '{credits}', (rel->'credits') - 'unpaid_at')
    ELSE rel
  END
$$;

-- 4) Refund is a funding path (a held credit coming home), so it clears the
--    mark. Body otherwise verbatim from the live function.

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
  SELECT public._credits_clear_unpaid(
           jsonb_set(
             jsonb_set(
               jsonb_set(v.r, '{credits,balance}',
                 to_jsonb(LEAST(v.cap, v.bal + v.amt))),
               '{credits,extra}',
                 to_jsonb(v.ext + GREATEST(0, v.bal + v.amt - v.cap))),
             '{credits,held}',
               to_jsonb(GREATEST(0, v.hld - v.amt))))
  FROM v
$$;

-- 5) The daily grant clears the mark too: 20:00 funds the wallet, so anyone
--    parked outside the pool for not paying is back in it.

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
    SET relations = public._credits_clear_unpaid(jsonb_set(
      jsonb_set(
        jsonb_set(public._credits_ensure(u.relations), '{credits,balance}', to_jsonb(newbal)),
        '{credits,granted_on}', to_jsonb(v_day::text)),
      '{credits,next_grant_at}', to_jsonb(v_next)))
    WHERE u.user_id = r.user_id;
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('processed', cnt, 'day', v_day::text);
END;
$$;

-- 6) Purchase is always available. Both gates are gone: buying is no longer a
--    recovery mechanism you may only reach when broke and only once a day, it
--    is the product's paid path. `bought_on` is still stamped -- it is now a
--    record (last purchase day), not a throttle.
--
--    Counts stay {3,10,50}: the deployed mobile build posts count=3, and
--    narrowing the set would 400 it. The daily grant dropping to 1 makes the
--    3-credit pack three days of allowance, which is the intended value.

CREATE OR REPLACE FUNCTION public.app_buy_extra(me_id uuid, p_count integer)
RETURNS jsonb LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt       int := COALESCE(p_count, 0);
  v_rel       jsonb;
  v_day       text := public._credits_grant_day()::text;
  result_user json;
BEGIN
  IF v_cnt NOT IN (3, 10, 50) THEN
    RETURN jsonb_build_object('error', 'bad_count');
  END IF;

  SELECT relations INTO v_rel FROM public.users WHERE user_id = me_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  v_rel := public._credits_ensure(v_rel);

  UPDATE public.users
  SET relations = public._credits_clear_unpaid(jsonb_set(
    jsonb_set(
      v_rel,
      '{credits,extra}',
      to_jsonb(COALESCE((v_rel->'credits'->>'extra')::int, 0) + v_cnt)),
    '{credits,bought_on}',
    to_jsonb(v_day)))
  WHERE user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', '[]'::jsonb);
END;
$$;

-- 7) app_approve stamps the unpaid mark. Body verbatim from the live function
--    except for v_broke and the CASE inside the failure UPDATE.
--
--    v_broke is deliberately narrow: the invitation was LIVE and correct, and
--    the ONLY reason the approve failed is that the wallet could not cover it,
--    and nothing is held. A user with a held credit has an invite of their own
--    in flight -- money in play, not a refusal -- so they are never marked.

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
  v_broke        boolean;
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

  -- "Pressed approve on a live invitation and could not pay for it."
  v_broke :=
        me_row.relations->'page2'->>'state' = 'pending'
    AND (me_row.relations->'page2'->'profile'->>'user_id')::uuid = inviter_id
    AND (me_row.relations->'page2'->>'expires_at')::timestamptz > now()
    AND public._credits_total(me_row.relations) < v_approve_cost
    AND COALESCE((me_row.relations->'credits'->>'held')::int, 0) = 0;

  IF me_row.relations->'page2'->>'state' <> 'pending'
     OR (me_row.relations->'page2'->'profile'->>'user_id')::uuid <> inviter_id
     OR (me_row.relations->'page2'->>'expires_at')::timestamptz <= now()
     OR public._credits_total(me_row.relations) < v_approve_cost THEN

    UPDATE public.users SET relations = jsonb_set(
      CASE WHEN v_broke THEN public._credits_mark_unpaid(relations) ELSE relations END,
      '{page2}',
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

-- 8) others(): zero credits no longer removes you from the pool -- refusing to
--    pay does. Patched textually against the LIVE body with a single-match
--    assertion (repo <-> live drift is known; see 20260720120000).

do $$
declare
  v_sig text := 'public.others(public.users, boolean)';
  v_old text := E'    AND (\n      NOT only_available\n      OR NULLIF(other.relations->>''last_add_at'', '''')::timestamptz > now() - interval ''30 minutes''\n      OR (COALESCE((other.relations->''credits''->>''balance'')::numeric, 0)\n        + COALESCE((other.relations->''credits''->>''extra'')::numeric,   0))\n        >= public._credits_cost(''approve'')\n    )';
  v_new text := E'    -- Credit candidacy. Being broke does NOT remove you from the pool:\n    -- receiving an invitation you cannot afford IS the moment to pay, and\n    -- with a daily pool of 1 a held credit (an invite of your own in flight)\n    -- zeroes the wallet without meaning anything about willingness to pay.\n    -- You leave the pool only after app_approve recorded that you pressed\n    -- accept on a live invitation and could not cover it (credits.unpaid_at),\n    -- and you rejoin it the moment the wallet is funded (every funding path\n    -- clears the mark).\n    AND (\n      NOT only_available\n      OR NULLIF(other.relations->>''last_add_at'', '''')::timestamptz > now() - interval ''30 minutes''\n      OR (COALESCE((other.relations->''credits''->>''balance'')::numeric, 0)\n        + COALESCE((other.relations->''credits''->>''extra'')::numeric,   0))\n        >= public._credits_cost(''approve'')\n      OR (other.relations->''credits''->>''unpaid_at'') IS NULL\n    )';
  v_def text;
  v_out text;
begin
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position(v_old in v_def) = 0 then
    raise exception 'others(): credit-candidacy anchor not found -- live body drifted';
  end if;
  v_out := replace(v_def, v_old, v_new);
  if position(v_old in v_out) <> 0 then
    raise exception 'others(): credit-candidacy anchor matched more than once';
  end if;
  execute v_out;
end $$;
