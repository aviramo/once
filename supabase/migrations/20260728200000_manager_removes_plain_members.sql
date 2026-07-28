-- A manager removes PLAIN members again (user directive 2026-07-28, amending
-- the same day's owner-only pass in 20260728190000).
--
-- The line that stands: a manager may not touch the OWNER and may not touch
-- another MANAGER. Both are the owner's people, and a manager throwing out the
-- person who appointed him is exactly what the directive was about. Everything
-- else about the group is still owner-only: app_update_group, app_set_manager,
-- app_transfer_owner, app_delete_group.
--
-- This restores the rule app_remove_member carried before that migration.

CREATE OR REPLACE FUNCTION public.app_remove_member(me_id uuid, p_group_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_owner uuid;
  v_is_owner boolean;
  v_is_manager boolean;
  v_target_manager boolean;
BEGIN
  SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;
  v_is_owner := (v_owner = me_id);
  v_is_manager := v_is_owner OR EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = me_id);
  IF NOT v_is_manager THEN RETURN jsonb_build_object('error', 'not_manager'); END IF;
  -- Untouchable by anyone, including himself: removing the owner would leave the
  -- group ownerless with no way back. He transfers it or deletes it.
  IF p_user_id = v_owner THEN RETURN jsonb_build_object('error', 'cant_remove_owner'); END IF;
  -- A manager acts on plain members only. Another manager is the owner's
  -- appointment, so only the owner may undo it.
  v_target_manager := EXISTS(SELECT 1 FROM public.group_managers WHERE group_id = p_group_id AND user_id = p_user_id);
  IF v_target_manager AND NOT v_is_owner THEN RETURN jsonb_build_object('error', 'owner_only'); END IF;
  DELETE FROM public.user_groups WHERE group_id = p_group_id AND user_id = p_user_id;
  UPDATE public.users
     SET relations = jsonb_set(relations, '{availability}', public.user_availability(user_id, location))
   WHERE user_id = p_user_id;
  RETURN public.app_group_members(me_id, p_group_id);
END; $function$;
