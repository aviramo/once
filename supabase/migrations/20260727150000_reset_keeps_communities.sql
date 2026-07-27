-- The three admin "reset" RPCs rebuild users.relations from scratch with
-- jsonb_build_object(page1, page2, availability, credits) — which silently
-- DROPPED the denormalized `communities` summary the triggers maintain.
--
-- Consequence: any reset user's Communities hub had no summary to paint from,
-- so `communitiesSummary(profile)` returned null and the screen fell back to
-- three round trips (owned_groups + my_groups + my_friends) on every open —
-- the spinners the user reported. The summary never came back on its own: the
-- triggers only fire on a membership/friend/request change, and a reset does
-- not touch user_groups.
--
-- Fix: recompute `communities` as part of the rebuild (it is derived state, not
-- gameplay state — a reset must not forget which groups a user belongs to,
-- since the memberships themselves survive). `push` is deliberately still
-- dropped: the app re-registers its token on launch.
--
-- `_communities_summary` is STABLE and fully public.-qualified inside, so it is
-- safe to call from these SECURITY DEFINER / search_path='' functions.

CREATE OR REPLACE FUNCTION public.app_admin_reset_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_users int;
begin
  delete from public.chat
   where user_id = p_user_id or other_id = p_user_id;

  delete from public.log
   where user_id = p_user_id;

  -- Clears this user's gameplay cooldowns and detaches every other user's
  -- stale reference to them. `block` restrictions and `reports` preserved.
  perform public._admin_reset_detach(array[p_user_id]);

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location),
      'credits', public._credits_default(),
      'communities', public._communities_summary(u.user_id)
    )
  where u.user_id = p_user_id;
  get diagnostics v_users = row_count;

  return jsonb_build_object('ok', v_users > 0, 'users', v_users);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_users int;
begin
  delete from public.chat where user_id is not null;
  delete from public.log where user_id is not null;

  -- `block` restrictions and `reports` preserved: blocked / reported pairs
  -- must stay hidden from each other even after a reset.
  delete from public.restrictions where key <> 'block';

  update public.users set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(user_id, location),
      'credits', public._credits_default(),
      'communities', public._communities_summary(user_id)
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_admin_reset(p_group_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_users int;
  v_ids   uuid[];
begin
  if p_group_ids is null or array_length(p_group_ids, 1) is null then
    return jsonb_build_object('users', 0);
  end if;

  select array_agg(distinct ug.user_id) into v_ids
    from public.user_groups ug
   where ug.group_id = any(p_group_ids);

  if v_ids is null then
    return jsonb_build_object('users', 0);
  end if;

  delete from public.chat
   where user_id = any(v_ids) or other_id = any(v_ids);

  delete from public.log
   where user_id = any(v_ids);

  -- `block` restrictions and `reports` preserved; see _admin_reset_detach.
  perform public._admin_reset_detach(v_ids);

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location),
      'credits', public._credits_default(),
      'communities', public._communities_summary(u.user_id)
    )
  where u.user_id = any(v_ids);
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$function$;

-- Backfill everyone the old reset already stripped (and anyone who predates the
-- denormalization). Cheap: one _communities_summary per affected row.
UPDATE public.users u
   SET relations = jsonb_set(coalesce(u.relations, '{}'::jsonb),
                             '{communities}',
                             public._communities_summary(u.user_id))
 WHERE NOT (coalesce(u.relations, '{}'::jsonb) ? 'communities');
