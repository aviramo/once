-- 3-state area mode (replaces the enabled boolean as the source of truth):
--   active    = live now, regardless of starts_at (manual override)
--   scheduled = becomes live when starts_at is reached (until then: not_yet)
--   disabled  = ignored entirely
--
-- `enabled` is kept (mirrored: enabled = mode <> 'disabled') ONLY so the
-- currently-deployed web admin (which selects areas_list.enabled) keeps
-- working until the mode-aware web build deploys. area_state/area_available
-- read `mode` exclusively. See BACKWARD_COMPAT.md for the contract step.

alter table public.areas
  add column if not exists mode text not null default 'scheduled'
  check (mode in ('active','scheduled','disabled'));

update public.areas set mode = case when enabled then 'scheduled' else 'disabled' end;

create index if not exists areas_mode_idx on public.areas (mode) where mode <> 'disabled';

-- 3-way availability, now driven by mode.
create or replace function public.area_state(loc extensions.geography)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.areas where mode in ('active','scheduled'))
      then jsonb_build_object('state', 'available')
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

-- area_available is unchanged in body (delegates to area_state) — recreated
-- only to keep it adjacent to the new definition for clarity.
create or replace function public.area_available(loc extensions.geography)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.area_state(loc)->>'state') = 'available'
$$;

-- Read model: expose `mode` (new source of truth) and keep `enabled`
-- (transitional mirror) so neither the old nor the new web build breaks.
-- DROP first: CREATE OR REPLACE VIEW can't reorder/rename existing columns.
drop view if exists public.areas_list;
create view public.areas_list with (security_invoker = on) as
select
  a.id,
  a.label,
  extensions.st_y(a.center::extensions.geometry) as lat,
  extensions.st_x(a.center::extensions.geometry) as lng,
  a.radius_m,
  a.starts_at,
  a.mode,
  (a.mode <> 'disabled') as enabled,
  a.created_at
from public.areas a;
