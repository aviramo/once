-- ONE STATUS PER USER, READ OFF `watch`.
--
-- The admin panel described a person with TWO badges — page1's state beside
-- page2's — because that is how `relations` is shaped: two independent
-- single-slot mailboxes that nothing makes agree. A reader had to hold both in
-- his head and work out which of them was the person's actual situation, and
-- on live data they contradicted each other (all nine page2 "it ended"
-- messages had no matching page1; see 20260802005242_watch_table).
--
-- `watch` is one row per pair, so a person has ONE situation. This function
-- states it, and it is the only place the rule is written:
--
--   chat      — a live chat, from whichever end holds the row (a chat is one
--               relation; the approver has no outbound row of his own for it)
--   invited   — he sent an invitation and is waiting on the answer
--   watching  — he is looking at somebody's card
--   ended     — his board is holding an outcome he has not dismissed
--   (null)    — nothing; the panel reads `users.seeking` to say whether that
--               is "looking for someone" or "not looking"
--
-- The one thing that does NOT collapse into that status is an invitation he
-- RECEIVED: it is somebody else's action, it stands beside his own situation
-- rather than replacing it (he can be watching C while B invites him), and it
-- is the one inbound fact he still owes an answer to. So it rides its own
-- columns and the panel paints it as a second, separate tag.
--
-- `watchers` is the inbound count — how many people are looking at him right
-- now. A quantity, not a status: it says nothing about what HE is doing.
--
-- THE END MESSAGE IS PER SIDE. The live table carries `watcher_reason` and
-- `target_reason`, not one shared `ended_reason` (the local
-- 20260802005353_watch_model file predates that split and is stale against
-- live — author against the live bodies, per CLAUDE.md). One ending, two
-- sentences: what the watcher is told and what the watched one is told are
-- different, and `_watch_pages` reads them into page1 and page2 respectively.
-- A user's own status therefore reads `watcher_reason`; the inbound
-- `target_reason` is a fact about somebody else's action and belongs to the
-- history below, not to his status line.
--
-- Scale note: one row per user in the environment, idle users included, so the
-- panel can count facets and resolve filters from the same single call rather
-- than restating the status rule in SQL and again in TypeScript. That is the
-- same ceiling the users list already lives with (it pages the whole auth
-- directory on every load, capped at 10k); if the base outgrows it, both move
-- together.

DROP FUNCTION IF EXISTS public.admin_watch_states(boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.admin_watch_states(
  p_is_test  boolean DEFAULT false,
  p_user_ids uuid[]  DEFAULT NULL)
 RETURNS TABLE (
   user_id            uuid,
   seeking            boolean,
   discoverable       boolean,
   status             text,
   other_id           uuid,
   other_name         text,
   ended_reason       text,
   since              timestamptz,
   expires_at         timestamptz,
   invited_by         uuid,
   invited_by_name    text,
   invited_at         timestamptz,
   invited_expires_at timestamptz,
   watchers           int
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH env AS (
    SELECT u.user_id, u.seeking, u.discoverable
    FROM public.users u
    WHERE u.is_test = p_is_test
      AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids))
  ),
  -- The row his own board is holding: the newest watcher slot. Derived from
  -- the stamp rather than from a flag, so it cannot drift (see the slot-stamp
  -- note in the watch model).
  out_slot AS (
    SELECT DISTINCT ON (w.watcher_id) w.*
    FROM public.watch w
    JOIN env e ON e.user_id = w.watcher_id
    WHERE w.watcher_slot_at IS NOT NULL
    ORDER BY w.watcher_id, w.watcher_slot_at DESC
  ),
  -- What is being done TO him. `watch_one_invite_per_target` guarantees at
  -- most one of these.
  inbound AS (
    SELECT w.*
    FROM public.watch w
    JOIN env e ON e.user_id = w.target_id
    WHERE w.state IN ('invited', 'chat')
  ),
  -- How many are looking at him. A watcher whose account is gone is not a
  -- viewer, which is the same clause the projection's viewer list carries.
  seen AS (
    SELECT w.target_id, count(*)::int AS n
    FROM public.watch w
    JOIN env e ON e.user_id = w.target_id
    WHERE w.state = 'watching'
      AND EXISTS (SELECT 1 FROM public.users x WHERE x.user_id = w.watcher_id)
    GROUP BY w.target_id
  ),
  resolved AS (
    SELECT
      e.user_id,
      e.seeking,
      e.discoverable,
      CASE
        WHEN i.state = 'chat' THEN 'chat'
        WHEN o.state IN ('watching', 'invited', 'chat') THEN o.state
        WHEN o.state = 'ended'
         AND o.watcher_cleared_at IS NULL
         AND o.watcher_reason IS NOT NULL THEN 'ended'
      END AS status,
      CASE
        WHEN i.state = 'chat' THEN i.watcher_id
        WHEN o.state IN ('watching', 'invited', 'chat') THEN o.target_id
        WHEN o.state = 'ended'
         AND o.watcher_cleared_at IS NULL
         AND o.watcher_reason IS NOT NULL THEN o.target_id
      END AS other_id,
      CASE WHEN i.state IS DISTINCT FROM 'chat' AND o.state = 'ended'
           THEN o.watcher_reason END AS ended_reason,
      CASE WHEN i.state = 'chat' THEN i.target_slot_at
           ELSE o.watcher_slot_at END AS since,
      CASE WHEN i.state = 'chat' THEN NULL
           WHEN o.state IN ('watching', 'invited') THEN o.expires_at END AS expires_at,
      CASE WHEN i.state = 'invited' THEN i.watcher_id END AS invited_by,
      CASE WHEN i.state = 'invited' THEN i.invited_at END AS invited_at,
      CASE WHEN i.state = 'invited' THEN i.expires_at END AS invited_expires_at,
      coalesce(s.n, 0) AS watchers
    FROM env e
    LEFT JOIN out_slot o ON o.watcher_id = e.user_id
    LEFT JOIN inbound  i ON i.target_id  = e.user_id
    LEFT JOIN seen     s ON s.target_id  = e.user_id
  )
  SELECT
    r.user_id, r.seeking, r.discoverable, r.status,
    r.other_id, ox.name,
    r.ended_reason, r.since, r.expires_at,
    r.invited_by, ix.name, r.invited_at, r.invited_expires_at,
    r.watchers
  FROM resolved r
  LEFT JOIN public.users ox ON ox.user_id = r.other_id
  LEFT JOIN public.users ix ON ix.user_id = r.invited_by
