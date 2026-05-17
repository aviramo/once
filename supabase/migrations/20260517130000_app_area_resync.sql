-- Generalised availability resync (supersedes app_area_launch_sweep's
-- one-directional not_yet→available). Recomputes area_state(location) for
-- every user, and on any change to the stored availability state:
--   * persists the new state (Realtime delivers it to open apps instantly)
--   * queues a push:
--       any → available     ⇒ 'area-open'   ("the game has started")
--       available → unavailable ⇒ 'area-closed' ("no longer available here")
--     (→ not_yet, and the first-ever computation from null, are silent: the
--      first is still gated, the second isn't a real transition.)
--
-- Called immediately from the web admin after any area mutation
-- (create/update/delete/mode switch) via /ext/resync, AND every minute by
-- /ext/cron as the scheduled-launch + self-heal safety net. Idempotent: only
-- users whose effective state actually changed are touched.
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
    new_av := public.area_state(r.location::extensions.geography);
    new_st := new_av->>'state';
    old_st := r.relations->'availability'->>'state';

    if new_st is distinct from old_st then
      update public.users
         set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', new_av)
       where user_id = r.user_id;
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
