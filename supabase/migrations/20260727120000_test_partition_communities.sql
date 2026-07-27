-- Extend the test/real partition from MATCHING to COMMUNITIES, FRIENDS and REPORTS.
--
-- Until now `users.is_test` was enforced in exactly ONE place: a single
-- unconditional clause inside public.others() (20260719000000). That covers the
-- whole GAME -- find / broadcast / seed-viewer, and therefore invite, approve,
-- chat, leave, block, because each of those needs a link that only the game can
-- create. It covers NOTHING else, and a QA audit (2026-07-27) found six live
-- paths where a test account can reach a real person:
--
--   app_search_people       -- filters by name only; a generic query returns real users
--   app_friend_request      -- any uuid; the real target gets a PUSH + a pending row
--   app_friend_link_by_code -- a real user's /f/ code links the pair + PUSHes them
--   app_search_groups       -- returns every public group, including real ones
--   app_redeem_invite       -- joins any group; approval-gated ones PUSH owner+managers
--   app_report              -- writes a PERMANENT block + a moderation record
--
-- A push cannot be un-sent, so the fix has to be a precondition, not a cleanup.
-- Each path below rejects a cross-partition operation with an error code that is
-- ALREADY part of its contract (bad_target / bad_code / invite_invalid /
-- bad_request / no_request), so no response shape changes and no client needs to
-- know: the published mobile build renders these exactly like any other rejected
-- precondition. Every rejection also goes through the RPC's normal error return,
-- so it lands in `log` as a logged precondition rather than a silent 4xx.
--
-- ── Why groups get their own column ──────────────────────────────────────────
-- A group's partition CANNOT be derived from its owner. Live data (2026-07-27):
-- five groups predate `owner_id` and carry NULL -- one of them holds 37 test
-- members and another holds 20 real ones. Deriving from the owner would have
-- locked those 37 test accounts out of their own group AND handed them the real
-- one (both owners being NULL / "not test"). So `groups.is_test` is explicit and
-- stamped at creation from the creator, exactly like `users.is_test`: a stored
-- fact, not an inference. Backfill below reads the owner where there is one and
-- falls back to "test iff every member is a test user" for the ownerless five.
--
-- Deliberately NOT changed:
--   * app_referral_attach -- already partition-aware (the payout is skipped
--     cross-partition since 20260722160000). The attach row itself is inert.
--   * app_bug_report -- self-only, there is no counterparty to protect.
--   * app_shared_groups / app_my_friends / app_group_members -- read-only, and
--     the links they can read are now created partition-clean.
--   * app_report in the REAL -> TEST direction -- see the guard's own comment.

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Single source of truth for "which side of the partition is this user on".
-- Mirrors the COALESCE(..., false) that others() applies to the `me` side, so a
-- missing row reads as the real partition rather than NULL-poisoning the compare.
CREATE OR REPLACE FUNCTION public._is_test(uid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT coalesce((SELECT u.is_test FROM public.users u WHERE u.user_id = uid), false)
$$;

-- Are these two users on the same side? Used by every guard below so the rule
-- is written once. NULL-safe in both arguments (an absent user is "real").
CREATE OR REPLACE FUNCTION public._same_partition(a uuid, b uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT public._is_test(a) = public._is_test(b)
$$;

-- ── groups.is_test ──────────────────────────────────────────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Partial index: the test side is the small one, and every partition-filtered
-- read is `is_test = <caller's side>`. Mirrors users_is_test_idx.
CREATE INDEX IF NOT EXISTS groups_is_test_idx
  ON public.groups (is_test) WHERE is_test;

-- Backfill. Owner present -> the owner's side. Owner NULL (the five legacy
-- groups) -> test only when the group has members and ALL of them are test
-- accounts; an empty ownerless group stays on the real side, which is the
-- conservative direction (a test user simply can't redeem it).
UPDATE public.groups g
   SET is_test = true
 WHERE g.is_test = false
   AND (
     CASE WHEN g.owner_id IS NOT NULL
       THEN public._is_test(g.owner_id)
       ELSE EXISTS (
              SELECT 1 FROM public.user_groups ug
                JOIN public.users u ON u.user_id = ug.user_id
               WHERE ug.group_id = g.id AND u.is_test)
            AND NOT EXISTS (
              SELECT 1 FROM public.user_groups ug
                JOIN public.users u ON u.user_id = ug.user_id
               WHERE ug.group_id = g.id AND NOT u.is_test)
     END
   );

-- ── app_create_group (5-arg, the one the dispatcher calls) ──────────────────
-- Stamps the new group with the creator's partition so the flag maintains
-- itself from here on and no future group ever needs a backfill.
CREATE OR REPLACE FUNCTION public.app_create_group(
  me_id uuid, p_name text, p_is_public boolean DEFAULT false,
  p_description text DEFAULT NULL::text, p_requires_approval boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_desc text; v_id uuid; v_code text;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  v_desc := nullif(btrim(p_description), '');
  IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, description, requires_approval, is_test)
    VALUES (v_name, v_code, me_id, coalesce(p_is_public, false), v_desc, coalesce(p_requires_approval, false),
            public._is_test(me_id))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', coalesce(p_is_public, false), 'owner', true, 'is_owner', true, 'members', 1,
    'requires_approval', coalesce(p_requires_approval, false), 'description', v_desc, 'pending', 0));
