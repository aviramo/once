-- Closing the holes in the join flow (user directive 2026-07-27).
--
-- 1. A declined request was DELETED, so the person could re-queue a second
--    later, forever. It now stays as a `declined` row that blocks a new request
--    for a cooldown, and the block is self-healing (no UI needed to undo it).
-- 2. A decline was invisible: the requester's "pending" simply vanished. The
--    surviving row IS the answer — the summary carries it, so the app can say
--    "declined" instead of quietly forgetting. Deliberately no push: a
--    rejection is not something to buzz a phone for; it is something to be able
--    to find out.
--
-- Entering a group is by LINK, and only by link (user directive 2026-07-27):
-- there is no in-app invitation object, and the group-kind copy says so.

ALTER TABLE public.group_join_requests
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE public.group_join_requests DROP CONSTRAINT IF EXISTS group_join_requests_status_chk;
ALTER TABLE public.group_join_requests ADD CONSTRAINT group_join_requests_status_chk
  CHECK (status IN ('pending', 'declined', 'dismissed'));

-- How long a decline keeps the door shut. One definition, read by every path
-- that has to decide whether a new request is allowed.
CREATE OR REPLACE FUNCTION public._join_decline_cooldown()
 RETURNS interval LANGUAGE sql IMMUTABLE AS $function$ SELECT interval '30 days' $function$;

-- The summary trigger has to see the status change too, not just insert/delete.
DROP TRIGGER IF EXISTS comm_group_join_req ON public.group_join_requests;
CREATE TRIGGER comm_group_join_req
  AFTER INSERT OR UPDATE OR DELETE ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_join_req();

-- ── The summary the app paints the hub from ────────────────────────────────
-- Gains `declined`: requests that were turned down and not dismissed yet.
-- `pending` now means pending, and a managed group's `pending` count with it.
CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'managed', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
        'requires_approval', g.requires_approval, 'description', g.description,
        'is_owner', (g.owner_id = uid),
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id),
        'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id AND jr.status = 'pending')
      ) ORDER BY (g.owner_id = uid) DESC, g.created_at DESC)
      FROM public.groups g
      WHERE g.owner_id = uid
         OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'joined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'pending'
    ), '[]'::jsonb),
    'declined', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid AND jr.status = 'declined'
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

-- ── The queue a manager sees: pending only ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_group_requests(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_owner uuid; v_ok boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  RETURN jsonb_build_object('requests', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', jr.id, 'user_id', u.user_id, 'name', u.name,
      'image', u.data->'images'->0, 'created_at', jr.created_at,
      'profile', public.make_profile(u, NULL::int, me_id)
    ) ORDER BY jr.created_at)
    FROM public.group_join_requests jr JOIN public.users u ON u.user_id = jr.user_id
    WHERE jr.group_id = p_group_id AND jr.status = 'pending'), '[]'::jsonb));
END; $function$;

-- ── Answering a request ────────────────────────────────────────────────────
-- Accept deletes the row (they are a member now). Decline KEEPS it, marked, so
-- the door stays shut for the cooldown and the requester can be told.
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
    FROM public.group_join_requests jr WHERE jr.id = p_request_id AND jr.status = 'pending';
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
    DELETE FROM public.group_join_requests WHERE id = p_request_id;
  ELSE
    UPDATE public.group_join_requests
       SET status = 'declined', responded_at = now()
     WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'notify',   v_notify,
    'requests', (public.app_group_requests(me_id, v_group_id))->'requests',
    'members',  (public.app_group_members(me_id, v_group_id))->'members'
  );
END; $function$;

-- ── Redeeming a link / code ────────────────────────────────────────────────
-- Order of decisions: already a member ▸ already queued ▸ still declined ▸
-- approval needed ▸ join. `declined` is a real answer the app can show, not a
-- silent re-queue.
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
  v_declined   timestamptz;
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

  IF v_group_test IS DISTINCT FROM public._is_test(me_id) THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM public.user_groups WHERE user_id = me_id AND group_id = v_group_id);
  v_is_staff  := EXISTS(SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.owner_id = me_id)
              OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);
  SELECT jr.responded_at INTO v_declined
    FROM public.group_join_requests jr
   WHERE jr.group_id = v_group_id AND jr.user_id = me_id AND jr.status <> 'pending';

  IF v_is_member THEN
    v_status := 'already';
  ELSIF EXISTS(SELECT 1 FROM public.group_join_requests jr
                WHERE jr.group_id = v_group_id AND jr.user_id = me_id AND jr.status = 'pending') THEN
    -- Already in the queue: the link does not queue them twice.
    v_status := 'pending';
  ELSIF v_requires AND NOT v_is_staff
        AND v_declined IS NOT NULL
        AND v_declined > now() - public._join_decline_cooldown() THEN
    v_status := 'declined';
  ELSIF v_requires AND NOT v_is_staff THEN
    INSERT INTO public.group_join_requests(group_id, user_id)
      VALUES (v_group_id, me_id)
      ON CONFLICT (group_id, user_id) DO UPDATE
        SET status = 'pending', responded_at = NULL, created_at = now();
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
    DELETE FROM public.group_join_requests WHERE group_id = v_group_id AND user_id = me_id;
  END IF;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',        result_user,
    'notify',      v_notify,
    'groups',      public._my_groups(me_id),
    'join_status', v_status
  );
END; $function$;

-- ── The requester clearing a row of their own ──────────────────────────────
-- Cancelling a PENDING request withdraws it. Clearing a DECLINED one only
-- dismisses the notice: the row stays (and keeps the cooldown), it just stops
-- being shown. Otherwise "cancel" would be a one-tap way around the block.
CREATE OR REPLACE FUNCTION public.app_cancel_join(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE result_user json;
BEGIN
  DELETE FROM public.group_join_requests
   WHERE group_id = p_group_id AND user_id = me_id AND status = 'pending';

  UPDATE public.group_join_requests
     SET status = 'dismissed'
   WHERE group_id = p_group_id AND user_id = me_id AND status = 'declined';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',   result_user,
    'notify', '[]'::jsonb,
    'groups', public._my_groups(me_id)
  );
END; $function$;

-- ── Turning a group open admits the QUEUE, and clears the rest ─────────────
CREATE OR REPLACE FUNCTION public._group_drain_requests(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_name text; v_test boolean; v_notify jsonb;
BEGIN
  SELECT g.name, g.is_test INTO v_name, v_test FROM public.groups g WHERE g.id = p_group_id;
  INSERT INTO public.user_groups(user_id, group_id)
    SELECT jr.user_id, jr.group_id
      FROM public.group_join_requests jr
     WHERE jr.group_id = p_group_id AND jr.status = 'pending'
       AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test
    ON CONFLICT (user_id, group_id) DO NOTHING;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', jr.user_id, 'code', 'group_approved',
           'group_id', p_group_id, 'group_name', v_name)), '[]'::jsonb)
    INTO v_notify
    FROM public.group_join_requests jr
   WHERE jr.group_id = p_group_id AND jr.status = 'pending'
     AND public._is_test(jr.user_id) IS NOT DISTINCT FROM v_test;
  UPDATE public.users u
     SET relations = jsonb_set(u.relations, '{availability}', public.user_availability(u.user_id, u.location))
   WHERE u.user_id IN (SELECT jr.user_id FROM public.group_join_requests jr
                        WHERE jr.group_id = p_group_id AND jr.status = 'pending');
  -- Declines go too: in a group that admits anyone, a block on one person is a
  -- fiction — they can walk in through the link.
  DELETE FROM public.group_join_requests WHERE group_id = p_group_id;
  RETURN v_notify;
END; $function$;
