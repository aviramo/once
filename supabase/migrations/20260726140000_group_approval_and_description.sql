-- 2026-07-26 — Group join-approval + group descriptions.
--
-- Two additive features on top of the communities/groups machinery:
--   1. A per-group `requires_approval` flag. When set, a join via link/search
--      (app_redeem_invite) creates a PENDING request instead of membership;
--      the user becomes a member only when an owner/manager approves. Each
--      request pushes all owners+managers (code 'group_join', deep-links to the
--      group); approval pushes the requester (code 'group_approved').
--   2. A per-group `description`, editable by owners/managers, readable by all.
--
-- Everything here is additive: new columns (defaulted), a new pending-requests
-- table, and CREATE OR REPLACE of the existing communities RPCs with only
-- trailing defaulted params added (no dependent-RPC signature break). Authored
-- against the LIVE function bodies (introspected via pg_get_functiondef).

-- ── Schema ──────────────────────────────────────────────────────────────────
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description text;

-- Pending join requests. Only PENDING rows exist here: approve/reject both
-- delete the row (approve first inserts the user_groups membership). UNIQUE
-- keeps a user from stacking duplicate requests for one group.
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.groups(id)     ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_join_requests_group_idx ON public.group_join_requests(group_id);

-- ── Denormalized summary refresh ────────────────────────────────────────────
-- A join request changes the PENDING count shown to every owner+manager of the
-- group, so refresh all of their relations.communities. Mirrors the existing
-- comm_* triggers (see _trg_comm_membership / _trg_comm_group).
CREATE OR REPLACE FUNCTION public._trg_comm_join_req()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE gid uuid;
BEGIN
  gid := COALESCE(NEW.group_id, OLD.group_id);
  -- Owner of the group.
  PERFORM public._refresh_communities(g.owner_id)
    FROM public.groups g WHERE g.id = gid AND g.owner_id IS NOT NULL;
  -- Every manager of the group.
  PERFORM public._refresh_communities(gm.user_id)
    FROM public.group_managers gm WHERE gm.group_id = gid;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS comm_group_join_req ON public.group_join_requests;
CREATE TRIGGER comm_group_join_req
  AFTER INSERT OR DELETE ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_join_req();

-- ── _communities_summary: add description + pending to managed, description to joined ──
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
        'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)
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
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

-- ── app_owned_groups: mirror the new managed fields ─────────────────────────
CREATE OR REPLACE FUNCTION public.app_owned_groups(me_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
    'requires_approval', g.requires_approval, 'description', g.description,
    'is_owner', (g.owner_id = me_id),
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
    'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)
  ) ORDER BY (g.owner_id = me_id) DESC, g.created_at DESC), '[]'::jsonb)
  FROM public.groups g
  WHERE g.owner_id = me_id
     OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = me_id);
$function$;

