-- The staging copy has served its purpose: others()'s live body is now
-- character-identical to it and the two were diffed to 0 differences on live
-- data in both only_available modes immediately before this drop.
--
-- (Applied 2026-08-02 as version 20260801234828. The swap itself is
-- 20260801234734_others_setbased.sql; the previous body is kept verbatim in
-- ROLLBACK_20260801234734_others_setbased.sql.txt.)
DROP FUNCTION IF EXISTS public.others_v2(users, boolean);
