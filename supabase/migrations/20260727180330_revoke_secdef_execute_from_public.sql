-- 2026-07-27 — Take SECURITY DEFINER functions off the public API surface.
-- Advisors `anon_security_definer_function_executable` (40) and
-- `authenticated_security_definer_function_executable` (40).
--
-- Every SECURITY DEFINER function in `public` runs as its owner (postgres) and
-- bypasses RLS. Postgres grants EXECUTE to PUBLIC by default, and PostgREST
-- exposes every function in an exposed schema as /rest/v1/rpc/<name> — so the
-- anon key that ships inside the APK could call them directly. Verified before
-- the fix: POST /rpc/_is_test with the anon key returned HTTP 200, and
-- app_admin_set_credits has no internal authorization check at all (it trusts
-- the edge function to be its only caller). After: HTTP 404.
--
-- Fix: EXECUTE for service_role only — what every legitimate caller already
-- uses (the edge functions and the admin console). GRANT runs before REVOKE so
-- there is never an instant without access.
--
-- Verified not to affect anything:
--   * mobile never calls an RPC directly (no `.rpc(` anywhere in mobile/src)
--   * the admin console uses SUPABASE_SERVICE_ROLE_KEY (web/src/lib/supabase/admin.ts)
--   * the only table `authenticated` writes directly is chat_reads, whose
--     trigger function is SECURITY INVOKER
--   * no RLS policy, column DEFAULT or CHECK constraint references any of them
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  loop
    execute format('grant execute on function %s to service_role', r.sig);
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    n := n + 1;
  end loop;
  raise notice 'locked down % SECURITY DEFINER functions', n;
end $$;
