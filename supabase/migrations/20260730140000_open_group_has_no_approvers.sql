-- An OPEN group has no approvers (user directive 2026-07-30)
--
-- The role formerly called "manager" is named for its one job: answering join
-- requests. An open group (in search, joins instantly) has no requests to
-- answer, so the role has nothing to do there and does not exist:
--
--   1. app_set_manager refuses to appoint one in an open group (`open_group`).
--   2. app_update_group strips every appointment the group had the moment its
--      policy becomes open, in the same transaction that drains its queue.
--   3. app_transfer_owner therefore hands an open group STRAIGHT to a member
--      (there is no approver to promote him to first, which would otherwise
--      make the key unreachable), and the outgoing owner keeps nothing.
--
-- What is NOT stripped is the OWNER's own group_managers row: it is not an
-- appointment (app_create_group writes it for the creator) and it is what
-- carries his scope in the admin console. The comm_group_managers trigger
-- refreshes each stripped user's cached summary, so the group moves out of
-- their `managed` list without another round trip.

-- 1 ── no appointing an approver where there is nothing to approve ───────────
CREATE OR REPLACE FUNCTION public.app_set_manager(me_id uuid, p_group_id uuid, p_user_id uuid, p_make boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_open boolean;
BEGIN
  SELECT owner_id, (is_public AND NOT requires_approval) INTO v_owner, v_open
    FROM public.groups WHERE id = p_group_id;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'owner_only'); END IF;
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'is_owner'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;
  -- Demoting stays legal either way (it can only ever be a no-op here).
  IF p_make AND v_open THEN RETURN jsonb_build_object('error', 'open_group'); END IF;
  IF p_make THEN
    INSERT INTO public.group_managers(user_id, group_id) VALUES (p_user_id, p_group_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.group_managers WHERE group_id = p_group_id AND user_id = p_user_id;
  END IF;
  RETURN public.app_group_members(me_id, p_group_id);
END; $function$;

-- 2 ── turning a group open strips its approvers ─────────────────────────────
CREATE OR REPLACE FUNCTION public.app_update_group(me_id uuid, p_group_id uuid, p_name text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_description text DEFAULT NULL::text, p_desc_provided boolean DEFAULT false, p_requires_approval boolean DEFAULT NULL::boolean, p_link text DEFAULT NULL::text, p_link_provided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_name text; v_desc text; v_link text;
        v_pub boolean; v_req boolean;
        v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  -- Owner only: an approver answers join requests, he does not reshape the group.
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF p_name IS NOT NULL THEN
    v_name := nullif(btrim(p_name), '');
    IF v_name IS NULL OR char_length(v_name) > 60 THEN RETURN jsonb_build_object('error', 'bad_name'); END IF;
  END IF;
  IF p_desc_provided THEN
    v_desc := nullif(btrim(p_description), '');
    IF v_desc IS NOT NULL AND char_length(v_desc) > 500 THEN RETURN jsonb_build_object('error', 'bad_description'); END IF;
  END IF;
  IF p_link_provided THEN
    v_link := public._group_link_norm(p_link);
    IF v_link = '' THEN RETURN jsonb_build_object('error', 'bad_link'); END IF;
  END IF;
  SELECT coalesce(p_is_public, g.is_public), coalesce(p_requires_approval, g.requires_approval)
    INTO v_pub, v_req
    FROM public.groups g WHERE g.id = p_group_id;
  IF NOT v_pub THEN v_req := true; END IF;
  UPDATE public.groups SET
    name = coalesce(v_name, name),
    is_public = v_pub,
    requires_approval = v_req,
    description = CASE WHEN p_desc_provided THEN v_desc ELSE description END,
    link = CASE WHEN p_link_provided THEN v_link ELSE link END
   WHERE id = p_group_id;
  IF NOT v_req THEN
    -- The group is open from this moment: everyone queued is admitted, and
    -- every appointment is void, in the one transaction (user directive
    -- 2026-07-30). The owner's own row is left alone — see the header.
    DELETE FROM public.group_managers gm
     WHERE gm.group_id = p_group_id AND gm.user_id <> v_owner;
    v_notify := public._group_drain_requests(p_group_id);
  END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'link', g.link,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

-- 3 ── an open group is handed to any member; a gated one only to an approver ─
CREATE OR REPLACE FUNCTION public.app_transfer_owner(me_id uuid, p_group_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_group_name text; v_open boolean; result_user json;
BEGIN
  SELECT owner_id, name, (is_public AND NOT requires_approval)
    INTO v_owner, v_group_name, v_open
    FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF p_user_id = me_id THEN RETURN jsonb_build_object('error', 'is_owner'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_groups
                 WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;
  -- Only an approver may receive the group (user directive 2026-07-30):
  -- ownership passes through the role, so the owner appoints first and hands
  -- over second. An OPEN group has no such role (same directive), so there the
  -- key goes straight to a member — the promote-first route does not exist.
  IF NOT v_open AND NOT EXISTS(SELECT 1 FROM public.group_managers
                 WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'not_manager');
  END IF;

  -- Same ordered lock every multi-user transition takes: both summaries below
  -- are writes to users rows.
  PERFORM 1 FROM public.users
   WHERE user_id IN (me_id, p_user_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.groups SET owner_id = p_user_id WHERE id = p_group_id;
  -- An owner is never also an approver: app_set_manager refuses to touch the
  -- owner's own row, so a leftover grant could never be cleared again.
  DELETE FROM public.group_managers
   WHERE group_id = p_group_id AND user_id = p_user_id;
  IF v_open THEN
    -- Nothing to drop into: the outgoing owner of an open group is a plain
    -- member from here, so the row app_create_group wrote for him as its
    -- creator goes with the crown.
    DELETE FROM public.group_managers
     WHERE group_id = p_group_id AND user_id = me_id;
  ELSE
    -- ...and on a gated group he takes the approver's seat himself (user
    -- directive 2026-07-28). His user_groups row is untouched by the handover,
    -- so _gm_ensure_member is satisfied.
    INSERT INTO public.group_managers(user_id, group_id)
      VALUES (me_id, p_group_id) ON CONFLICT DO NOTHING;
  END IF;
  -- owner_id is not in the comm_groups_upd trigger's column list, so both
  -- cached summaries are refreshed by hand: the group stays in the old owner's
  -- `managed` list (as an approver now, or leaves it entirely on an open
  -- group), and moves into the new owner's.
  PERFORM public._refresh_communities(p_user_id);
  PERFORM public._refresh_communities(me_id);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user', result_user,
    -- The roster as it stands AFTER the handover: the new owner's row wears the
    -- crown, the caller's wears the approver tag (or nothing, on an open
    -- group). The page the caller pops back to repaints from this instead of
    -- from what it read before the tap.
    'members', (public.app_group_members(me_id, p_group_id))->'members',
    'notify', jsonb_build_array(jsonb_build_object(
      'user_id',    p_user_id,
      'code',       'group_owner',
      'group_id',   p_group_id,
      'group_name', v_group_name)));
END; $function$;

-- 4 ── the groups that are already open ──────────────────────────────────────
-- Same rule applied backwards: an open group cannot have approvers, so the
-- appointments made before it turned open (or before this rule existed) are
-- void. Owners' own rows are left in place, as above.
DELETE FROM public.group_managers gm
 USING public.groups g
 WHERE g.id = gm.group_id
   AND g.is_public AND NOT g.requires_approval
   AND gm.user_id <> g.owner_id;
