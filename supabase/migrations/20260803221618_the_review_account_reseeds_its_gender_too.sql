-- app_review_seed's ON CONFLICT branch rewrote everything about the demo
-- account except is_male and birth_date, so a row left in another state by a
-- test kept that state through a re-seed -- and the card's gendered copy (the
-- smoking line) reads off exactly that column, against a drawn portrait that
-- does not move. The seed is the whole profile or it is not a seed.
CREATE OR REPLACE FUNCTION public.app_review_seed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_data  jsonb;
  v_gid   uuid;
  v_other uuid;
begin
  v_data := jsonb_build_object(
    'os', 'ios',
    'lang', 'en',
    'units', 'imperial',
    'seed', 'app-store-review',
    'bio', 'Reviewer demo account. I joined a few circles here: trail running on the weekend, the Sunday farmers market and a board game night in Campbell.',
    'height', 170,
    'smokes', false,
    'family', jsonb_build_object('hasKids', false, 'isForKids', true),
    'images', jsonb_build_array(
      jsonb_build_object('normal', 'f6b27bc0-ab71-4311-b019-2ee7006421a9.webp'),
      jsonb_build_object('normal', '5bd68dc4-0f2f-4097-a059-ae5c6e3e559d.webp'),
      jsonb_build_object('normal', '7a02f867-ba4b-4fe0-8f3e-882ede282c3c.webp')
    )
  );

  insert into public.users as u (
    user_id, name, is_male, is_for_male, is_for_female,
    birth_date, age_from, age_to, range, location, data, relations, last_seen,
    is_test
  ) values (
    p_user_id,
    'Alex',
    false,
    true, true,
    date '1993-04-11',
    18, 99,
    null,
    -- a block from Apple Park, so the pool reads as the neighbourhood it is
    'SRID=4326;POINT(-122.0122 37.3369)'::extensions.geography,
    v_data,
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'credits', jsonb_build_object('balance', 3, 'extra', 0, 'held', 0)
    ),
    now(),
    true
  )
  on conflict (user_id) do update set
    name          = 'Alex',
    is_male       = false,
    is_for_male   = true,
    is_for_female = true,
    birth_date    = date '1993-04-11',
    age_from      = 18,
    age_to        = 99,
    range         = null,
    location      = 'SRID=4326;POINT(-122.0122 37.3369)'::extensions.geography,
    data          = v_data,
    relations     = jsonb_build_object(
                       'page1', jsonb_build_object('state', 'free'),
                       'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
                       'credits', jsonb_build_object('balance', 3, 'extra', 0, 'held', 0)
                     ),
    last_seen     = now(),
    is_test       = true;

  -- three circles anyone may join, so the hub is never an empty page
  for v_gid in
    select g.id from public.groups g
     where g.is_test and g.is_public and not g.requires_approval
       and g.name in ('Bay Area Trail Runners', 'Sunday Farmers Market Crew', 'South Bay Board Games')
  loop
    insert into public.user_groups (user_id, group_id) values (p_user_id, v_gid)
    on conflict (user_id, group_id) do nothing;
  end loop;

  -- a few friends, taken from the seeded pool. friend_links is canonical on
  -- (a < b), and a friend is never offered as a candidate, so keep it small.
  for v_other in
    select u.user_id from public.users u
     where u.data->>'seed' = 'app-store-review' and u.user_id <> p_user_id
     order by u.created_at
     limit 4
  loop
    insert into public.friend_links (a, b, via)
    values (least(p_user_id, v_other), greatest(p_user_id, v_other), 'review')
    on conflict (a, b) do nothing;
  end loop;

  perform public._refresh_communities(p_user_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.app_review_seed(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_review_seed(uuid) TO service_role;

SELECT public.app_review_seed('8aed2067-a9c8-460a-8ae0-85707ff9372d');
