-- Read model for the web admin live users map: location geography exploded
-- into lat/lng + first profile image filename, so the map can plot users
-- without parsing PostGIS blobs server-side. security_invoker = on so the
-- view honours the base table's RLS: service role (web admin) bypasses RLS
-- and sees every located user; anon/auth get only their own row (matching
-- users' "owners" policy) which is harmless. Only rows with a location are
-- exposed (a user with no location can't be placed on a map).
create or replace view public.users_map with (security_invoker = on) as
select
  u.user_id,
  u.name,
  u.last_seen,
  u.data -> 'images' -> 0 ->> 'normal' as image,
  extensions.st_y(u.location::extensions.geometry) as lat,
  extensions.st_x(u.location::extensions.geometry) as lng
from public.users u
where u.location is not null;
