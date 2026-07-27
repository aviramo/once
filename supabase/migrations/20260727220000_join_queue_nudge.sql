-- A request nobody answered is worse than a declined one: the person waits on
-- a queue whose owner has forgotten it exists. Two days in, the staff get ONE
-- nudge per group (user directive 2026-07-27), and the rows are stamped so the
-- same wait never nudges twice. Dispatched by the per-minute ext/cron sweep,
-- which fires the pushes from the returned notify list.
ALTER TABLE public.group_join_requests
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz;

CREATE OR REPLACE FUNCTION public._join_nudge_after()
 RETURNS interval LANGUAGE sql IMMUTABLE AS $function$ SELECT interval '48 hours' $function$;

CREATE OR REPLACE FUNCTION public.app_join_nudge_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_notify jsonb;
BEGIN
  -- Stamp first, then build the notify list from what was stamped: doing it in
  -- one statement is what makes the sweep idempotent under the per-minute cron.
  WITH stale AS (
    UPDATE public.group_join_requests jr
       SET nudged_at = now()
     WHERE jr.status = 'pending'
       AND jr.nudged_at IS NULL
       AND jr.created_at < now() - public._join_nudge_after()
    RETURNING jr.group_id
  ), per_group AS (
    SELECT s.group_id, g.name AS group_name, count(*)::int AS waiting
      FROM stale s JOIN public.groups g ON g.id = s.group_id
     GROUP BY s.group_id, g.name
  ), staff AS (
    SELECT pg.group_id, pg.group_name, pg.waiting, g.owner_id AS user_id
      FROM per_group pg JOIN public.groups g ON g.id = pg.group_id
     WHERE g.owner_id IS NOT NULL
    UNION
    SELECT pg.group_id, pg.group_name, pg.waiting, gm.user_id
      FROM per_group pg JOIN public.group_managers gm ON gm.group_id = pg.group_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', staff.user_id, 'code', 'group_pending',
           'group_id', staff.group_id, 'group_name', staff.group_name,
           -- The count is the whole queue, not just the rows that aged past the
           -- threshold on this tick: that is the number the manager will see.
           'count', (SELECT count(*) FROM public.group_join_requests jr2
                      WHERE jr2.group_id = staff.group_id AND jr2.status = 'pending')
         )), '[]'::jsonb)
    INTO v_notify
    FROM staff;

  RETURN jsonb_build_object('notify', v_notify, 'processed', jsonb_array_length(v_notify));
END; $function$;
