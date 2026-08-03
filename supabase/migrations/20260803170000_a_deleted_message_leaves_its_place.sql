-- A message the sender deletes leaves a tombstone rather than a hole: the row
-- stays (both sides keep the same history, and a reply quoting it still points
-- somewhere), its content is stripped, and `deleted_at` is what the client
-- reads to draw "this message was deleted" on BOTH sides.
alter table public.chat add column if not exists deleted_at timestamptz;
