-- Scheduled launch sweep. Runs every minute via the existing /ext/cron job
-- (alongside app_expire_sweep). For every user still marked not_yet whose
-- area has since opened (starts_at passed / area enabled), flip their stored
-- availability to available and queue an 'area-open' push ("the game has
-- started"). Users who opened the app themselves at launch were already
-- flipped to available by app_availability (no longer not_yet), so they are
-- skipped here — no duplicate push, and the push only reaches people who
-- weren't in the app when their area opened.
create or replace function public.app_area_launch_sweep()
returns jsonb
language plpgsql
as $$
declare
  r       record;
  new_av  jsonb;
  notify  jsonb := '[]'::jsonb;
  cnt     int := 0;
begin
  for r in
    select user_id, location
    from public.users
    where relations->'availability'->>'state' = 'not_yet'
  loop
    new_av := public.area_state(r.location::extensions.geography);
    if (new_av->>'state') = 'available' then
      update public.users
         set relations = jsonb_set(coalesce(relations, '{}'::jsonb), '{availability}', new_av)
       where user_id = r.user_id
         and relations->'availability'->>'state' = 'not_yet';
      if found then
        notify := notify || jsonb_build_array(
          jsonb_build_object('user_id', r.user_id, 'code', 'area-open'));
        cnt := cnt + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('processed', cnt, 'notify', notify);
end;
$$;
