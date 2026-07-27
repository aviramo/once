-- The admin user-detail page reads the event feed as
-- `log where user_id = $1 order by created_at desc`, and `log.user_id` had no
-- index at all (it is the FK the linter flags) — every such read was a seq
-- scan over the whole table. `log` is the highest-volume table in the system
-- (one row per HTTP request that reaches the edge function, 113 MB / 360k
-- inserts and growing fastest of anything here), so that scan gets worse with
-- every request the app serves. Composite (user_id, created_at desc) so the
-- feed's ORDER BY + LIMIT is served straight off the index.
--
-- Applied live with CONCURRENTLY (the log insert sits on the hot path of every
-- request; a plain CREATE INDEX would have blocked writes for the build).
CREATE INDEX CONCURRENTLY IF NOT EXISTS log_user_created_idx
  ON public.log (user_id, created_at DESC);
