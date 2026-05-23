-- Enable Realtime on `log` so the admin user-detail events feed can update
-- live without polling. Plus a permissive SELECT policy for admins (mirrors
-- the same pattern as users.`admins read all`) so the browser's Realtime
-- subscription actually delivers payloads — service-role server code is
-- unaffected (still bypasses RLS).
ALTER PUBLICATION supabase_realtime ADD TABLE public.log;

CREATE POLICY "admins read all"
  ON public.log
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
