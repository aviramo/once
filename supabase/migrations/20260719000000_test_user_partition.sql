-- Test-user matching partition (2026-07-19)
-- ============================================================================
-- Replaces the group-disable gate with a per-user `is_test` flag that splits
-- the matching pool into two mutually exclusive environments:
--
--   * a test user is matchable ONLY with other test users
--   * a normal user is matchable ONLY with other normal users
--
-- Symmetric by construction -- no leakage in either direction. Purpose: run
-- tests against production with real accounts without exposing testers to real
-- users or vice versa.
--
-- The old mechanism (`groups.enabled = false` => group_blocked => unavailable)
-- did not isolate, it switched users OFF entirely -- members of a disabled
-- group could not play at all. It is removed wholesale here: `groups.enabled`,
-- `group_blocked` and `in_enabled_group` are dropped and every group is active.
-- A group is organisational again.
--
-- Live state at authoring time: groups "גוגל ואפל" (10 members) and "בדיקות"
-- (41) are disabled; "הרמת מסך" (22) is enabled. 51 users become test users
-- (0 overlap, 0 collision with "הרמת מסך") out of 96 total. Those 51 are
-- exactly today's group_blocked population, so the dashboard KPI totals are
-- unchanged by the swap.
--
-- Function bodies are patched from the LIVE definition (pg_get_functiondef +
-- replace) rather than re-emitted from the local migration files, because
-- CLAUDE.md warns the local files can drift from the live database. Every
-- patch asserts its anchor was found and RAISEs otherwise, so a drifted body
-- aborts the whole migration instead of silently applying a partial change.
--
-- Additive for the deployed mobile build: others() is internal-only, the app
-- never reads the column, and no response shape changes. The one visible
-- effect is `"is_test": false` riding along in the `row_to_json(u)` user
-- object, which is the "new field in a blob" case old clients ignore. No
-- BACKWARD_COMPAT.md entry.
-- ============================================================================


-- 1) The flag ----------------------------------------------------------------
-- A real column, not a data->> key: this is a filter predicate evaluated per
-- candidate row inside others(), so it must be typed, NOT NULL and indexable.
-- NOT NULL DEFAULT false makes the partition total by construction -- there is
-- no third "unknown" bucket that could leak either way.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Partial index: the test population is the small, selective side. The normal
-- side matches ~100% of rows, where no index helps.
CREATE INDEX IF NOT EXISTS users_is_test_idx
  ON public.users (is_test) WHERE is_test;


-- 2) Backfill: the two test groups become the test environment ---------------
UPDATE public.users u
SET is_test = true
WHERE EXISTS (
  SELECT 1
  FROM public.user_groups ug
  JOIN public.groups g ON g.id = ug.group_id
  WHERE ug.user_id = u.user_id
    AND g.name IN ('גוגל ואפל', 'בדיקות')
);

DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.users WHERE is_test;
  IF n <> 51 THEN
    RAISE EXCEPTION 'backfill expected 51 test users, got % -- live membership changed since authoring', n;
  END IF;
  RAISE NOTICE 'backfill: % test users flagged', n;
END $$;

-- The app-review demo account joins the test environment (user decision
-- 2026-07-19). It is safe: the test pool holds 51 profiles, so a store
-- reviewer still sees a populated app. Matched on the auth email rather than
-- the display name so a renamed row cannot be missed.
UPDATE public.users u
SET is_test = true
WHERE EXISTS (
  SELECT 1 FROM auth.users a
  WHERE a.id = u.user_id AND a.email = 'review@once.app'
);


