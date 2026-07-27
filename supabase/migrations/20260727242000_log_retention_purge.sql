-- Retention for `log`. Every HTTP request that reaches the edge function
-- writes exactly one row here (the logging invariant), so this is the fastest
-- growing table in the system by a wide margin: 113 MB / 140k rows at ~6 daily
-- actives, and a 200-user launch multiplies the write rate 10-20x. Nothing
-- reads rows older than a few days (the admin events feed is a recent-first
-- list), so anything past the TTL is pure storage, bloat and vacuum work.
--
-- The window lives in _log_ttl() alongside the other TTL helpers
-- (_watch_ttl / _presence_ttl), not as a literal at the call site.
CREATE OR REPLACE FUNCTION public._log_ttl()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '30 days' $$;

-- Bounded, resumable delete. The whole loop runs inside ONE caller statement,
-- so it lives under service_role's statement_timeout, hence the hard cap
-- (p_max_batches x p_batch rows a run) rather than "delete everything old".
-- Hourly runs converge on any backlog and steady state deletes one hour's
-- worth, well inside the cap and inside the timeout. `capped` says whether a
-- backlog is still draining.
--
-- ctid batching keeps each DELETE's plan a cheap tid scan instead of
-- re-walking the table per batch.
CREATE OR REPLACE FUNCTION public.app_log_purge(
  p_batch int DEFAULT 5000,
  p_max_batches int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cutoff  timestamptz := now() - public._log_ttl();
  v_deleted int := 0;
  v_n       int;
  v_i       int := 0;
BEGIN
  LOOP
    v_i := v_i + 1;
    DELETE FROM public.log
    WHERE ctid = ANY (ARRAY(
      SELECT ctid FROM public.log WHERE created_at < v_cutoff LIMIT p_batch
    ));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
    EXIT WHEN v_n = 0 OR v_i >= p_max_batches;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_deleted,
    'capped', v_deleted >= p_batch * p_max_batches,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.app_log_purge(int, int) FROM public, anon, authenticated;

-- Hourly schedule, offset from the :00 watch sweep. Same shape as the two
-- existing jobs: a thin net.http_post into `ext`, so the run lands in `log`
-- with its own run_ms and processed count instead of being invisible DB-side
-- work. The bearer is lifted off the existing job rather than re-pasted.
DO $$
DECLARE v_auth text; v_cmd text;
BEGIN
  SELECT (regexp_match(command, '"Authorization"\s*:\s*"(Bearer [^"]+)"'))[1]
    INTO v_auth FROM cron.job WHERE jobname = 'expire-sweep';
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'could not read the anon bearer off the existing cron job';
  END IF;
  v_cmd := format(
    $f$SELECT net.http_post(
    url := 'https://sjsblyumdlwckrshwxei.supabase.co/functions/v1/ext/purge',
    headers := %L::jsonb,
    body := '{}'::jsonb
  )$f$,
    jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth)::text);
  PERFORM cron.schedule('log-purge', '20 * * * *', v_cmd);
END $$;
