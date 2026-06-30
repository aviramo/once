-- Launch-night (2026-06-04) performance hardening.
--
-- Incident: with only 73 users and ~0.33 req/s, the DB saturated — trivial
-- single-row SELECT/UPDATE took 40-90s and statement_timeout (57014) fired.
-- Root cause: Nano compute (burstable CPU) throttled under the constant
-- per-minute full-table app_area_resync + a modest user burst, while
-- service_role had NO statement_timeout (inherited the 120s global default),
-- so a stalled edge-function query held a connection for up to 2 minutes and
-- filled the 60-connection pool -> cascade. Compute upgrade (Nano -> Medium)
-- is done separately via the dashboard; this migration covers the DB-side
-- hardening.

-- 1) Cap service_role queries so a stalled edge-function call fails fast
--    instead of holding a pooled connection for the 120s global default.
--    (anon=3s, authenticated=8s already; service_role had none.)
ALTER ROLE service_role SET statement_timeout = '20s';

-- 2) Index restrictions in BOTH directions used by others()'s NOT EXISTS
--    (r.user_id=me AND r.other_id=other) OR (r.other_id=me AND r.user_id=other).
--    others() runs on every find / seed_viewer; restrictions grows with every
--    ignore/cancel/remove/decline/leave/block.
CREATE INDEX IF NOT EXISTS restrictions_user_other_idx ON public.restrictions (user_id, other_id);
CREATE INDEX IF NOT EXISTS restrictions_other_user_idx ON public.restrictions (other_id, user_id);

-- 3) Fix the dead expire-sweep index. Its predicate was state='invited', but
--    the two-board model never uses that value (page1 uses 'waiting'), so the
--    per-minute app_expire_sweep seq-scanned all users. Replace with the
--    correct partial indexes for both sweep passes.
DROP INDEX IF EXISTS public.idx_users_relations_invited_expires;

CREATE INDEX IF NOT EXISTS users_page1_waiting_expires_idx
  ON public.users (((relations->'page1'->>'expires_at')))
  WHERE (relations->'page1'->>'state') = 'waiting';

CREATE INDEX IF NOT EXISTS users_page2_pending_expires_idx
  ON public.users (((relations->'page2'->>'expires_at')))
  WHERE (relations->'page2'->>'state') = 'pending';

NOTIFY pgrst, 'reload config';