-- 3) others(): add the partition, drop the group gate ------------------------
DO $$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'others';

  IF src IS NULL THEN
    RAISE EXCEPTION 'public.others() not found';
  END IF;

  -- Patch 1: the environment partition.
  -- Deliberately NOT wrapped in the `NOT only_available OR ...` shape the gate
  -- clauses below it use. Those are availability gates; this is an identity
  -- property, so it must hold for every caller of others() including
  -- only_available = false. `other.is_test` stays a bare column reference so
  -- users_is_test_idx remains usable; COALESCE guards the `me` side only,
  -- since `me` is a composite passed in by the caller and can be sparse.
  patched := replace(
    src,
    'WHERE other.user_id IS DISTINCT FROM (me).user_id',
    'WHERE other.user_id IS DISTINCT FROM (me).user_id'
      || E'\n    AND other.is_test = COALESCE((me).is_test, false)'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'others(): is_test anchor not found -- live body drifted, aborting';
  END IF;

  -- Patch 2: remove the now-dead group-disable candidacy clause.
  src := patched;
  patched := replace(
    src,
    E'    AND (\n      NOT only_available\n      OR NOT public.group_blocked(other.user_id)\n    )\n',
    ''
  );
  IF patched = src THEN
    RAISE EXCEPTION 'others(): group_blocked clause not found -- live body drifted, aborting';
  END IF;

  EXECUTE patched;
END $$;


-- 4) user_availability: push gate only ---------------------------------------
-- The geo branch was already removed (20260706020000); the group branch goes
-- here. `is_test` is deliberately NOT a gate input: a test user is fully
-- available, just inside a different pool. The `loc` param is kept (unused)
-- for signature/caller compatibility.
-- `geography` must be schema-qualified: the migration runs with an empty
-- search_path, so the bare name does not resolve. extensions.geography is the
-- same type the existing signature uses, so this stays a CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.user_availability(uid uuid, loc extensions.geography)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when public.push_blocked(uid)
      then jsonb_build_object('state', 'unavailable', 'reason', 'push')
    else jsonb_build_object('state', 'available')
  end
$function$;


-- 5) admin_dashboard_metrics: "suspended" becomes "test" ---------------------
-- The blocked CTE already excludes a population from every KPI and from the
-- 7-day funnel; it just needs to point at the new flag. This is what keeps
-- testers out of the business metrics.
DO $$
DECLARE src text; patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_dashboard_metrics';

  IF src IS NULL THEN
    RAISE EXCEPTION 'public.admin_dashboard_metrics() not found';
  END IF;

  patched := replace(src, 'WHERE public.group_blocked(u.user_id)', 'WHERE u.is_test');
  IF patched = src THEN
    RAISE EXCEPTION 'admin_dashboard_metrics(): blocked CTE anchor not found -- live body drifted, aborting';
  END IF;

  EXECUTE patched;
END $$;


-- 6) admin_user_facet_counts: seg.test / seg.not_test ------------------------
-- The documented invariant is that the seg block mirrors applySecondary() 1:1,
-- so the two new users-list segments need matching counts or their dropdown
-- options render (0).
DO $$
DECLARE src text; patched text; anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_user_facet_counts';

  IF src IS NULL THEN
    RAISE EXCEPTION 'public.admin_user_facet_counts() not found';
  END IF;

  anchor := E'      ''no_notif'',     (SELECT count(*) FROM public.users u WHERE public.push_blocked(u.user_id))\n';
  patched := replace(
    src,
    anchor,
    anchor
      || E'      ,''test'',        (SELECT count(*) FROM public.users u WHERE u.is_test)\n'
      || E'      ,''not_test'',    (SELECT count(*) FROM public.users u WHERE NOT u.is_test)\n'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'admin_user_facet_counts(): seg anchor not found -- live body drifted, aborting';
  END IF;

  EXECUTE patched;
END $$;


-- 7) Drop the group-disable helpers ------------------------------------------
-- Safe now: others() (3) and user_availability (4) were the only live callers
-- of group_blocked, and in_enabled_group had none.
DROP FUNCTION IF EXISTS public.group_blocked(uuid);
DROP FUNCTION IF EXISTS public.in_enabled_group(uuid);


-- 8) Every group is active ---------------------------------------------------
ALTER TABLE public.groups DROP COLUMN IF EXISTS enabled;


-- 9) app_review_seed: flag instead of group-join -----------------------------
-- The old tail joined a group literally named 'בדיקה', which does not exist
-- (the live group is 'בדיקות'), so it has been a no-op. Replaced by the flag,
-- which is also what now puts the reviewer in the curated test pool.
CREATE OR REPLACE FUNCTION public.app_review_seed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  tmpl    public.users;
  v_data  jsonb;
