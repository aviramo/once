-- Prep for the 100-concurrent-user public launch (2026-07-05).
--
-- Both `users` and `chat` are extreme write-heavy (108:1 and higher) — the
-- users.relations JSONB blob is rewritten on every server call by
-- app_refresh_snapshots, and chat rows are append-only under a hot
-- realtime publication. Two things help both:
--
-- 1) fillfactor 90 — reserves 10% of each page for in-place HOT (heap-only
--    tuple) updates. Without HOT, every UPDATE has to write a new tuple
--    AND update every index pointing at the row (users_pkey +
--    idx_users_relations_page1_target etc.). With HOT, an update that
--    doesn't touch an indexed column stays inside its page, avoiding index
--    bloat and cutting write amplification roughly in half. Empirically
--    the users.relations JSONB fields are NOT indexed (only expression
--    indexes on specific sub-paths that rarely change), so most updates
--    should qualify as HOT candidates.
--
-- 2) autovacuum tuned more aggressive on users — the table is tiny (73
--    rows today, 200 tomorrow) but rewritten hundreds of times per user.
--    Default autovacuum thresholds are proportional to row count, so a
--    100-row table almost never autovacuums even under heavy churn.
--    Explicit override forces it to run when dead tuples exceed 20% AND at
--    least 20 rows, keeping page density high.
--
-- All statements are safe idempotent — `alter table ... set` overwrites,
-- no locks that block writes for more than a moment.

alter table public.users set (
  fillfactor = 90,
  autovacuum_vacuum_scale_factor = 0.20,
  autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.10,
  autovacuum_analyze_threshold = 10
);

alter table public.chat set (
  fillfactor = 90
);

-- NOTE: VACUUM FULL would force the new fillfactor onto existing pages
-- immediately, but it requires ACCESS EXCLUSIVE and cannot run inside a
-- transaction (migrations DO run in a transaction). Fillfactor is
-- application-forward instead: it kicks in as autovacuum rewrites pages
-- (usually within minutes under production write load on such a small
-- table). If a manual "warm the fillfactor now" is ever needed, run
-- `VACUUM FULL public.users;` from the SQL Editor outside a transaction.
--
-- Freshen statistics so the query planner picks the right access paths
-- under load. ANALYZE is transactional-safe.
analyze public.users;
analyze public.chat;
