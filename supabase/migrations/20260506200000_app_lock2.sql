-- ── app_lock2 ──────────────────────────────────────────────────────────────
-- Premium "hide me" action. Atomically:
--   1. Kicks every watcher in A.page2.profiles[] (each watcher's page1 →
--      locked + message='remove' — only if still pointing at A in 'watching'),
--      adds a per-pair `remove` restriction, fires a `removed` push.
--   2. Flips A.page2 to {state: 'locked'} (no profile, no profiles).
-- Single-call equivalent of N app_remove invocations + a final state flip.
-- The mobile UI confirms with the user before calling whenever the viewer
-- list is non-empty, since the action is destructive (existing viewers are
-- notified and put on the standard 24h restriction window).
-- No-op if A.page2.state is not currently 'free'.
CREATE OR REPLACE FUNCTION public.app_lock2(me_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result_user  json;
  notify       jsonb := '[]'::jsonb;
  watcher_ids  uuid[] := '{}';
  watcher_id   uuid;
BEGIN
  -- Snapshot the watcher list off A.page2.profiles before any mutation.
  -- Subquery + FILTER produce a clean uuid[] (or empty array) regardless of
  -- whether `profiles` is missing, empty, or populated. Avoids the
  -- `{NULL}` trap that LEFT JOIN LATERAL with an empty lateral produces,
  -- which would otherwise feed NULL into _add_restriction and abort the txn.
  SELECT COALESCE(
    (SELECT array_agg((p->>'user_id')::uuid)
     FROM jsonb_array_elements(COALESCE(u.relations->'page2'->'profiles', '[]'::jsonb)) AS p
     WHERE p->>'user_id' IS NOT NULL),
    '{}'::uuid[]
  )
  INTO watcher_ids
  FROM public.users u
  WHERE u.user_id = me_id AND u.relations->'page2'->>'state' = 'free';

  -- INTO with zero rows leaves watcher_ids unchanged from its declared
  -- initializer; this is a defensive guard for that case anyway.
  IF watcher_ids IS NULL THEN watcher_ids := '{}'; END IF;

  -- Lock me + every watcher in a single ordered SELECT to avoid deadlocks
  -- with concurrent writes from the watchers' own actions.
  PERFORM 1 FROM public.users WHERE user_id = ANY(ARRAY[me_id] || watcher_ids) ORDER BY user_id FOR UPDATE;

  -- Per-watcher: kick page1 (only if still pointing at A), record restriction,
  -- queue `removed` push. Mirrors app_remove's transaction body exactly.
  IF array_length(watcher_ids, 1) IS NOT NULL THEN
    FOREACH watcher_id IN ARRAY watcher_ids LOOP
      UPDATE public.users SET relations = jsonb_set(relations, '{page1}', public._page1_locked(relations->'page1'->'profile', 'remove'))
      WHERE user_id = watcher_id AND relations->'page1'->>'state' = 'watching' AND relations->'page1'->'profile'->>'user_id' = me_id::text;
      PERFORM public._add_restriction(me_id, watcher_id, 'remove');
      notify := notify || jsonb_build_array(jsonb_build_object('user_id', watcher_id, 'code', 'removed'));
    END LOOP;
  END IF;

  -- A.page2 → locked, no profile, no profiles. Race-safe gate on 'free'.
  UPDATE public.users SET relations = jsonb_set(relations, '{page2}', public._page2_locked(NULL, NULL))
  WHERE user_id = me_id AND relations->'page2'->>'state' = 'free';

  SELECT row_to_json(u) INTO result_user FROM public.users u WHERE u.user_id = me_id;
  RETURN jsonb_build_object('user', result_user, 'notify', notify);
END;
$$;
