import type { Image } from '../stores/userStore'

// Single source of truth for a match/profile card's photo URLs.
//
// These URLs MUST be byte-identical to what MatchCard requests, otherwise
// expo-image's disk-cache key differs and any prefetch is wasted (a
// correctness requirement, not just DRY). MatchCard uses RAW filenames (no
// encodeURI) and passes through anything already containing "://" as-is — so
// this helper does the same. `api.ts`'s publicImageUrl() encodeURI's the
// filename and is therefore NOT usable here.
//
// Consumed by the home sync effect (on-arrival prefetch) and the look-ahead
// warm in api.ts (next 1-2 candidates returned by app_find/app_ignore).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

export function matchImageUrls(
  p: { user_id: string; images?: Image[] | null } | null | undefined,
): string[] {
  if (!p) return []
  return (p.images ?? [])
    .filter(img => !!img.normal)
    .map(img => {
      const n = img.normal!
      return n.includes('://') ? n : `${SUPABASE_URL}/storage/v1/object/public/users/${p.user_id}/normal/${n}`
    })
}