END; $function$;

-- ── app_create_group (3-arg legacy overload) ────────────────────────────────
-- Unreachable from the current dispatcher (which always passes five args) but
-- still resolvable, so it gets the same stamp rather than a silent hole.
CREATE OR REPLACE FUNCTION public.app_create_group(
  me_id uuid, p_name text, p_is_public boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_id uuid; v_code text;
BEGIN
  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  v_code := public._group_generate_invite_code();
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, is_test)
    VALUES (v_name, v_code, me_id, coalesce(p_is_public, false), public._is_test(me_id))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', coalesce(p_is_public, false), 'owner', true, 'members', 1));
END; $function$;

-- ── app_search_people ───────────────────────────────────────────────────────
-- The people directory is now partitioned. This is the single most dangerous
-- read in the app for QA: it matches on name alone, so a two-letter query used
-- to surface real users to a test account, one tap away from a friend request
-- that pushes them.
CREATE OR REPLACE FUNCTION public.app_search_people(me_id uuid, p_q text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.user_id, 'name', u.name, 'image', u.data->'images'->0,
    'requested', EXISTS(SELECT 1 FROM public.friend_requests fr WHERE fr.requester_id = me_id AND fr.target_id = u.user_id AND fr.status = 'pending'),
    'friend',    EXISTS(SELECT 1 FROM public.friend_links fl WHERE fl.a = LEAST(me_id, u.user_id) AND fl.b = GREATEST(me_id, u.user_id))
  ) ORDER BY u.name), '[]'::jsonb)
  FROM public.users u
  WHERE nullif(btrim(p_q), '') IS NOT NULL AND char_length(btrim(p_q)) >= 2
    AND u.user_id <> me_id AND u.name IS NOT NULL AND u.name ILIKE '%' || btrim(p_q) || '%'
    -- Test/real partition, same rule as others(): you only ever see your own side.
    AND u.is_test = public._is_test(me_id)
  LIMIT 30;
$function$;

-- ── app_search_groups ───────────────────────────────────────────────────────
-- Public-group discovery is partitioned on the stored group flag (see the
-- column's note above -- deriving it from the owner would be wrong).
CREATE OR REPLACE FUNCTION public.app_search_groups(me_id uuid, p_q text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'owner_id', g.owner_id, 'owner_name', ownr.name, 'owner_image', ownr.data->'images'->0,
    'description', g.description, 'requires_approval', g.requires_approval,
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
    'joined',  EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = g.id AND ug.user_id = me_id),
    'requested', EXISTS(SELECT 1 FROM public.group_join_requests jr WHERE jr.group_id = g.id AND jr.user_id = me_id)
  ) ORDER BY (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id) DESC, g.name), '[]'::jsonb)
  FROM public.groups g
  LEFT JOIN public.users ownr ON ownr.user_id = g.owner_id
  WHERE g.is_public = true AND nullif(btrim(p_q), '') IS NOT NULL
    AND char_length(btrim(p_q)) >= 2 AND g.name ILIKE '%' || btrim(p_q) || '%'
    AND g.is_test = public._is_test(me_id)
  LIMIT 30;
$function$;

