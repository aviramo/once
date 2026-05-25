-- 2026-05-25 — user decision: a group has no linked permissions. The only
-- group-level role concept is the per-user `group_managers` row (the
-- "manager of this group" promotion shipped in this release). The
-- permissions catalog + the group_permissions mapping (shipped 2026-05-23)
-- are removed wholesale.
--
-- Drop order: group_permissions (FK to permissions) → permissions table →
-- user_has_permission helper. The admin gate stays JWT-based
-- (app_metadata.role='admin'); it never went through these tables, so
-- dropping them does NOT lose admin access.

DROP TABLE IF EXISTS public.group_permissions;
DROP TABLE IF EXISTS public.permissions;
DROP FUNCTION IF EXISTS public.user_has_permission(uuid, text);