-- ── app_create_group: accept description + requires_approval ─────────────────
CREATE OR REPLACE FUNCTION public.app_create_group(
  me_id uuid, p_name text, p_is_public boolean DEFAULT false,
  p_description text DEFAULT NULL, p_requires_approval boolean DEFAULT false)
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
  INSERT INTO public.groups(name, invite_code, owner_id, is_public, description, requires_approval)
    VALUES (v_name, v_code, me_id, coalesce(p_is_public, false), v_desc, coalesce(p_requires_approval, false))
    RETURNING id INTO v_id;
  INSERT INTO public.user_groups(user_id, group_id)    VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_managers(user_id, group_id) VALUES (me_id, v_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('group', jsonb_build_object(
    'id', v_id, 'name', v_name, 'invite_code', v_code,
    'is_public', coalesce(p_is_public, false), 'owner', true, 'is_owner', true, 'members', 1,
    'requires_approval', coalesce(p_requires_approval, false), 'description', v_desc, 'pending', 0));
END; $function$;

-- ── app_update_group: accept description (with a provided flag) + requires_approval ──
CREATE OR REPLACE FUNCTION public.app_update_group(
  me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean,
  p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false,
  p_requires_approval boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_owner uuid; v_ok boolean; v_name text; v_desc text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  IF p_desc_provided THEN
    v_desc := nullif(btrim(p_description), '');
    IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = coalesce(p_is_public, is_public),
    requires_approval = coalesce(p_requires_approval, requires_approval),
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END
   WHERE id = p_group_id;
  RETURN (SELECT jsonb_build_object('group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- ── app_search_groups: expose description + requires_approval + my pending ──
CREATE OR REPLACE FUNCTION public.app_search_groups(me_id uuid, p_q text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'owner_name', ownr.name, 'description', g.description, 'requires_approval', g.requires_approval,
    'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
    'joined',  EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = g.id AND ug.user_id = me_id),
    'requested', EXISTS(SELECT 1 FROM public.group_join_requests jr WHERE jr.group_id = g.id AND jr.user_id = me_id)
  ) ORDER BY g.name), '[]'::jsonb)
  FROM public.groups g
  LEFT JOIN public.users ownr ON ownr.user_id = g.owner_id
  WHERE g.is_public = true AND nullif(btrim(p_q), '') IS NOT NULL
    AND char_length(btrim(p_q)) >= 2 AND g.name ILIKE '%' || btrim(p_q) || '%'
  LIMIT 30;
$function$;

-- ── app_redeem_invite: request-to-join when the group requires approval ─────
CREATE OR REPLACE FUNCTION public.app_redeem_invite(me_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_group_id  uuid;
  v_group_name text;
  v_requires  boolean;
  v_is_member boolean;
  v_is_staff  boolean;
  v_status    text := 'joined';
  v_notify    jsonb := '[]'::jsonb;
  result_user json;
BEGIN
  p_code := nullif(trim(p_code), '');
  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  SELECT id, name, requires_approval INTO v_group_id, v_group_name, v_requires
    FROM public.groups WHERE invite_code = p_code;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invite_invalid');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM public.user_groups WHERE user_id = me_id AND group_id = v_group_id);
  v_is_staff  := EXISTS(SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.owner_id = me_id)
              OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);

  IF v_is_member THEN
    v_status := 'already';
  ELSIF v_requires AND NOT v_is_staff THEN
    -- Gated group: record a pending request and notify owner + managers. No
    -- membership / availability change until an owner/manager approves.
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
    -- Open group (or a returning owner/manager not yet in user_groups): join.
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

-- ── app_group_requests: pending requests for a group (owner/manager only) ───
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
      'image', u.data->'images'->0, 'created_at', jr.created_at
    ) ORDER BY jr.created_at)
    FROM public.group_join_requests jr JOIN public.users u ON u.user_id = jr.user_id
    WHERE jr.group_id = p_group_id), '[]'::jsonb));
END; $function$;

-- ── app_respond_join: approve (join + notify) or reject (silent), by request id ──
CREATE OR REPLACE FUNCTION public.app_respond_join(me_id uuid, p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_group_id uuid; v_group_name text; v_requester uuid; v_owner uuid; v_ok boolean;
  v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT jr.group_id, jr.user_id INTO v_group_id, v_requester
    FROM public.group_join_requests jr WHERE jr.id = p_request_id;
  IF v_group_id IS NULL THEN RETURN jsonb_build_object('error', 'no_request'); END IF;

  SELECT g.owner_id, g.name INTO v_owner, v_group_name FROM public.groups g WHERE g.id = v_group_id;
  v_ok := (v_owner = me_id) OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = v_group_id AND user_id = me_id);
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;

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

  -- Both approve and (silent) reject drop the pending row.
  DELETE FROM public.group_join_requests WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'notify',   v_notify,
    'requests', (public.app_group_requests(me_id, v_group_id))->'requests',
    'members',  (public.app_group_members(me_id, v_group_id))->'members'
  );
END; $function$;
