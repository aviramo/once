-- 2026-07-27 — Performance advisors: RLS initplan, duplicate permissive policies,
-- unindexed foreign keys. No privilege or semantic change anywhere in this file.
--
-- 1. `auth_rls_initplan` (WARN x11). A bare auth.uid() / auth.jwt() inside a
--    policy is re-evaluated PER ROW; wrapping it in a scalar subquery turns it
--    into an InitPlan evaluated ONCE per query. Identical semantics.
--    ALTER POLICY (not DROP+CREATE) so there is no window with the policy gone.
--
-- 2. `multiple_permissive_policies` (WARN x2). The legacy `block` policies are
--    PERMISSIVE ... USING (false) — permissive policies are OR'ed, so a `false`
--    one never denies anything; it only costs an extra evaluation on every
--    authenticated read of `users` and `log`. Scoped to `anon` instead of
--    `public` so the deny-all intent stays visible where it is meaningful and
--    the authenticated path stops paying for it. No access changes: RLS is
--    deny-by-default, and `users`/`log` grant nothing to anon in the first place.
--
-- 3. `unindexed_foreign_keys` (INFO x4). FKs with no covering index seq-scan the
--    child table on cascade delete. All four tables are tiny today (chat 96 kB),
--    so a plain CREATE INDEX is instantaneous.

-- ── 1. Per-user policies (the ones the app actually exercises) ──────────────
ALTER POLICY "related" ON public.chat
  USING (((SELECT auth.uid()) = user_id) OR ((SELECT auth.uid()) = other_id));

ALTER POLICY "owners" ON public.users
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "chat_reads_select" ON public.chat_reads
  USING ((reader_id = (SELECT auth.uid())) OR (peer_id = (SELECT auth.uid())));

ALTER POLICY "chat_reads_insert" ON public.chat_reads
  WITH CHECK (reader_id = (SELECT auth.uid()));

ALTER POLICY "chat_reads_update" ON public.chat_reads
  USING (reader_id = (SELECT auth.uid()))
  WITH CHECK (reader_id = (SELECT auth.uid()));

-- ── 1b. Admin-console read policies (JWT app_metadata.role = 'admin') ───────
ALTER POLICY "admins read all" ON public.users
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

ALTER POLICY "admins read all" ON public.log
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

ALTER POLICY "admins read reports" ON public.reports
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

ALTER POLICY "admins read groups" ON public.groups
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

ALTER POLICY "admins read user_groups" ON public.user_groups
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

ALTER POLICY "admins read group_managers" ON public.group_managers
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

-- ── 2. Drop the no-op permissive `block` off the authenticated read path ────
ALTER POLICY "block" ON public.users TO anon;
ALTER POLICY "block" ON public.log   TO anon;
-- public.states keeps `block` on public: it is that table's only policy.

-- ── 3. Missing FK indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS group_join_requests_user_idx ON public.group_join_requests(user_id);
CREATE INDEX IF NOT EXISTS chat_other_idx               ON public.chat(other_id);
CREATE INDEX IF NOT EXISTS friend_credits_peer_idx      ON public.friend_credits(peer_id);
CREATE INDEX IF NOT EXISTS states_other_idx             ON public.states(other_id);
