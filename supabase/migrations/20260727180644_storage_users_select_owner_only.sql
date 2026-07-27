-- 2026-07-27 — Stop anon from listing the whole `users` storage bucket.
-- Advisor `public_bucket_allows_listing` (WARN).
--
-- `users_select_public` granted SELECT on every object in the public `users`
-- bucket to `public`, which let any client with the anon key LIST the entire
-- bucket: every user's folder and every filename. Verified before the fix:
-- POST /storage/v1/object/list/users returned the full listing. After: [].
--
-- A public bucket does not need this policy to serve images — the app builds
-- /storage/v1/object/public/users/... URLs (src/lib/api.ts, MatchCard.tsx,
-- src/lib/profileImages.ts) and that route bypasses RLS entirely. Verified
-- after the change: a real public image URL still returns HTTP 200.
--
-- Narrowed to the owner's own folder rather than dropped outright:
-- PhotoEditor.tsx uploads with `x-upsert: true` on the non-public route, and an
-- upsert or delete of an EXISTING object may need the row to be SELECT-visible.
-- Keeping own-folder visibility makes this invisible to the published app.
-- auth.uid() is wrapped in a subquery per the initplan rule.
ALTER POLICY "users_select_public" ON storage.objects
  TO authenticated
  USING (
    bucket_id = 'users'
    AND (string_to_array(name, '/'))[1] = ((SELECT auth.uid()))::text
  );
