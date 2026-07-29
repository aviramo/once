-- Handing the group over left the screen behind the confirm popup showing the
-- OLD truth: the roster still wore "owner" on the caller's row and the group
-- row still said is_owner, because app_transfer_owner answered with the user
-- row alone. Its two siblings (app_set_manager, app_remove_member) both answer
-- with the fresh roster, and the caller can still read one — he stays a MANAGER
-- of the group (20260728210000), so app_group_members admits him.
--
-- Purely additive: `user` and `notify` are untouched, `members` joins them.
-- A published client that ignores the new key behaves exactly as before.

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
  -- ...and the outgoing owner takes that role himself. His user_groups row is
  -- untouched by the handover, so _gm_ensure_member is satisfied.
  INSERT INTO public.group_managers(user_id, group_id)
    VALUES (me_id, p_group_id) ON CONFLICT DO NOTHING;
  -- owner_id is not in the comm_groups_upd trigger's column list, so both
  -- cached summaries are refreshed by hand: the group stays in the old owner's
  -- `managed` list (as a manager now), and moves into the new owner's.
  PERFORM public._refresh_communities(p_user_id);
  PERFORM public._refresh_communities(me_id);

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user', result_user,
    -- The roster as it stands AFTER the handover: the new owner's row wears the
    -- crown, the caller's wears "manager". The page the caller pops back to
    -- repaints from this instead of from what it read before the tap.
    'members', (public.app_group_members(me_id, p_group_id))->'members',
    'notify', jsonb_build_array(jsonb_build_object(
      'user_id',    p_user_id,
      'code',       'group_owner',
      'group_id',   p_group_id,
      'group_name', v_group_name)));
END; $function$;

REVOKE ALL ON FUNCTION public.app_transfer_owner(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_transfer_owner(uuid, uuid, uuid) TO service_role;
