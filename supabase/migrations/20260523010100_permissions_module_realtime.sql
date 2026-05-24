-- Add the new permissions tables to the realtime publication so the web
-- admin's RealtimeRefresh component receives postgres_changes events when
-- assignments flip and the page re-fetches.
alter publication supabase_realtime add table public.group_permissions;
alter publication supabase_realtime add table public.permissions;
