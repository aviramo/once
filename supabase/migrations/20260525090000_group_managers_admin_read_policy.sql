-- 2026-05-25 — admin SELECT policy for group_managers, matching the pattern
-- on `groups` / `user_groups`. Without this, the web-admin Realtime listener
-- gets no events for promote/demote actions (RLS blocks the SELECT on every
-- payload, regardless of admin role). The policy uses the JWT app_metadata
-- role check, the same one the other admin-read policies use.
CREATE POLICY "admins read group_managers"
  ON public.group_managers
  FOR SELECT
  TO authenticated
  USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));
