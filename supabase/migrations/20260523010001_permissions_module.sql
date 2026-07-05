-- ============================================================================
-- Permissions module: a small catalog of permission keys + a many-to-many
-- linking each group to the permissions it grants.
--
-- DESIGN:
--   * public.permissions(key text PK) — code-coupled catalog. New permission
--     keys are added through migrations (since anything checking a key needs
--     code changes anyway). There is NO admin UI to create permissions ad-hoc.
--   * public.group_permissions(group_id, permission_key) — many-to-many.
--     Admins assign / unassign permissions to a group from the group detail
--     page.
--   * Display labels live in the web i18n dictionary keyed by permission key
--     (fallback: show the raw key). No label column in the DB.
--
-- SEED (intent of this migration's introducer):
--   * admin permission attached to the existing "מנהלים" group (the deployed
--     admin gate still uses app_metadata.role='admin' in JWT; this only
--     duplicates the concept into the group-permissions model so a future
--     migration can switch the gate to read from here).
--   * Create the new "בעלים" group, attach the owner permission to it.
--
-- RLS: enabled, no policies — service-role only (edge + web admin), identical
-- pattern to areas / groups / reports.
--
-- BACKWARD COMPAT: purely additive. Mobile reads neither table; the edge
-- functions don't read them yet. No BACKWARD_COMPAT.md entry.
-- ============================================================================

create table if not exists public.permissions (
  key        text primary key,
  created_at timestamptz not null default now()
);
alter table public.permissions enable row level security;

create table if not exists public.group_permissions (
  group_id        uuid not null references public.groups(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (group_id, permission_key)
);
alter table public.group_permissions enable row level security;

create index if not exists group_permissions_perm_idx
  on public.group_permissions(permission_key);

-- Seed catalog.
insert into public.permissions(key) values ('admin'), ('owner')
on conflict (key) do nothing;

-- Attach 'admin' to the existing מנהלים group.
insert into public.group_permissions(group_id, permission_key)
select id, 'admin' from public.groups where name = 'מנהלים'
on conflict do nothing;

-- Create the בעלים group (if missing) and attach 'owner'.
insert into public.groups(name, enabled) values ('בעלים', true)
on conflict (name) do nothing;

insert into public.group_permissions(group_id, permission_key)
select id, 'owner' from public.groups where name = 'בעלים'
on conflict do nothing;
