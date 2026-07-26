-- 2026-07-25 — Denormalize a lightweight communities summary into
-- users.relations.communities so the hub + the settings "Communities" row paint
-- instantly from the user payload with NO extra query. Maintained by triggers on
-- the underlying tables, so every path stays in sync (including the currently-
-- published app's redeem/leave). Additive + safe: old mobile ignores the field.
-- Applied live via MCP as `communities_summary_denormalized`; kept for the repo.
--
-- Shape: { managed:[{id,name,invite_code,is_public,members,is_owner}],
--          joined:[{id,name}], friends:int, requests:int }

CREATE OR REPLACE FUNCTION public._communities_summary(uid uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'managed', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'is_public', g.is_public,
        'is_owner', (g.owner_id = uid),
        'members', (SELECT count(*) FROM public.user_groups ug2 WHERE ug2.group_id = g.id)
      ) ORDER BY (g.owner_id = uid) DESC, g.created_at DESC)
      FROM public.groups g
      WHERE g.owner_id = uid
         OR EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'joined', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
      FROM public.user_groups ug JOIN public.groups g ON g.id = ug.group_id
      WHERE ug.user_id = uid
        AND g.owner_id IS DISTINCT FROM uid
        AND NOT EXISTS(SELECT 1 FROM public.group_managers gm WHERE gm.group_id = g.id AND gm.user_id = uid)
    ), '[]'::jsonb),
    'friends',  (SELECT count(*) FROM public.friend_links fl WHERE fl.a = uid OR fl.b = uid),
    'requests', (SELECT count(*) FROM public.friend_requests fr WHERE fr.target_id = uid AND fr.status = 'pending')
  );
$$;

CREATE OR REPLACE FUNCTION public._refresh_communities(uid uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.users
     SET relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{communities}', public._communities_summary(uid))
   WHERE user_id = uid;
$$;

CREATE OR REPLACE FUNCTION public._trg_comm_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._refresh_communities(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._trg_comm_friend_link() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._refresh_communities(COALESCE(NEW.a, OLD.a));
  PERFORM public._refresh_communities(COALESCE(NEW.b, OLD.b));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._trg_comm_friend_req() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._refresh_communities(COALESCE(NEW.target_id, OLD.target_id));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._trg_comm_group() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.owner_id IS NOT NULL THEN PERFORM public._refresh_communities(OLD.owner_id); END IF;
    RETURN NULL;
  END IF;
  PERFORM public._refresh_communities(ug.user_id) FROM public.user_groups ug WHERE ug.group_id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS comm_user_groups     ON public.user_groups;
DROP TRIGGER IF EXISTS comm_group_managers  ON public.group_managers;
DROP TRIGGER IF EXISTS comm_friend_links    ON public.friend_links;
DROP TRIGGER IF EXISTS comm_friend_requests ON public.friend_requests;
DROP TRIGGER IF EXISTS comm_groups_upd      ON public.groups;
DROP TRIGGER IF EXISTS comm_groups_del      ON public.groups;

CREATE TRIGGER comm_user_groups     AFTER INSERT OR DELETE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_membership();
CREATE TRIGGER comm_group_managers  AFTER INSERT OR DELETE ON public.group_managers
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_membership();
CREATE TRIGGER comm_friend_links    AFTER INSERT OR DELETE ON public.friend_links
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_friend_link();
CREATE TRIGGER comm_friend_requests AFTER INSERT OR UPDATE OR DELETE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_friend_req();
CREATE TRIGGER comm_groups_upd      AFTER UPDATE OF name, is_public ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_group();
CREATE TRIGGER comm_groups_del      AFTER DELETE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public._trg_comm_group();

SELECT public._refresh_communities(user_id) FROM public.users;
