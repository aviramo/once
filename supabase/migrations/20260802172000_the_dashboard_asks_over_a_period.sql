-- ONE ACTIVITY SECTION, OVER A PERIOD THE READER CHOOSES.
--
-- The dashboard had a fixed "7-day funnel" beside a "live engagement" block,
-- and between them they never answered the question an operator opens the
-- screen with: what happened, and over what stretch. This is one set of
-- figures with a window — day / week / month / all time, `p_since` NULL being
-- all time — so the same eleven tiles are read against whatever period the
-- header picker is on. The live-state counts the engagement block carried
-- (in a chat / waiting / watching right now) are not lost: they are the users
-- list's own `?state=` filter, which is where you go to act on them.
--
-- Sources, and why each is what it is:
--
--   active            `users.last_seen` inside the window — how many people
--                     opened the app at all. It leads the section: every tile
--                     beside it is something a subset of these people did.
--                     Over "all time" it is everyone who ever opened it once.
--   accounts          `users.created_at` — the row IS the signup.
--   friendships       `friend_links`, which is ALREADY one row per pair (the
--                     edge is stored ordered, a < b), so "a friendship counts
--                     once" needs no DISTINCT.
--   memberships       `user_groups` — one row per person joining one circle,
--                     so a circle of five that filled up this week counts
--                     five. That is the question being asked.
--   profiles          the FIRST log row whose snapshot already carries
--                     MIN_PROFILE_IMAGES photos. There is no profile_built_at
--                     column and nothing needs one: `log.user` is the whole
--                     post-event user row, so the moment an account first HAD
--                     two photos is derivable. It inherits the log's own
--                     retention, so a build older than the purge horizon is
--                     invisible — which only ever matters to "all time".
--   invites sent      log 'invite'. There is no other ledger for it: `watch`
--                     keeps one row per PAIR and reuses it, so it remembers
--                     the latest relation between two people, not every
--                     invitation they ever exchanged. It therefore
--                     under-reports beyond the log's retention horizon, which
--                     is a property of the data and is said on the section's
--                     own hint rather than hidden.
--   invites declined  `restrictions` 'decline', NOT the log, and
--   invites cancelled `restrictions` 'cancel'. The log is PRUNED (ext/purge)
--                     and restrictions is not: checked row by row, every
--                     outcome from 2026-06-04 has no surviving log row and
--                     every one from 2026-07-05 onward has exactly one, so
--                     counting declines from the log reported 2 where the
--                     ledger holds 5. Cancelled had no tile at all, and it is
--                     the second most common outcome — without it the funnel
--                     could not add up (live: 35 sent, 2 declined, 0 expired,
--                     0 chats, and no account of the other 33).
--   invites expired   `watch`. An expiry is nobody's action, so it appears in
--                     no log — and it is the one figure here NOT read off an
--                     append-only record, which is a trap. `watch.ended_at`
--                     was stamped `now()` by the backfill for every row it
--                     created as 'ended', so all seven pre-existing expiries
--                     carry one timestamp to the microsecond and the
--                     invitations they describe were sent weeks earlier.
--                     Live, that read as "0 sent and 4 expired in the last 24
--                     hours", which cannot happen. An ending whose time is
--                     unknown belongs to no period, so `ended_at > (the
--                     table's own earliest created_at)` drops the backfill's
--                     rows without hard-coding a date: they all sit AT that
--                     minimum, and everything the trigger has written since is
--                     strictly after it. "All time" loses those seven, which
--                     is the smaller error than dating them to the afternoon
--                     the table was created.
--                     A reason of 'expire' is UNAMBIGUOUS: a
--                     lapsed watch WINDOW sets page1 to a bare
--                     {state:'locked'} with no message (`_expire_watch_one`),
--                     which syncs a NULL reason, so only an expired
--                     invitation ever leaves 'expire' behind. It leaves it on
--                     whichever side still had the invitation on its board,
--                     hence either side counts, once per pair.
--                     (`invited_at IS NOT NULL` was the first guard here and
--                     was wrong: an ended page1 carries no invited_at, so
--                     every ended row has a null one and the tile read zero.)
--   chats             log 'approve' — approving is what opens a chat. Same
--                     retention caveat as invites sent.
--   avg messages      real messages in the window per distinct pair, so a
--                     conversation that ran long and one that died after "hi"
--                     each count as one chat.
--   blocks            restrictions 'block'.
--   reports           `reports.created_at`, scoped by the reporter.
--   logouts/deletes   log 'logout' / 'delete'.
--
-- Everything is bounded by the environment, exactly as admin_dashboard_metrics
-- is: the two matching pools never meet.

