-- Group managers — per-user, per-group promotion. A row says "this user is a
-- manager of this group" with a `granted_at` that drives the management-
-- seniority ordering on the group's member list. Distinct from
-- group_permissions (per-GROUP permission grants): group_manager is granted
-- to specific members of a group, not to every member.
--
-- Capabilities (enforced in the web layer; admin-only at the DB):
--   * Admin (JWT app_metadata.role='admin'): full power.
--   * Group manager (>=1 row in group_managers): VIEW-ONLY access scoped to
--     the union of users who belong to any group they manage. May promote a
--     fellow member of one of their managed groups to group_manager — that
--     is the ONLY write they can do. Demote is admin-only by user decision.

INSERT INTO public.permissions (key) VALUES ('group_manager')
  ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.group_managers (
  user_id    uuid        NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.groups(id)     ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS group_managers_group_idx ON public.group_managers(group_id);

ALTER TABLE public.group_managers ENABLE ROW LEVEL SECURITY;
-- No policies → service-role only (admin web actions write here; nobody else).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'group_managers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_managers';
  END IF;
END $$;

-- Member-check (no composite FK to user_groups available).
CREATE OR REPLACE FUNCTION public._gm_ensure_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_groups
    WHERE user_id = NEW.user_id AND group_id = NEW.group_id
  ) THEN
    RAISE EXCEPTION 'group_manager(%) must first be a member of group(%)',
      NEW.user_id, NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS group_managers_member_trg ON public.group_managers;
CREATE TRIGGER group_managers_member_trg
  BEFORE INSERT OR UPDATE ON public.group_managers
  FOR EACH ROW EXECUTE FUNCTION public._gm_ensure_member();

-- Auto-revoke: removing a membership cascades to the manager grant.
CREATE OR REPLACE FUNCTION public._gm_cascade_on_membership_remove()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.group_managers
  WHERE user_id = OLD.user_id AND group_id = OLD.group_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS user_groups_remove_cascade_managers ON public.user_groups;
CREATE TRIGGER user_groups_remove_cascade_managers
  AFTER DELETE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public._gm_cascade_on_membership_remove();

-- Helpers used by the web layer's auth gate.
CREATE OR REPLACE FUNCTION public.is_group_manager(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_managers WHERE user_id = p_user_id)
$$;

CREATE OR REPLACE FUNCTION public.managed_group_ids(p_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(group_id ORDER BY granted_at), ARRAY[]::uuid[])
  FROM public.group_managers WHERE user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.managed_user_ids(p_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT ug.user_id), ARRAY[]::uuid[])
  FROM public.user_groups ug
  JOIN public.group_managers gm ON gm.group_id = ug.group_id
  WHERE gm.user_id = p_user_id
$$;

REVOKE ALL ON FUNCTION public.is_group_manager(uuid)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.managed_group_ids(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.managed_user_ids(uuid)  FROM public, anon, authenticated;
