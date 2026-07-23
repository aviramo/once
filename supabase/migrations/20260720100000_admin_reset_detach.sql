-- Make "reset user" actually reset.
--
-- Bug: resetting a user rebuilt ONLY that user's `relations`. Everything that
-- keeps a candidate out of their pool lives elsewhere:
--   1. `restrictions` (bidirectional 24h `ignore`/`cancel`/`remove`, 7d
--      `decline`, 14d `leave`) -- a separate table the reset never touched.
--   2. Other users' `page1.profile` still pointing at the reset user while
--      `state IN ('watching','waiting')` -- `app_find` drops any candidate who
--      is watching me, so each stale pointer permanently burns a candidate.
--   3. The reset user lingering in other users' `page2.profiles[]` --
--      `others.relevance_watchers` is `(5 - viewers)/5`, so a candidate at 5
--      viewers scores 0 and `app_find`'s `relevance > 0` filter excludes them.
-- Net effect: a user who skipped everyone stayed stuck after a reset, and the
-- only cure was resetting the OTHER users. Worse, the reset emptied the user's
-- own viewer list, re-arming `app_seed_viewer` to burn another candidate into
-- `watching` on the next start/focus.
--
-- `block` restrictions and `reports` stay preserved -- that is the 2026-05-28
-- decision (a reset must never reintroduce a pair that blocked or reported
-- each other). Only the gameplay cooldowns are cleared.

create or replace function public._admin_reset_detach(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_text text[];
begin
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;
  select array_agg(x::text) into v_text from unnest(p_ids) x;

  -- 1. Gameplay cooldowns, both directions. `block` is the safety record
  --    (`app_report` always writes one) and is preserved.
  delete from public.restrictions r
   where r.key <> 'block'
     and (r.user_id = any(p_ids) or r.other_id = any(p_ids));

  -- 2. Other users' page1 pointing at a reset user. Landings mirror
  --    `app_admin_release_page1`'s counterparty teardown: a watch is released
  --    silently, an outgoing invite expires (held heart refunded), a chat ends.
  update public.users u
     set relations = case u.relations->'page1'->>'state'
       when 'watching' then jsonb_set(u.relations, '{page1}',
                              jsonb_build_object('state', 'free'))
       when 'waiting'  then jsonb_set(
                              public._credits_refund(u.relations,
                                public._credits_cost('invite')),
                              '{page1}',
                              public._page1_locked(
                                u.relations->'page1'->'profile', 'expire'))
       when 'chat'     then jsonb_set(u.relations, '{page1}',
                              public._page1_locked(
                                u.relations->'page1'->'profile', 'leave'))
       else u.relations
     end
   where u.relations->'page1'->'profile'->>'user_id' = any(v_text)
     and not (u.user_id = any(p_ids))
     and coalesce(u.relations->'page1'->>'state', '')
         in ('watching', 'waiting', 'chat');

  -- 3. Other users holding a live incoming invite FROM a reset user.
  update public.users u
     set relations = jsonb_set(u.relations, '{page2}',
           public._page2_locked(u.relations->'page2'->'profile', 'cancel'))
   where u.relations->'page2'->'profile'->>'user_id' = any(v_text)
     and not (u.user_id = any(p_ids))
     and u.relations->'page2'->>'state' = 'pending';

  -- 4. Reset users lingering in other users' viewer lists.
  update public.users u
     set relations = jsonb_set(u.relations, '{page2,profiles}',
           coalesce((select jsonb_agg(v)
                       from jsonb_array_elements(u.relations->'page2'->'profiles') v
                      where not (v->>'user_id' = any(v_text))), '[]'::jsonb))
   where u.relations->'page2'->>'state' = 'free'
     and not (u.user_id = any(p_ids))
     and exists (select 1
                   from jsonb_array_elements(u.relations->'page2'->'profiles') v
                  where v->>'user_id' = any(v_text));
end;
$function$;

revoke execute on function public._admin_reset_detach(uuid[]) from anon, authenticated;

-- Per-user reset (web admin "Danger zone").
create or replace function public.app_admin_reset_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      'credits', public._credits_default()
    )
  where u.user_id = p_user_id;
  get diagnostics v_users = row_count;

  return jsonb_build_object('ok', v_users > 0, 'users', v_users);
end;
$function$;

-- Group-scoped reset (web admin reset popup).
create or replace function public.app_admin_reset(p_group_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      'credits', public._credits_default()
    )
  where u.user_id = any(v_ids);
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$function$;

-- Global reset. Every row is rebuilt, so there is no surviving reference to
-- detach -- only the cooldown table needs clearing.
create or replace function public.app_admin_reset()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      'credits', public._credits_default()
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$function$;
