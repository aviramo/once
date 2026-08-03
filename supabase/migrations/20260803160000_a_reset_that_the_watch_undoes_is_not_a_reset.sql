-- A RESET THAT THE WATCH UNDOES IS NOT A RESET.
--
-- Found while measuring how much of the watch migration is left. Of the three
-- admin resets, one was never taught that the boards are projected:
--
--   app_admin_reset_user(uuid)  — correct. Detaches, then nulls the slot and
--                                 reason fields so nothing is left for
--                                 _watch_pages to describe.
--   app_admin_reset(uuid[])     — detaches (and _admin_reset_detach releases the
--                                 live rows), but leaves the slot/reason fields
--                                 standing, so an ENDED row can still project a
--                                 stale message onto a board it just cleared.
--   app_admin_reset()           — touches `watch` NOT AT ALL.
--
-- That last one is the bug. It is the GLOBAL reset: it deletes every chat row and
-- every log row and rewrites every user's relations to empty boards — and then
-- the watch rows, untouched, put the boards straight back the next time anything
-- projects. The admin presses reset, the screen goes clean, and the same person is
-- looking at the same person again. The boards stopped being the truth on
-- 2026-08-02 and this function still believed it was writing it.
--
-- The global one WIPES the table, which is what the reset it lives in already
-- does to `chat` and to `log` — the rows either side of it are being deleted
-- outright, and a global reset that preserved watch history while destroying the
-- conversations would be keeping the shadow and throwing away the substance. The
-- per-group one keeps its release (it must not touch rows belonging to users
-- outside the groups named) and gains only the field clearing its per-user
-- sibling already does.
--
-- Neither function is CALLED here. `where watcher_id is not null` is the
-- safeupdate guard, which rejects a bare DELETE even inside a definer function.

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

  -- THE BOARDS ARE PROJECTED FROM HERE, so a reset that skips this resets
  -- nothing: every row left standing is a board that comes back.
  delete from public.watch where watcher_id is not null;

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
  -- This also runs _watch_release, which ends the live rows.
  perform public._admin_reset_detach(v_ids);

  -- An ENDED row still describes a board until its slot and reason are gone —
  -- the same clearing app_admin_reset_user does, and for the same reason. The
  -- rows are not deleted here: they can be shared with users outside the groups
  -- being reset, and only THIS side of such a row may be cleared.
  update public.watch w set
    watcher_slot_at = case when w.watcher_id = any(v_ids) then null else w.watcher_slot_at end,
    watcher_reason = case when w.watcher_id = any(v_ids) then null else w.watcher_reason end,
    watcher_cleared_at = case when w.watcher_id = any(v_ids) then null else w.watcher_cleared_at end,
    target_slot_at = case when w.target_id = any(v_ids) then null else w.target_slot_at end,
    target_reason = case when w.target_id = any(v_ids) then null else w.target_reason end,
    target_cleared_at = case when w.target_id = any(v_ids) then null else w.target_cleared_at end
  where (w.watcher_id = any(v_ids) or w.target_id = any(v_ids))
    and (w.watcher_slot_at is not null or w.target_slot_at is not null
      or w.watcher_reason is not null or w.target_reason is not null);

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