$function$;

REVOKE ALL ON FUNCTION public.admin_watch_states(boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_watch_states(boolean, uuid[]) TO service_role;

-- ── one pair's whole story, for the user page ──────────────────────────────
-- `watch` rows survive the end of the relation they describe, which is the one
-- thing `relations` could never do: the boards only ever held the present
-- moment. This is every person a user has ever been on either end of a watch
-- with, newest first — what happened, when, and which way round it went. Each
-- row states the reason from THIS user's side, so the same ending reads
-- differently depending on which end you are standing on.
DROP FUNCTION IF EXISTS public.admin_watch_history(uuid, int);

CREATE OR REPLACE FUNCTION public.admin_watch_history(
  p_user_id uuid,
  p_limit   int DEFAULT 100)
 RETURNS TABLE (
   other_id      uuid,
   other_name    text,
   direction     text,          -- 'out' = he was watching, 'in' = he was watched
   state         text,
   created_at    timestamptz,
   updated_at    timestamptz,
   invited_at    timestamptz,
   expires_at    timestamptz,
   extended      boolean,
   ended_at      timestamptz,
   ended_reason  text,          -- his side's sentence for the ending
   on_his_board  boolean,       -- this row is the one his board is holding
   cleared       boolean        -- he has dismissed it from his side
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    CASE WHEN w.watcher_id = p_user_id THEN w.target_id ELSE w.watcher_id END,
    x.name,
    CASE WHEN w.watcher_id = p_user_id THEN 'out' ELSE 'in' END,
    w.state, w.created_at, w.updated_at,
    w.invited_at, w.expires_at, w.extended, w.ended_at,
    CASE WHEN w.watcher_id = p_user_id THEN w.watcher_reason ELSE w.target_reason END,
    CASE WHEN w.watcher_id = p_user_id
         THEN w.watcher_slot_at IS NOT NULL
         ELSE w.target_slot_at  IS NOT NULL END,
    CASE WHEN w.watcher_id = p_user_id
         THEN w.watcher_cleared_at IS NOT NULL
         ELSE w.target_cleared_at  IS NOT NULL END
  FROM public.watch w
  LEFT JOIN public.users x
    ON x.user_id = CASE WHEN w.watcher_id = p_user_id THEN w.target_id ELSE w.watcher_id END
  WHERE w.watcher_id = p_user_id OR w.target_id = p_user_id
  ORDER BY coalesce(w.ended_at, w.updated_at) DESC
  LIMIT p_limit
$function$;

REVOKE ALL ON FUNCTION public.admin_watch_history(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_watch_history(uuid, int) TO service_role;
