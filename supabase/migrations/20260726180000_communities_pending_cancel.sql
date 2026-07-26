-- 2026-07-26 — Pending join requests on the requester's summary + cancel RPC.
--
-- Additive: the requester now sees each group they've asked to join under
-- relations.communities.pending, so the Communities hub can render a
-- "waiting for approval" row alongside their real memberships and let them
-- cancel from there. Tapping the pending JoinButton in the search screen
-- opens the same cancel confirm.
--
-- Also refresh the requester's own denormalized summary when a
-- group_join_requests row is created/deleted (previously only owner+managers
-- were refreshed, which is enough for the pending BADGE they see but not for
-- the requester's own pending list).
--
-- Authored against the LIVE function bodies (introspected via
-- pg_get_functiondef).

-- ── Summary: add `pending` array for the requester ─────────────────────────
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
    'pending', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'is_public', g.is_public, 'description', g.description,
        'invite_code', CASE WHEN g.is_public THEN g.invite_code ELSE NULL END,
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY g.name)
      FROM public.group_join_requests jr JOIN public.groups g ON g.id = jr.group_id
      WHERE jr.user_id = uid
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$function$;

-- ── Trigger: refresh the requester too ──────────────────────────────────────
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
  -- The requester themselves (their own pending list changes).
  PERFORM public._refresh_communities(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END $function$;

-- ── app_cancel_join: requester withdraws their own pending request ──────────
-- Idempotent: cancelling a request that no longer exists is a no-op success.
-- No push, no owner/manager notification (silent, mirrors reject-by-staff).
CREATE OR REPLACE FUNCTION public.app_cancel_join(me_id uuid, p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE result_user json;
BEGIN
  DELETE FROM public.group_join_requests
   WHERE group_id = p_group_id AND user_id = me_id;

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object(
    'user',   result_user,
    'notify', '[]'::jsonb,
    'groups', public._my_groups(me_id)
  );
END; $function$;