DROP FUNCTION IF EXISTS public.admin_activity_metrics(timestamptz, boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.admin_activity_metrics(
  p_since    timestamptz DEFAULT NULL,
  p_is_test  boolean     DEFAULT false,
  p_user_ids uuid[]      DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH env AS (
    SELECT coalesce(array_agg(u.user_id), '{}'::uuid[]) AS ids
    FROM public.users u
    WHERE u.is_test = p_is_test
      AND (p_user_ids IS NULL OR u.user_id = ANY(p_user_ids))
  ),
  born AS (SELECT min(created_at) AS at FROM public.watch)
  SELECT jsonb_build_object(
    'active', (
      SELECT count(*) FROM public.users
      WHERE user_id = ANY(env.ids)
        AND last_seen IS NOT NULL
        AND (p_since IS NULL OR last_seen >= p_since)
    ),
    'accounts', (
      SELECT count(*) FROM public.users
      WHERE user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'friendships', (
      SELECT count(*) FROM public.friend_links f
      WHERE (f.a = ANY(env.ids) OR f.b = ANY(env.ids))
        AND (p_since IS NULL OR f.created_at >= p_since)
    ),
    'memberships', (
      SELECT count(*) FROM public.user_groups ug
      WHERE ug.user_id = ANY(env.ids)
        AND (p_since IS NULL OR ug.created_at >= p_since)
    ),
    'profiles', (
      SELECT count(*) FROM (
        SELECT l.user_id, min(l.created_at) AS built_at
        FROM public.log l
        WHERE l.user_id = ANY(env.ids)
          AND jsonb_typeof(l.user->'data'->'images') = 'array'
          AND jsonb_array_length(l.user->'data'->'images') >= 2
        GROUP BY l.user_id
      ) q
      WHERE p_since IS NULL OR q.built_at >= p_since
    ),
    'invites_sent', (
      SELECT count(*) FROM public.log
      WHERE key = 'invite' AND status < 400 AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'invites_declined', (
      SELECT count(*) FROM public.restrictions
      WHERE key = 'decline' AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'invites_cancelled', (
      SELECT count(*) FROM public.restrictions
      WHERE key = 'cancel' AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'invites_expired', (
      SELECT count(*) FROM public.watch w
      WHERE ('expire' IN (w.watcher_reason, w.target_reason))
        AND w.ended_at IS NOT NULL
        AND w.ended_at > born.at
        AND (w.watcher_id = ANY(env.ids) OR w.target_id = ANY(env.ids))
        AND (p_since IS NULL OR w.ended_at >= p_since)
    ),
    'chats', (
      SELECT count(*) FROM public.log
      WHERE key = 'approve' AND status < 400 AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'avg_messages', (
      SELECT coalesce(round(avg(c)::numeric, 1), 0) FROM (
        SELECT count(*) AS c
        FROM public.chat ch
        WHERE coalesce(ch.is_event, false) = false
          AND ch.user_id = ANY(env.ids)
          AND (p_since IS NULL OR ch.created_at >= p_since)
        GROUP BY least(ch.user_id, ch.other_id), greatest(ch.user_id, ch.other_id)
      ) q
    ),
    'blocks', (
      SELECT count(*) FROM public.restrictions
      WHERE key = 'block' AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'reports', (
      SELECT count(*) FROM public.reports
      WHERE reporter_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'logouts', (
      SELECT count(*) FROM public.log
      WHERE key = 'logout' AND status < 400 AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    ),
    'deletes', (
      SELECT count(*) FROM public.log
      WHERE key = 'delete' AND status < 400 AND user_id = ANY(env.ids)
        AND (p_since IS NULL OR created_at >= p_since)
    )
  )
  FROM env, born
$function$;

REVOKE ALL ON FUNCTION public.admin_activity_metrics(timestamptz, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_metrics(timestamptz, boolean, uuid[]) TO service_role;
