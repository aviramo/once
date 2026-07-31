// Bio cap + normalization. Single source of truth shared by the onboarding bio
// step and the inline bio editor on the profile preview (MatchCard). Keep these
// in one place so the rule can't drift between surfaces.
//
// THERE IS NO MINIMUM (user directive 2026-07-31). A bio is optional: what
// makes a profile built is MIN_PHOTOS photos and nothing else (lib/photos.ts),
// so onboarding finishes with the field empty and the inline editor commits a
// cleared bio as null. The old BIO_MIN (20) and the 'bio.min' string that
// announced it are both deleted — do not reintroduce either.

export const BIO_MAX = 150

/** Trim surrounding whitespace and remove blank lines: any run of newlines
 * (with only whitespace between them) collapses to a single line break, so a
 * saved bio never carries empty lines. Applied wherever a bio is committed so
 * what we store and what we render stay consistent regardless of entry point. */
export function normalizeBio(s: string): string {
  return s.trim().replace(/[ \t]*\n\s*/g, '\n')
}
