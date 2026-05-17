-- Facet counts for the web-admin user filters. One round trip returns the
-- global user distribution per page1 state, per page2 state, and per role id,
-- plus the total. The dashboard uses these to (a) show "(n)" next to every
-- filter option and (b) order the options by count descending.
--
-- Global (not contextual to the current search/other filters) on purpose:
-- a stable, predictable distribution of the whole base. Admin-only: SECURITY
-- DEFINER + EXECUTE revoked from anon/authenticated (called via the service
-- role from the admin dashboard, same pattern as app_admin_reset).
create or replace function public.admin_user_facet_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.users),
    'roles_none', (
      select count(*) from public.users u
      where not exists (
        select 1 from public.user_roles ur where ur.user_id = u.user_id
      )
    ),
    'p1', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page1'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page1'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'p2', coalesce((
      select jsonb_object_agg(st, c)
      from (
        select u.relations->'page2'->>'state' as st, count(*) c
        from public.users u
        where u.relations->'page2'->>'state' is not null
        group by 1
      ) q
    ), '{}'::jsonb),
    'roles', coalesce((
      select jsonb_object_agg(role_id::text, c)
      from (
        select ur.role_id, count(*) c
        from public.user_roles ur
        group by ur.role_id
      ) q
    ), '{}'::jsonb)
  )
$$;

revoke all on function public.admin_user_facet_counts() from public, anon, authenticated;
