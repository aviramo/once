-- Safety cleanup that runs LAST in a bulk push.
--
-- Context: `supabase db push --include-all` on 2026-07-06 was used to bring
-- CLI migration metadata into sync after months of applying migrations via
-- the Management API endpoint outside the CLI flow. Most re-runs are pure
-- CREATE OR REPLACE and thus a no-op, but two migrations in the queue
-- resurrect functionality that was RETIRED later (and whose retirement
-- migrations were already marked applied so they will NOT re-run):
--
--   * 20260523010000_permissions_module.sql — creates public.permissions +
--     public.group_permissions tables and inserts the "בעלים" (Owner) group.
--     Retired 2026-05-25 by 20260525030000_drop_permissions_catalog.sql.
--
--   * 20260519140000_page1_stack.sql (was already marked applied — should
--     not re-run) added a page1.profiles[] deck that we later reverted on
--     2026-05-22. Nothing to clean up here; note left for context.
--
-- This migration therefore idempotently re-asserts the retirement state:
-- both permissions tables gone, the auto-inserted "בעלים" group gone, the
-- user_has_permission helper gone. If none of the above got re-created,
-- every statement is a no-op.

drop table if exists public.group_permissions cascade;
drop table if exists public.permissions cascade;
drop function if exists public.user_has_permission(uuid, text);

-- The "בעלים" group is auto-inserted by permissions_module with ON CONFLICT
-- DO NOTHING. If it was re-created by this bulk push, remove it now. Any
-- existing user_groups membership is cascaded by the FK ON DELETE CASCADE.
delete from public.groups where name = 'בעלים' and id is not null;

-- notify PostgREST just in case anything RPC-shaped changed shape.
notify pgrst, 'reload schema';
