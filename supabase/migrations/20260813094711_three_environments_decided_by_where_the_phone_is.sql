-- THREE WORLDS, AND WHERE THE PHONE IS ON ITS FIRST FIX DECIDES WHICH
-- (user directive 2026-08-13).
--
-- `is_test` is a boolean, so it could hold two worlds and the product needs
-- three: the Israeli users the app is about to be marketed to, the store
-- reviewers (and everyone else outside the Middle East, who must never meet an
-- Israeli user before there is a market there), and the developer's own Hebrew
-- test cast, which until now shared a partition with the reviewers -- the
-- developer's own phone could be dealt as a card to somebody at Apple, 12,000
-- km away, because nothing but a backdated last_seen stood between them.
--
--   il     - production
--   review - the store reviewers and the seeded pool around Apple's campuses
--   dev    - the Hebrew cast and the developer's own devices
--
-- `is_test` STAYS, derived (env <> 'il'), because the admin console and a dozen
-- helpers read it and it still answers the question it always answered. What
-- changes is that every PARTITION check now compares env, so review and dev are
-- two different worlds rather than one.
--
-- The environment is decided ONCE, on the first location a row ever carries,
-- and never looked at again: `data.env_locked_at`. Every account that exists
-- today is stamped locked by this migration in the state it is already in.
-- Moving somebody afterwards is a deliberate act -- app_admin_set_env.

-- ── the column ─────────────────────────────────────────────────────────────
ALTER TABLE public.users  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'review';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'review';

ALTER TABLE public.users  DROP CONSTRAINT IF EXISTS users_env_valid;
ALTER TABLE public.users  ADD CONSTRAINT users_env_valid  CHECK (env IN ('il','review','dev'));
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_env_valid;
ALTER TABLE public.groups ADD CONSTRAINT groups_env_valid CHECK (env IN ('il','review','dev'));

-- ── the world each existing row is already in ──────────────────────────────
UPDATE public.users SET env = CASE
  WHEN NOT is_test                             THEN 'il'
  WHEN data->>'seed' = 'app-store-review'      THEN 'review'
  ELSE                                              'dev' END;

UPDATE public.users
   SET data = data || jsonb_build_object('env_locked_at', to_jsonb(now()), 'env_from', 'backfill')
 WHERE NOT (data ? 'env_locked_at');

-- A circle belongs to the world of whoever owns it; an ownerless one to the
-- world of whoever is standing in it.
UPDATE public.groups g SET env = COALESCE(
  (SELECT u.env FROM public.users u WHERE u.user_id = g.owner_id),
  (SELECT u.env FROM public.user_groups ug JOIN public.users u ON u.user_id = ug.user_id
    WHERE ug.group_id = g.id LIMIT 1),
  'dev');

CREATE INDEX IF NOT EXISTS users_env_idx  ON public.users  (env);
CREATE INDEX IF NOT EXISTS groups_env_idx ON public.groups (env);

-- ── the reader ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._env(uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce((SELECT u.env FROM public.users u WHERE u.user_id = uid), 'review')
$$;
REVOKE ALL ON FUNCTION public._env(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._env(uuid) TO service_role;

-- Everything that asks "are we in the same world" goes through here: friends,
-- friend links by code, reports, referrals, people search.
CREATE OR REPLACE FUNCTION public._same_partition(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public._env(a) = public._env(b)
$$;

-- ── the four places that compare partitions by hand ────────────────────────
-- Patched against the LIVE bodies rather than re-typed, so nothing else in
-- them can drift; a missing anchor aborts the whole migration.
DO $do$
DECLARE src text; out_ text;
BEGIN
  src := pg_get_functiondef('public.others(public.users, boolean)'::regprocedure);
  out_ := replace(src, 'other.is_test = COALESCE((me).is_test, false)',
                       'other.env = COALESCE((me).env, ''review'')');
  IF out_ = src THEN RAISE EXCEPTION 'others(): partition anchor not found'; END IF;
  EXECUTE out_;

  src := pg_get_functiondef('public.app_search_groups(uuid,text,integer,integer)'::regprocedure);
  out_ := replace(src, 'g.is_test = public._is_test(me_id)', 'g.env = public._env(me_id)');
  IF out_ = src THEN RAISE EXCEPTION 'app_search_groups(): partition anchor not found'; END IF;
  EXECUTE out_;

  src := pg_get_functiondef('public.app_redeem_invite(uuid,text)'::regprocedure);
  out_ := replace(src, 'v_group_test boolean;', 'v_group_test text;');
  out_ := replace(out_, 'SELECT id, name, requires_approval, is_test',
                        'SELECT id, name, requires_approval, env');
  out_ := replace(out_, 'v_group_test IS DISTINCT FROM public._is_test(me_id)',
                        'v_group_test IS DISTINCT FROM public._env(me_id)');
  IF out_ = src OR out_ LIKE '%_is_test(me_id)%' THEN
    RAISE EXCEPTION 'app_redeem_invite(): partition anchor not found';
  END IF;
  EXECUTE out_;

  src := pg_get_functiondef('public.app_respond_join(uuid,uuid,boolean)'::regprocedure);
  out_ := replace(src, 'v_group_test boolean;', 'v_group_test text;');
  out_ := replace(out_, 'SELECT g.owner_id, g.name, g.is_test INTO',
                        'SELECT g.owner_id, g.name, g.env INTO');
  out_ := replace(out_, 'public._is_test(v_requester)', 'public._env(v_requester)');
  IF out_ = src OR out_ LIKE '%_is_test(v_requester)%' THEN
    RAISE EXCEPTION 'app_respond_join(): partition anchor not found';
  END IF;
  EXECUTE out_;

  src := pg_get_functiondef('public._group_drain_requests(uuid,boolean)'::regprocedure);
  out_ := replace(src, 'v_test boolean;', 'v_test text;');
  out_ := replace(out_, 'SELECT g.name, g.is_test INTO', 'SELECT g.name, g.env INTO');
  out_ := replace(out_, 'public._is_test(jr.user_id)', 'public._env(jr.user_id)');
  IF out_ = src OR out_ LIKE '%_is_test(jr.user_id)%' THEN
    RAISE EXCEPTION '_group_drain_requests(): partition anchor not found';
  END IF;
  EXECUTE out_;
END $do$;

-- A circle is stamped from its owner, env and the derived flag together.
CREATE OR REPLACE FUNCTION public._group_stamp_is_test()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    NEW.env := public._env(NEW.owner_id);
  END IF;
  NEW.is_test := (NEW.env <> 'il');
  RETURN NEW;
END;
$$;

-- ── is_test follows env, always ────────────────────────────────────────────
-- (The geo half of this trigger arrives in the next migration.)
CREATE OR REPLACE FUNCTION public._users_env_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.is_test := (NEW.env <> 'il');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_env_stamp ON public.users;
CREATE TRIGGER users_env_stamp
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public._users_env_stamp();
