// Single source of truth for a user's public profile-photo URL. The admin
// dashboard card, the user detail page and the live users map all build the
// exact same Storage path — this is that path, defined once.
export function userImageUrl(
  userId: string,
  filename: string | null | undefined,
): string | null {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/users/${userId}/normal/${filename}`;
}
