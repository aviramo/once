-- Read model for the web admin: areas with center exploded into lat/lng so
-- the dashboard can list/edit them without parsing PostGIS geography blobs.
-- security_invoker = on so the view honours the base table's RLS: service
-- role (web admin / edge) bypasses RLS and sees everything; anon / auth get
-- nothing (areas has RLS enabled with zero policies). Writes still go to the
-- base public.areas table via the service-role client.
create or replace view public.areas_list with (security_invoker = on) as
select
  a.id,
  a.label,
  extensions.st_y(a.center::extensions.geometry) as lat,
  extensions.st_x(a.center::extensions.geometry) as lng,
  a.radius_m,
  a.starts_at,
  a.enabled,
  a.created_at
from public.areas a;
