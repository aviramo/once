-- 2026-07-27 — One SELECT policy on public.users instead of two.
-- Advisor `multiple_permissive_policies` (WARN).
--
-- public.users carried two permissive SELECT policies for `authenticated`:
-- `owners` (own row) and `admins read all` (JWT app_metadata.role = 'admin').
-- Permissive policies are OR'ed, so both were evaluated on every authenticated
-- read of the app's busiest table. One policy carrying both arms is exactly
-- equivalent and costs half as much.
--
-- Order matters: widen `owners` FIRST, drop the admin policy SECOND, so no
-- statement in between can lose access to a row it could read before.
--
-- Verified after applying, against production data: a plain authenticated JWT
-- sees exactly 1 row (its own); an admin JWT still sees all 128.
ALTER POLICY "owners" ON public.users
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin')
  );

DROP POLICY "admins read all" ON public.users;
