// The server stores `Profile.title` as a single combined string
// `${name}, ${age}` (make_profile: `name || ', ' || extract(year from
// age(now(), birth_date))`). The UI surfaces the two parts as two separate
// on-photo chips sharing one line, so this is the single source of truth for
// splitting the combined string.
// Keep both halves derived here; do not re-inline the regex at call sites.

export function nameFromTitle(title: string | null | undefined): string {
  return (title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
}

export function ageFromTitle(title: string | null | undefined): string {
  const m = (title ?? '').match(/(\d+)\s*$/)
  return m ? m[1] : ''
}
