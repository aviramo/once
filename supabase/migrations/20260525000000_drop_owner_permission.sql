-- 2026-05-25 — user retired the owner permission concept (was shipped
-- 2026-05-24 but only used by the now-removed permissions module gate).
-- Drop the rows that fed it; the catalog table itself is dropped by the
-- follow-up `drop_permissions_catalog_entirely` migration.
DELETE FROM public.group_permissions WHERE permission_key = 'owner';
DELETE FROM public.permissions WHERE key = 'owner';
DELETE FROM public.user_groups
  WHERE group_id IN (SELECT id FROM public.groups WHERE name = 'בעלים');
DELETE FROM public.groups WHERE name = 'בעלים';