begin
  select * into tmpl
  from public.users
  where data->>'bio' is not null and data->>'bio' <> ''
    and jsonb_array_length(coalesce(data->'images', '[]'::jsonb)) > 0
  order by created_at
  limit 1;

  -- Clone a real onboarded profile (images render), strip the stranger's
  -- push token, force a non-empty bio (the onboarding-complete gate).
  v_data := (coalesce(tmpl.data, '{}'::jsonb) - 'push_token')
            || jsonb_build_object('bio', 'App review / demo account.');

  insert into public.users as u (
    user_id, name, is_male, is_for_male, is_for_female,
    birth_date, age_from, age_to, range, location, data, relations, last_seen,
    is_test
  ) values (
    p_user_id,
    'App Review',
    coalesce(tmpl.is_male, true),
    true, true,
    date '1995-06-15',
    18, 99,
    coalesce(tmpl.range, 100000),
    'SRID=4326;POINT(34.7818 32.0853)'::extensions.geography,
    v_data,
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    ),
    now(),
    true
  )
  on conflict (user_id) do update set
    name          = 'App Review',
    is_for_male   = true,
    is_for_female = true,
    age_from      = 18,
    age_to        = 99,
    range         = coalesce(tmpl.range, 100000),
    data          = v_data,
    relations     = jsonb_build_object(
                       'page1', jsonb_build_object('state', 'free'),
                       'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
                     ),
    last_seen     = now(),
    is_test       = true;
end;
$function$;

REVOKE ALL ON FUNCTION public.app_review_seed(uuid) FROM public, anon, authenticated;


-- 10) Tear down links that now straddle the two environments -----------------
-- others() governs future candidate selection only. A user who is flagged
-- while mid-watch / mid-invite / mid-chat keeps that link forever, and it may
-- now cross the boundary. The two admin release RPCs are state-aware and
-- repair the counterparty (detach from the watched user's page2.profiles[],
-- close a pending invite on the invitee side, end a chat on the partner's
-- side, kick every viewer, refund held hearts), so no new SQL is needed.
DO $$
DECLARE uid uuid; n int := 0;
BEGIN
  FOR uid IN SELECT user_id FROM public.users WHERE is_test LOOP
    PERFORM public.app_admin_release_page1(uid);
    PERFORM public.app_admin_release_page2(uid);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'released both pages for % test users', n;
END $$;


-- 11) Retire the two groups --------------------------------------------------
-- Their job is done: isolation now lives in the flag. Memberships and manager
-- grants must be detached explicitly -- user_groups_group_id_fkey is NOT
-- ON DELETE CASCADE (the web deleteGroup action detaches first for the same
-- reason), so a bare DELETE on groups raises 23503.
DELETE FROM public.group_managers gm
USING public.groups g
WHERE g.id = gm.group_id AND g.name IN ('גוגל ואפל', 'בדיקות');

DELETE FROM public.user_groups ug
USING public.groups g
WHERE g.id = ug.group_id AND g.name IN ('גוגל ואפל', 'בדיקות');

DELETE FROM public.groups WHERE name IN ('גוגל ואפל', 'בדיקות');


-- 12) Assert the partition holds ---------------------------------------------
-- Runs inside the migration transaction: any leak aborts and rolls everything
-- back. This exercises the exact contract all three callers use --
-- others(me, true) filtered to relevance > 0.
DO $$
DECLARE leaks bigint; checked bigint; n_test bigint; n_normal bigint;
BEGIN
  SELECT count(*) FILTER (WHERE c.is_test <> me.is_test), count(*)
    INTO leaks, checked
  FROM public.users me
  CROSS JOIN LATERAL public.others(me, true) o
  JOIN public.users c ON c.user_id = o.user_id
  WHERE o.relevance > 0;

  SELECT count(*) FILTER (WHERE is_test), count(*) FILTER (WHERE NOT is_test)
    INTO n_test, n_normal
  FROM public.users;

  -- An empty pool is also trivially disjoint, so a green result with zero
  -- pairs proves nothing.
  IF checked = 0 THEN
    RAISE EXCEPTION 'verification vacuous: others() returned 0 matchable pairs';
  END IF;
  IF leaks > 0 THEN
    RAISE EXCEPTION 'PARTITION LEAK: % of % pairs cross the boundary', leaks, checked;
  END IF;

  RAISE NOTICE 'partition holds: 0 leaks across % pairs (% test / % normal users)',
    checked, n_test, n_normal;
END $$;


-- users gained a column -> PostgREST must refresh or the admin panel 400s.
NOTIFY pgrst, 'reload config';