-- ── app_redeem_invite ───────────────────────────────────────────────────────
-- Joining by code (deep link /g/<TOKEN>, install referrer, or the 6-digit field)
-- is now partition-checked. This closes the loudest hole: a wrong code typed
-- during QA could join a real, approval-gated group and push its owner and every
-- manager. A cross-partition code is reported as `invite_invalid` -- the same
-- answer as a code that does not exist, which is exactly what it is from the
-- caller's side of the partition.
CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_group_id   uuid;
  v_group_name text;
  v_requires   boolean;
  v_group_test boolean;
  v_is_member  boolean;
  v_is_staff   boolean;
  v_status     text := 'joined';
  v_notify     jsonb := '[]'::jsonb;
  result_user  json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR char_length(p_code) > 64 THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id, name, requires_approval, is_test
    INTO v_group_id, v_group_name, v_requires, v_group_test
    FROM public.groups WHERE invite_code = p_code;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  -- Test/real partition. A group on the other side is invisible, and therefore
  -- indistinguishable from a code that was never issued.
  IF v_group_test IS DISTINCT FROM public._is_test(me_id) THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM public.user_groups WHERE user_id = me_id AND group_id = v_group_id);
  v_is_staff  := EXISTS(SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.owner_id = me_id)
              OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);

  IF v_is_member THEN
    v_status := 'already';
  ELSIF v_requires AND NOT v_is_staff THEN
    INSERT INTO public.group_join_requests(group_id, user_id)
      VALUES (v_group_id, me_id) ON CONFLICT (group_id, user_id) DO NOTHING;
    v_status := 'pending';
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
             'user_id', staff_id, 'code', 'group_join',
             'group_id', v_group_id, 'group_name', v_group_name)), '[]'::jsonb)
      INTO v_notify
      FROM (
        SELECT g.owner_id AS staff_id FROM public.groups g WHERE g.id = v_group_id AND g.owner_id IS NOT NULL
        UNION
        SELECT gm.user_id FROM public.group_managers gm WHERE gm.group_id = v_group_id
      ) staff
      WHERE staff_id <> me_id;
  ELSE
    INSERT INTO public.user_groups(user_id, group_id) VALUES (me_id, v_group_id)
      ON CONFLICT (user_id, group_id) DO NOTHING;
    UPDATE public.users
       SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
     WHERE user_id = me_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',        result_user,
    'notify',      v_notify,
    'groups',      public._my_groups(me_id),
    'join_status', v_status
  );
END;
$function$;

-- ── app_friend_request ──────────────────────────────────────────────────────
-- A friend request is the only path that pushes a stranger by uuid alone.
CREATE OR REPLACE FUNCTION public.app_friend_request(me_id uuid, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_reverse uuid; v_a uuid := LEAST(me_id, p_target_id); v_b uuid := GREATEST(me_id, p_target_id);
BEGIN
  IF p_target_id IS NULL OR p_target_id = me_id THEN RETURN jsonb_build_object('error', 'bad_target'); END IF;
  -- Test/real partition: the target does not exist as far as this caller is
  -- concerned, which is what `bad_target` already means.
  IF NOT public._same_partition(me_id, p_target_id) THEN RETURN jsonb_build_object('error', 'bad_target'); END IF;
  IF EXISTS(SELECT 1 FROM public.friend_links WHERE a = v_a AND b = v_b) THEN
    RETURN jsonb_build_object('status', 'friends');
  END IF;
  SELECT id INTO v_reverse FROM public.friend_requests
   WHERE requester_id = p_target_id AND target_id = me_id AND status = 'pending';
  IF v_reverse IS NOT NULL THEN
    UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = v_reverse;
    INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'link') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status', 'friends',
      'notify', jsonb_build_array(jsonb_build_object('user_id', p_target_id, 'code', 'friend_accept', 'actor_id', me_id)));
  END IF;
  INSERT INTO public.friend_requests(requester_id, target_id) VALUES (me_id, p_target_id)
    ON CONFLICT (requester_id, target_id) WHERE status = 'pending' DO NOTHING;
  RETURN jsonb_build_object('status', 'requested',
    'notify', jsonb_build_array(jsonb_build_object('user_id', p_target_id, 'code', 'friend_request', 'actor_id', me_id)));
END; $function$;

-- ── app_friend_respond ──────────────────────────────────────────────────────
-- Defence for rows that predate this migration: a pending cross-partition
-- request must not be acceptable into a real friendship.
CREATE OR REPLACE FUNCTION public.app_friend_respond(me_id uuid, p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_req public.friend_requests%ROWTYPE; v_a uuid; v_b uuid;
BEGIN
  SELECT * INTO v_req FROM public.friend_requests WHERE id = p_request_id;
  IF v_req.id IS NULL OR v_req.target_id <> me_id OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'bad_request');
  END IF;
  -- A legacy cross-partition request can still be DECLINED (that only clears
  -- it), but never accepted -- accepting would mint the very link the guards
  -- above now prevent.
  IF p_accept AND NOT public._same_partition(me_id, v_req.requester_id) THEN
    RETURN jsonb_build_object('error', 'bad_request');
  END IF;
  IF p_accept THEN
    UPDATE public.friend_requests SET status = 'accepted', responded_at = now() WHERE id = p_request_id;
    v_a := LEAST(v_req.requester_id, me_id); v_b := GREATEST(v_req.requester_id, me_id);
    INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'link') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status', 'accepted',
      'notify', jsonb_build_array(jsonb_build_object('user_id', v_req.requester_id, 'code', 'friend_accept', 'actor_id', me_id)));
  ELSE
    UPDATE public.friend_requests SET status = 'declined', responded_at = now() WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'declined');
  END IF;
