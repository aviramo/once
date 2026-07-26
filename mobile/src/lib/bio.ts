// Bio length constraints + normalization. Single source of truth shared by
// the onboarding bio step and the inline bio editor on the profile preview
// (MatchCard). Keep these in one place so the min/max can't drift between
// surfaces.

export const BIO_MIN = 20
export const BIO_MAX = 150

/** Trim surrounding whitespace and remove blank lines: any run of newlines
 * (with only whitespace between them) collapses to a single line break, so a
 * saved bio never carries empty lines. Applied wherever a bio is committed so
 * what we store and what we render stay consistent regardless of entry point. */
export function normalizeBio(s: string): string {
  return s.trim().replace(/[ \t]*\n\s*/g, '\n')
}
