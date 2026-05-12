// Family/kids helpers shared between the settings popup that edits the data
// and the MatchCard summary card that renders it.
//
// Storage conventions:
//   - schedule.weeks[w][d] is indexed by **absolute weekday**: 0=Sunday,
//     1=Monday, ..., 6=Saturday. This is independent of the user's locale
//     or "first day of week" setting; that setting only rotates how cells
//     appear in the picker, not what each index means.
//   - schedule.anchor is the ISO date (YYYY-MM-DD) of the SUNDAY at the
//     start of week 0. Captured at save time so the multi-week rotation
//     stays anchored to the calendar across days.

type FamilySchedule = {
  weeks: boolean[][]
  anchor?: string
}

// One kid entry. `age` is optional — a chip added with no age picked yet
// remains an `{}` and is still counted in the kids list.
export type FamilyKid = {
  age?: number
}

export type FamilyData = {
  hasKids: boolean
  kids?: FamilyKid[]
  schedule?: FamilySchedule
  /** Whether the user wants their own (more) kids. Was a top-level
   * `is_for_kids` column; now lives inside family so all kids-related
   * state ships in one blob. */
  isForKids?: boolean | null
}

export const FAMILY_MAX_WEEKS = 4
export const FAMILY_MAX_KIDS = 12

export function familyEmptyWeek(): boolean[] {
  return [false, false, false, false, false, false, false]
}

export function familyEqual(a: FamilyData | null, b: FamilyData | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a.hasKids !== b.hasKids) return false
  if ((a.isForKids ?? null) !== (b.isForKids ?? null)) return false
  if (JSON.stringify(a.kids ?? null) !== JSON.stringify(b.kids ?? null)) return false
  // Compare schedule structurally except for anchor — anchor is rebuilt at
  // save time and we don't want to flag the form dirty just for that.
  const sa = a.schedule
  const sb = b.schedule
  const aWeeks = sa ? JSON.stringify(sa.weeks) : null
  const bWeeks = sb ? JSON.stringify(sb.weeks) : null
  if (aWeeks !== bWeeks) return false
  return true
}

export function familyHasAnyDayMarked(weeks: boolean[][] | undefined | null): boolean {
  if (!weeks) return false
  for (const w of weeks) if (w.some(d => d)) return true
  return false
}

// Weekend definition by language. Hebrew/Arabic locales: Friday + Saturday.
// Everywhere else: Saturday + Sunday. Returned as absolute weekday indices
// (0=Sun..6=Sat). The "anchor" day is the later of the two — used to locate
// "this weekend" in the calendar.
function weekendAnchor(lang: string): number {
  if (lang === 'he' || lang === 'ar') return 6 // Saturday
  return 0 // Sunday
}

export function weekendDays(lang: string): number[] {
  const w2 = weekendAnchor(lang)
  const w1 = (w2 + 6) % 7
  return [w1, w2]
}

// Default first day of week — derived directly from the weekend anchor so the
// two weekend days always cluster at the end of the row. For he/ar (Sat
// anchor) → Sunday-first; for everyone else (Sun anchor) → Monday-first. We
// deliberately ignore the OS firstWeekday here: the US locale defaults to
// Sunday-first, but that splits Sat+Sun across the row in this UI.
export function defaultWeekStart(lang: string): number {
  return (weekendAnchor(lang) + 1) % 7
}

// Local midnight of the Sunday that contains `today` (the absolute Sunday,
// regardless of weekStart preference). Used as the schedule anchor.
export function sundayOfWeek(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
}

// Local midnight of the start of `today`'s displayed week, given which day
// of week the user wants weeks to begin on.
export function startOfDisplayedWeek(today: Date, weekStart: number): Date {
  const dow = today.getDay() // 0..6 (Sunday..Saturday)
  const offset = ((dow - weekStart) % 7 + 7) % 7
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
}

// Anchor-aware kid-free overlap between two schedules, returned as 0..1.
// Mirrors the server-side `schedule_overlap` SQL function: aligns by each
// schedule's anchor so phase-shifted schedules score against the real
// calendar, not naive week-0-vs-week-0. Returns null when either side has
// no usable schedule (caller treats that as "no chip to show").
export function familyScheduleOverlap(
  scheduleA: FamilySchedule | undefined | null,
  scheduleB: FamilySchedule | undefined | null,
): number | null {
  const wa = scheduleA?.weeks?.length ?? 0
  const wb = scheduleB?.weeks?.length ?? 0
  if (wa === 0 || wb === 0) return null
  const today = new Date()
  const defaultAncMs = sundayOfWeek(today).getTime()
  const ancAMs = scheduleA!.anchor ? parseISODate(scheduleA!.anchor).getTime() : defaultAncMs
  const ancBMs = scheduleB!.anchor ? parseISODate(scheduleB!.anchor).getTime() : defaultAncMs
  const ca = wa * 7
  const cb = wb * 7
  const cycle = (ca * cb) / familyGcd(ca, cb)
  const refMs = today.getTime()
  const shiftA = familyMod(Math.floor((refMs - ancAMs) / 86400000), ca)
  const shiftB = familyMod(Math.floor((refMs - ancBMs) / 86400000), cb)
  let bothFree = 0
  for (let i = 0; i < cycle; i++) {
    const ai = (shiftA + i) % ca
    const bi = (shiftB + i) % cb
    const aWith = !!scheduleA!.weeks[Math.floor(ai / 7)]?.[ai % 7]
    const bWith = !!scheduleB!.weeks[Math.floor(bi / 7)]?.[bi % 7]
    if (!aWith && !bWith) bothFree++
  }
  return bothFree / cycle
}

function familyGcd(a: number, b: number): number {
  while (b !== 0) { const t = b; b = a % b; a = t }
  return a
}
function familyMod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(n => parseInt(n, 10))
  if (!y || !m || !d) return new Date(NaN)
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
