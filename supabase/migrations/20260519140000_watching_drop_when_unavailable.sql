-- A user who is no longer available (e.g. removed from every enabled group)
-- must not stay in page1 'watching'. When availability flips to
-- 'unavailable' we drop their watched profile (page1 -> {state:'free'}) so the
-- mobile MatchCard slides away with its normal SlideOutDown dismiss, and pull
-- them out of the watched user's viewer list (page2.profiles[]). Enforced via
-- ONE helper used by both the per-minute / admin-driven resync
-- (app_area_resync) AND the synchronous start/location/focus path
-- (app_availability), so there is no <=60s window where a gated user keeps a
-- stale watching card. Covers every gate cause (group / geo / push) since
-- they all flow through user_availability.

create or replace function public._apply_availability(uid uuid, av jsonb)
returns void
language plpgsql
as $$
declare
  cur_rel   jsonb;
  watch_tgt uuid;
begin
  select relations into cur_rel
    from public.users where user_id = uid for update;
  if not found then return; end if;

  if av->>'state' = 'unavailable'
     and cur_rel->'page1'->>'state' = 'watching' then
    watch_tgt := nullif(cur_rel->'page1'->'profile'->>'user_id', '')::uuid;
    update public.users
       set relations = jsonb_set(
             jsonb_set(coalesce(cur_rel, '{}'::jsonb), '{availability}', av),
             '{page1}', jsonb_build_object('state', 'free'))
     where user_id = uid;
    if watch_tgt is not null then
      perform public._remove_from_profiles(watch_tgt, uid);
    end if;
  else
    update public.users
       set relations = jsonb_set(coalesce(cur_rel, '{}'::jsonb), '{availability}', av)
     where user_id = uid;
  end if;
end;
$$;

revoke execute on function public._apply_availability(uuid, jsonb) from anon, authenticated;

create or replace function public.app_area_resync()
returns jsonb
language plpgsql
as $$
declare
  r       record;
  new_av  jsonb;
  new_st  text;
  old_st  text;
  notify  jsonb := '[]'::jsonb;
  cnt     int := 0;
begin
  for r in select user_id, location, relations from public.users loop
    new_av := public.user_availability(r.user_id, r.location::extensions.geography);
    new_st := new_av->>'state';
    old_st := r.relations->'availability'->>'state';

    if new_st is distinct from old_st then
      perform public._apply_availability(r.user_id, new_av);
      cnt := cnt + 1;

      if new_st = 'available' and old_st is not null and old_st <> 'available' then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-open'));
      elsif new_st = 'unavailable' and old_st = 'available' then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-closed'));
      end if;
    end if;
  end loop;

  return jsonb_build_object('processed', cnt, 'notify', notify);
end;
$$;

create or replace function public.app_availability(me_id uuid)
returns jsonb
language plpgsql
as $$
declare
  me_row public.users;
  av     jsonb;
  ru     json;
begin
  select * into me_row from public.users where user_id = me_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  av := public.user_availability(me_id, me_row.location::extensions.geography);

  perform public._apply_availability(me_id, av);

  select row_to_json(u) into ru from public.users u where u.user_id = me_id;
  return jsonb_build_object('user', ru, 'notify', '[]'::jsonb);
end;
$$;
