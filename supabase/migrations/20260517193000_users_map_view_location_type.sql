-- Add location_type to the live users map read model so the admin map can
-- mark home/work anchors. Legacy-compat: rows last written by a pre-typed
-- mobile build carry only data.location_custom (boolean) and no
-- data.location_type, so derive 'home' when location_custom is true (can't
-- distinguish home vs work for those old rows), else 'device'. A present
-- data.location_type ('device'|'home'|'work') always wins. Appended last so
-- CREATE OR REPLACE VIEW keeps the existing column order.
create or replace view public.users_map with (security_invoker = on) as
select
  u.user_id,
  u.name,
  u.last_seen,
  u.data -> 'images' -> 0 ->> 'normal' as image,
  extensions.st_y(u.location::extensions.geometry) as lat,
  extensions.st_x(u.location::extensions.geometry) as lng,
  coalesce(
    nullif(u.data ->> 'location_type', ''),
    case
      when coalesce((u.data ->> 'location_custom')::boolean, false) then 'home'
      else 'device'
    end
  ) as location_type
from public.users u
where u.location is not null;
