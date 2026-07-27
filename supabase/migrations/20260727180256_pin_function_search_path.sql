-- 2026-07-27 — Pin search_path on every public function that lacks one.
-- Advisor `function_search_path_mutable` (WARN x103).
--
-- The value is exactly the session's current effective search_path minus the
-- non-existent "$user" schema, so name resolution is unchanged: `public` for
-- our own tables, `extensions` for PostGIS and pg_net (both are installed
-- there — a bare `public` would break every geography call). pg_temp keeps its
-- implicit first position, as today.
--
-- All 48 SECURITY DEFINER functions already had `SET search_path TO ''` with
-- fully-qualified references; this migration only touches SECURITY INVOKER
-- ones (64 plpgsql + 40 sql).
--
-- Known trade-off: a LANGUAGE sql function with a SET clause can no longer be
-- inlined by the planner. Nine of them sit inside others()/app_find() — the
-- matching scan. Measured before/after on production data: 4.807 ms -> 4.593 ms
-- (best of 7), i.e. no regression at the current row counts. If find latency
-- ever regresses, revert the hot helpers individually:
--   ALTER FUNCTION public.kids_preference_match(...) RESET search_path;
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and (p.proconfig is null or array_to_string(p.proconfig, ',') not like '%search_path%')
  loop
    execute format('alter function %s set search_path to public, extensions', r.sig);
    n := n + 1;
  end loop;
  raise notice 'pinned search_path on % functions', n;
end $$;
