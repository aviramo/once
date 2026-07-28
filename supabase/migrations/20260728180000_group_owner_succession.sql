-- Ownership succession when a group owner deletes their account.
--
-- `POST /app/delete` runs app_delete_cleanup and then hard-deletes the users
-- row. groups.owner_id is ON DELETE SET NULL, so until now every group the
-- leaver owned survived OWNERLESS, and an ownerless group is frozen forever:
-- app_delete_group and app_set_manager both test `v_owner = me_id`, which can
-- never be true once owner_id is NULL, so the group can no longer be deleted
-- or given a manager. With no manager left over nobody can answer a join
-- request either, and app_redeem_invite / app_join_nudge_sweep both skip a NULL
-- owner, so the queue sits pending forever without a push to anyone.
--
-- Succession order (user directive 2026-07-28):
--   1. the most senior MANAGER  (earliest group_managers.granted_at)
--   2. else the most senior MEMBER (earliest user_groups.created_at)
--   3. else nobody is left at all, so the group is dropped.
-- The heir is told with the new `group_owner` push (additive code, old clients
-- simply land on home instead of deep-linking to the group).
--
-- NULL owner_id stays a legal state: the pre-launch seed groups were created
-- without an owner and the client renders those as admin-owned. This only stops
-- NEW ownerless groups from being produced by a deletion.

CREATE OR REPLACE FUNCTION public.app_delete_cleanup(me_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  me_row       public.users;
  lock_ids     uuid[];
  notify_list  jsonb := '[]'::jsonb;
  vid          uuid;
  msg          text := 'delete';
  g            record;
  v_heir       uuid;
  succession   jsonb := '[]'::jsonb;  -- [{group_id, group_name, heir}]
  s            jsonb;
BEGIN
  SELECT * INTO me_row FROM public.users WHERE user_id = me_id;
  IF NOT FOUND THEN RETURN '{"notify":[]}'::jsonb; END IF;

  -- Resolve every heir BEFORE the users lock, so the heirs join lock_ids and
  -- the one ordered lock still covers every users row this transaction writes
  -- (succession refreshes the heir's denormalized communities summary).
  FOR g IN SELECT id, name FROM public.groups
            WHERE owner_id = me_id ORDER BY id FOR UPDATE LOOP
    SELECT gm.user_id INTO v_heir
      FROM public.group_managers gm
     WHERE gm.group_id = g.id AND gm.user_id <> me_id
     ORDER BY gm.granted_at, gm.user_id
     LIMIT 1;

    IF v_heir IS NULL THEN
      SELECT ug.user_id INTO v_heir
        FROM public.user_groups ug
       WHERE ug.group_id = g.id AND ug.user_id <> me_id
       ORDER BY ug.created_at, ug.user_id
       LIMIT 1;
    END IF;

    succession := succession || jsonb_build_array(jsonb_build_object(
      'group_id', g.id, 'group_name', g.name, 'heir', v_heir));
  END LOOP;

  lock_ids := ARRAY[me_id]
    || ARRAY(
         SELECT user_id FROM public.users
         WHERE (relations->'page1'->'profile'->>'user_id' = me_id::text
                OR relations->'page2'->'profile'->>'user_id' = me_id::text)
           AND user_id <> me_id
       )
    || ARRAY(
         SELECT DISTINCT (e->>'heir')::uuid
         FROM jsonb_array_elements(succession) e
         WHERE e->>'heir' IS NOT NULL
       );

  PERFORM 1 FROM public.users
  WHERE user_id = ANY(ARRAY(SELECT DISTINCT x FROM unnest(lock_ids) x WHERE x IS NOT NULL))
  ORDER BY user_id FOR UPDATE;

  FOR vid IN SELECT * FROM public._kick_page1_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'left'));
  END LOOP;

  FOR vid IN SELECT * FROM public._kick_page2_pending_at(me_id, NULL, msg) LOOP
    notify_list := notify_list || jsonb_build_array(
      jsonb_build_object('user_id', vid, 'code', 'cancelled-in'));
  END LOOP;

  UPDATE public.users SET relations = jsonb_set(
    relations, '{page2,profiles}',
    COALESCE(
      (SELECT jsonb_agg(v) FROM jsonb_array_elements(relations->'page2'->'profiles') v
       WHERE v->>'user_id' <> me_id::text),
      '[]'::jsonb
    )
  ) WHERE relations->'page2'->>'state' = 'free'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(relations->'page2'->'profiles') e
      WHERE e->>'user_id' = me_id::text
    );

  -- Hand each owned group over (or drop it if it is about to be empty).
  FOR s IN SELECT * FROM jsonb_array_elements(succession) LOOP
    IF s->>'heir' IS NULL THEN
      -- The leaver was the only member. An empty ownerless group can never be
      -- managed back out of that state, so it goes with them. The owner's own
      -- user_groups row still exists here (the users row is deleted after this
      -- RPC returns) and groups is ON DELETE RESTRICT from it, so clear the
      -- membership first, exactly as app_delete_group does.
      DELETE FROM public.user_groups WHERE group_id = (s->>'group_id')::uuid;
      DELETE FROM public.groups      WHERE id       = (s->>'group_id')::uuid;
    ELSE
      UPDATE public.groups SET owner_id = (s->>'heir')::uuid
       WHERE id = (s->>'group_id')::uuid;
      -- An owner is never also a manager: app_set_manager refuses to touch the
      -- owner's own row, so a leftover row there could never be cleared again.
      DELETE FROM public.group_managers
       WHERE group_id = (s->>'group_id')::uuid AND user_id = (s->>'heir')::uuid;
      -- owner_id is not in the comm_groups_upd trigger's column list, so the
      -- heir's cached summary has to be refreshed by hand.
      PERFORM public._refresh_communities((s->>'heir')::uuid);
      notify_list := notify_list || jsonb_build_array(jsonb_build_object(
        'user_id',    (s->>'heir')::uuid,
        'code',       'group_owner',
        'group_id',   s->>'group_id',
        'group_name', s->>'group_name'));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('notify', notify_list);
END;
$function$;

REVOKE ALL ON FUNCTION public.app_delete_cleanup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_cleanup(uuid) TO service_role;
