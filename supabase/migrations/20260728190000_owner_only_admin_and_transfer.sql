-- Owner vs manager, redrawn (user directive 2026-07-28).
--
-- A MANAGER may only answer join requests, and the only thing in the group's
-- settings that is his is "hide me from the members here". So the two RPCs that
-- reshape the group or its roster go OWNER-ONLY:
--   app_update_group  (name / description / link / kind)  → owner only
--   app_remove_member (throw a member out)                → owner only
-- What a manager keeps: app_respond_join, app_approve_all_joins,
-- app_group_requests, app_group_members (read), app_set_group_hidden (his own
-- membership, not the group's config).
--
-- SUPERSEDED IN PART, same day: 20260728200000_manager_removes_plain_members.sql
-- puts app_remove_member back to owner-or-manager (a manager removes PLAIN
-- members; the owner and other managers stay untouchable to him). The
-- app_update_group tightening and app_transfer_owner below still stand.
--
-- app_remove_member already refused `p_user_id = v_owner`, so a manager could
-- never remove the owner; owner-only makes that guard about the owner removing
-- HIMSELF, which is what app_transfer_owner / app_delete_group are for.
--
-- app_transfer_owner is new: the owner hands the group to one of its members.
-- The new owner gets everything, the old owner stays a plain MEMBER (handing
-- the group over hands the management over with it; the new owner can make him
-- a manager if that is wanted). Reuses the `group_owner` push that succession
-- on account deletion already sends.
--
-- SUPERSEDED, same day: 20260728210000_transfer_owner_keeps_manager.sql leaves
-- the outgoing owner a MANAGER rather than a plain member.

CREATE OR REPLACE FUNCTION public.app_update_group(
  me_id uuid, p_group_id uuid,
  p_name text DEFAULT NULL::text,
  p_is_public boolean DEFAULT NULL::boolean,
  p_description text DEFAULT NULL::text,
  p_desc_provided boolean DEFAULT false,
  p_requires_approval boolean DEFAULT NULL::boolean,
  p_link text DEFAULT NULL::text,
  p_link_provided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_name text; v_desc text; v_link text;
        v_pub boolean; v_req boolean;
        v_notify jsonb := '[]'::jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  -- Owner only: a manager answers join requests, he does not reshape the group.
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
  IF NOT v_req THEN v_notify := public._group_drain_requests(p_group_id); END IF;
  RETURN (SELECT jsonb_build_object('notify', v_notify, 'group', jsonb_build_object(
            'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
            'requires_approval', g.requires_approval, 'description', g.description,
            'link', g.link,
            'is_owner', (g.owner_id = me_id), 'owner', true,
            'members', (SELECT count(*) FROM public.user_groups ug WHERE ug.group_id = g.id),
            'pending', (SELECT count(*) FROM public.group_join_requests jr WHERE jr.group_id = g.id)))
          FROM public.groups g WHERE g.id = p_group_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.app_remove_member(me_id uuid, p_group_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  -- Owner only. A manager can no longer remove anyone, which also settles the
  -- old question of whether he could remove the owner: he cannot reach this.
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  -- The owner cannot throw HIMSELF out: the group would be left ownerless with
  -- no way back. Transfer it or delete it.
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'cant_remove_owner'); END IF;
  DELETE FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id;
  UPDATE public.users
     SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
   WHERE user_id = p_user_id;
  RETURN public.app_group_members(me_id, p_group_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.app_transfer_owner(me_id uuid, p_group_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_owner uuid; v_group_name text; result_user json;
BEGIN
  SELECT owner_id, name INTO v_owner, v_group_name
    FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> me_id THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF p_user_id = me_id THEN RETURN jsonb_build_object('error', 'is_owner'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_groups
                 WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'not_member');
  END IF;

  -- Same ordered lock every multi-user transition takes: both summaries below
  -- are writes to users rows.
  PERFORM 1 FROM public.users
   WHERE user_id IN (me_id, p_user_id) ORDER BY user_id FOR UPDATE;

  UPDATE public.groups SET owner_id = p_user_id WHERE id = p_group_id;
  -- An owner is never also a manager: app_set_manager refuses to touch the
  -- owner's own row, so a leftover grant could never be cleared again.
  DELETE FROM public.group_managers
   WHERE group_id = p_group_id AND user_id = p_user_id;
  -- owner_id is not in the comm_groups_upd trigger's column list, so both
  -- cached summaries are refreshed by hand: the group moves from the old
  -- owner's `managed` list to his `joined` one, and the other way for the new.
  PERFORM public._refresh_communities(p_user_id);
  PERFORM public._refresh_communities(me_id);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user', result_user,
    'notify', jsonb_build_array(jsonb_build_object(
      'user_id',    p_user_id,
      'code',       'group_owner',
      'group_id',   p_group_id,
      'group_name', v_group_name)));
END; $function$;

REVOKE ALL ON FUNCTION public.app_transfer_owner(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_transfer_owner(uuid, uuid, uuid) TO service_role;