END; $function$;

-- ── app_friend_link_by_code ─────────────────────────────────────────────────
-- The /f/<CODE> auto-link. Cross-partition reads as `bad_code`, the same answer
-- as a code nobody owns.
CREATE OR REPLACE FUNCTION public.app_friend_link_by_code(me_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_inviter uuid;
  v_a       uuid;
  v_b       uuid;
  v_rows    int := 0;
  v_new     boolean := false;
BEGIN
  IF v_code = '' THEN RETURN jsonb_build_object('error', 'no_code'); END IF;

  SELECT user_id INTO v_inviter FROM public.users WHERE referral_code = v_code;
  IF v_inviter IS NULL THEN RETURN jsonb_build_object('error', 'bad_code'); END IF;
  IF v_inviter = me_id THEN
    RETURN jsonb_build_object('status', 'self') || public.app_my_friends(me_id);
  END IF;
  -- Test/real partition. Note this is the one guard that also protects a REAL
  -- user from a leaked QA link: opening a test account's /f/ link no longer
  -- connects them or pushes anyone.
  IF NOT public._same_partition(me_id, v_inviter) THEN
    RETURN jsonb_build_object('error', 'bad_code');
  END IF;

  v_a := LEAST(me_id, v_inviter);
  v_b := GREATEST(me_id, v_inviter);

  INSERT INTO public.friend_links(a, b, via) VALUES (v_a, v_b, 'referral')
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_new := v_rows > 0;

  UPDATE public.friend_requests SET status = 'accepted', responded_at = now()
   WHERE status = 'pending'
     AND ((requester_id = me_id AND target_id = v_inviter)
       OR (requester_id = v_inviter AND target_id = me_id));

  RETURN jsonb_build_object(
    'status', CASE WHEN v_new THEN 'linked' ELSE 'already' END,
    'notify', CASE WHEN v_new
      THEN jsonb_build_array(jsonb_build_object('user_id', v_inviter, 'code', 'friend_link', 'actor_id', me_id))
      ELSE '[]'::jsonb END
  ) || public.app_my_friends(me_id);
END;
$function$;

-- ── app_respond_join ────────────────────────────────────────────────────────
-- Same legacy-row defence as app_friend_respond: an owner/manager must not be
-- able to approve a join request from the other side of the partition. A reject
-- still works (it only clears the row).
CREATE OR REPLACE FUNCTION public.app_respond_join(me_id uuid, p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_group_id uuid; v_group_name text; v_requester uuid; v_owner uuid; v_ok boolean;
  v_group_test boolean;
  v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT jr.group_id, jr.user_id INTO v_group_id, v_requester
    FROM public.group_join_requests jr WHERE jr.id = p_request_id;
  IF v_group_id IS NULL THEN RETURN jsonb_build_object('error', 'no_request'); END IF;

  SELECT g.owner_id, g.name, g.is_test INTO v_owner, v_group_name, v_group_test
    FROM public.groups g WHERE g.id = v_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;

  IF p_accept AND v_group_test IS DISTINCT FROM public._is_test(v_requester) THEN
    RETURN jsonb_build_object('error', 'no_request');
  END IF;

  IF p_accept THEN
    INSERT INTO public.user_groups(user_id, group_id) VALUES (v_requester, v_group_id)
      ON CONFLICT (user_id, group_id) DO NOTHING;
    UPDATE public.users
       SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
     WHERE user_id = v_requester;
    v_notify := jsonb_build_array(jsonb_build_object(
      'user_id', v_requester, 'code', 'group_approved',
      'group_id', v_group_id, 'group_name', v_group_name));
  END IF;

  DELETE FROM public.group_join_requests WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'notify',   v_notify,
    'requests', (public.app_group_requests(me_id, v_group_id))->'requests',
    'members',  (public.app_group_members(me_id, v_group_id))->'members'
  );
END; $function$;

-- ── app_report ──────────────────────────────────────────────────────────────
-- ASYMMETRIC ON PURPOSE, and the only guard here that is not a mirror.
--
--   TEST -> REAL  : rejected. This is only ever a QA accident, and its cost is
--                   the highest of anything in this migration -- a PERMANENT
--                   block (public.restrictions key='block' has no expiry window)
--                   plus a moderation record that reads like a real complaint.
--   REAL -> TEST  : ALLOWED. If a test account ever does leak into a real
--                   user's pool, that user must still be able to report it.
--                   Safety is never gated on a QA concern; the block that
--                   results is exactly what protects them.
--   same partition: unchanged.
CREATE OR REPLACE FUNCTION public.app_report(me_id uuid, reported_id uuid, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  me_row      public.users;
  rep_row     public.users;
  p1_state    text;
  p1_target   uuid;
  p2_state    text;
  p2_target   uuid;
  v_context   text := 'unknown';
  notify      jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF reported_id IS NULL OR reported_id = me_id THEN
    RETURN jsonb_build_object('error', 'bad_target');
  END IF;
  IF public._is_test(me_id) AND NOT public._is_test(reported_id) THEN
    RETURN jsonb_build_object('error', 'bad_target');
  END IF;

  PERFORM 1 FROM public.users
   WHERE user_id IN (me_id, reported_id) ORDER BY user_id FOR UPDATE;

  SELECT * INTO me_row  FROM public.users WHERE user_id = me_id;
  SELECT * INTO rep_row FROM public.users WHERE user_id = reported_id;

  p1_state  := me_row.relations->'page1'->>'state';
  p1_target := (me_row.relations->'page1'->'profile'->>'user_id')::uuid;
  p2_state  := me_row.relations->'page2'->>'state';
  p2_target := (me_row.relations->'page2'->'profile'->>'user_id')::uuid;

  IF p1_target = reported_id AND p1_state = 'chat' THEN
    v_context := 'chat';
  ELSIF p1_target = reported_id AND p1_state = 'waiting' THEN
    v_context := 'waiting';
  ELSIF p1_target = reported_id AND p1_state = 'watching' THEN
    v_context := 'watching';
  ELSIF p2_target = reported_id AND p2_state = 'pending' THEN
    v_context := 'pending';
  END IF;

  INSERT INTO public.reports (reporter_id, reported_id, context, reason, note)
  VALUES (me_id, reported_id, v_context, p_reason, p_note);

  PERFORM public._add_restriction(me_id, reported_id, 'block');

  IF v_context = 'chat' THEN
    UPDATE public.users SET relations =
      jsonb_set(
        jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked')),
        '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    WHERE user_id = me_id;

    UPDATE public.users SET relations =
      jsonb_set(
        jsonb_set(relations, '{page1}',
          public._page1_locked(relations->'page1'->'profile', 'leave')),
        '{page2}', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
      )
    WHERE user_id = reported_id
      AND relations->'page1'->>'state' = 'chat';

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'left'));

  ELSIF v_context = 'waiting' THEN
    -- Reporter (me) ended their own invite. Forfeit the held heart, same as
    -- cancel.
    UPDATE public.users SET relations =
      jsonb_set(
        public._credits_clear_hold(relations, public._credits_cost('invite')),
        '{page1}', jsonb_build_object('state', 'locked'))
    WHERE user_id = me_id;

    UPDATE public.users SET relations =
      jsonb_set(relations, '{page2}',
        public._page2_locked(relations->'page2'->'profile', 'cancel'))
    WHERE user_id = reported_id
      AND relations->'page2'->>'state' = 'pending'
      AND (relations->'page2'->'profile'->>'user_id')::uuid = me_id;

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'cancelled-in'));

  ELSIF v_context = 'pending' THEN
    UPDATE public.users SET relations =
      jsonb_set(relations, '{page2}',
        jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb))
    WHERE user_id = me_id;

    -- Reported user was the inviter (held a heart). Refund them, same as
    -- decline — the invite ended without the inviter cancelling.
    UPDATE public.users SET relations =
      jsonb_set(
        public._credits_refund(relations, public._credits_cost('invite')),
        '{page1}',
        public._page1_locked(relations->'page1'->'profile', 'decline'))
    WHERE user_id = reported_id
      AND relations->'page1'->>'state' = 'waiting'
      AND (relations->'page1'->'profile'->>'user_id')::uuid = me_id;

    notify := jsonb_build_array(
      jsonb_build_object('user_id', reported_id, 'code', 'declined'));

  ELSIF v_context = 'watching' THEN
    UPDATE public.users SET relations =
      jsonb_set(relations, '{page1}', jsonb_build_object('state', 'locked'))
    WHERE user_id = me_id;

    PERFORM public._remove_from_profiles(reported_id, me_id);
  END IF;

  PERFORM public._remove_from_profiles(me_id, reported_id);
  PERFORM public._remove_from_profiles(reported_id, me_id);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$function$;
