-- Default-DENY geo gate (product decision, supersedes the earlier
-- backward-compat default).
--
-- Old behaviour: no active/scheduled areas at all => everyone 'available'
-- (so shipping the feature wouldn't brick production before areas existed).
-- The product owner explicitly wants the opposite: the app is usable ONLY
-- where an area actively covers the user. With zero active/scheduled areas,
-- every located user is 'unavailable' (a deliberately gated/closed launch).
--
-- The ONLY non-gated escape hatch is a null location (onboarding / location
-- permission not yet granted) — onboarding & profile setup must work in
-- every location state, per the standing requirement.
create or replace function public.area_state(loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when loc is null
      then jsonb_build_object('state', 'available')
    when exists (
      select 1 from public.areas a
      where a.mode = 'active'
        and extensions.st_dwithin(loc, a.center, a.radius_m)
    )
      then jsonb_build_object('state', 'available')
    when exists (
      select 1 from public.areas a
      where a.mode = 'scheduled' and a.starts_at <= now()
        and extensions.st_dwithin(loc, a.center, a.radius_m)
    )
      then jsonb_build_object('state', 'available')
    when exists (
      select 1 from public.areas a
      where a.mode = 'scheduled'
        and extensions.st_dwithin(loc, a.center, a.radius_m)
    )
      then jsonb_build_object(
        'state', 'not_yet',
        'starts_at', (
          select min(a.starts_at) from public.areas a
          where a.mode = 'scheduled'
            and a.starts_at > now()
            and extensions.st_dwithin(loc, a.center, a.radius_m)
        )
      )
    else jsonb_build_object('state', 'unavailable')
  end
$$;
