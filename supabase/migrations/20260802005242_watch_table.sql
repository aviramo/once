-- `watch` — one row per "A is looking at B", the relation the two boards were
-- always describing from opposite ends.
--
-- NOTHING READS OR WRITES THIS YET. It is created empty-of-consequence: the
-- backfill lands next, the projection is proven against live data after that,
-- and only then does a trigger start deriving relations.page1/page2 from it.
--
-- Why a table at all: page1 and page2 are not two views of one relation, they
-- are two independent single-slot mailboxes, and nothing makes them agree. On
-- 2026-08-02, live: all NINE page2 "it ended" messages had no matching page1 on
-- the other side (one inviter was sitting in FOUR different people's page2 with
-- his own page1 empty; one of them belongs to an account that no longer exists),
-- and one real user's full profile — name, bio, four photos — was still filed as
-- a viewer of another real user she stopped watching three weeks earlier. The
-- leak there is `_expire_watch_one`, whose detach-the-other-side half is
-- conditional (`IF did AND p_target IS NOT NULL`). Derived from one row, the two
-- ends have no way to diverge.
--
-- Shape notes, each of them a thing the live data forced:
--   * ONE ROW PER PAIR, carrying that pair's latest relation. A pair that
--     relates again reuses its row.
--   * Rows SURVIVE their relation ending: B's card still has something to say
--     long after A has moved on to C, so `ended_at`/`ended_reason` stay and the
--     row is not deleted.
--   * TWO clear stamps, one per side. app_clear1 and app_clear2 are independent
--     actions and either end can be dismissed while the other still stands.
--   * NO FOREIGN KEY to public.users. A deleted account's row must keep working
--     for the person still holding the other end (live example above). Same
--     reasoning as `restrictions` and `reports`, which also carry none.
--
-- What is deliberately NOT here: "am I open to being seeded" (page1 free vs
-- locked with nothing on it) and "am I visible" (page2 locked with no message).
-- Both are facts about an ACCOUNT, not about a pair, and folding them into the
-- boards is what made page2 mean both "who is looking at me" and "am I hidden".
-- They land as user-level flags in the next migration.

CREATE TABLE IF NOT EXISTS public.watch (
  watcher_id         uuid        NOT NULL,
  target_id          uuid        NOT NULL,
  state              text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- an invitation's own clock
  invited_at         timestamptz,
  expires_at         timestamptz,
  extended           boolean     NOT NULL DEFAULT false,
  -- what happened when it stopped
  ended_at           timestamptz,
  ended_reason       text,
  -- dismissed, per side, independently
  watcher_cleared_at timestamptz,
  target_cleared_at  timestamptz,
  CONSTRAINT watch_pkey PRIMARY KEY (watcher_id, target_id),
  CONSTRAINT watch_not_self CHECK (watcher_id <> target_id),
  CONSTRAINT watch_state_valid CHECK (state IN ('watching', 'invited', 'chat', 'ended')),
  -- an ended row states when, an live one does not
  CONSTRAINT watch_ended_consistent CHECK (
    (state = 'ended' AND ended_at IS NOT NULL)
    OR (state <> 'ended' AND ended_at IS NULL AND ended_reason IS NULL)
  ),
  CONSTRAINT watch_invited_has_clock CHECK (
    state <> 'invited' OR (invited_at IS NOT NULL AND expires_at IS NOT NULL)
  )
);

-- THE GAME'S RULE, AS A CONSTRAINT INSTEAD OF AS DISCIPLINE. Roughly thirty
-- RPCs each remember to maintain "you are looking at one person"; here the
-- database refuses to hold a second.
CREATE UNIQUE INDEX IF NOT EXISTS watch_one_live_per_watcher
  ON public.watch (watcher_id)
  WHERE state IN ('watching', 'invited', 'chat');

-- The other half of it, and the asymmetry that IS the game: any number of
-- people may be watching me, but only one invitation and only one chat.
CREATE UNIQUE INDEX IF NOT EXISTS watch_one_invite_per_target
  ON public.watch (target_id)
  WHERE state IN ('invited', 'chat');

-- The inbound side: my viewer list, my invitation, my "it ended" message.
CREATE INDEX IF NOT EXISTS watch_target_idx ON public.watch (target_id);

-- The projection picks the most recent row per side when nothing is live.
CREATE INDEX IF NOT EXISTS watch_watcher_ended_idx ON public.watch (watcher_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS watch_target_ended_idx  ON public.watch (target_id,  ended_at DESC);

-- The invite-expiry sweep's own predicate.
CREATE INDEX IF NOT EXISTS watch_expires_idx
  ON public.watch (expires_at)
  WHERE state IN ('watching', 'invited');

-- Postgres defaults go the unsafe way and PostgREST publishes what it can
-- reach. The app reads relations over Realtime and never touches this table;
-- only the RPCs (service_role) do.
ALTER TABLE public.watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "block" ON public.watch;
CREATE POLICY "block" ON public.watch FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.watch FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.watch TO service_role;
