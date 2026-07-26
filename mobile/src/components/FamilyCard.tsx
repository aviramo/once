import { t, tg, lang } from '../i18n'
import { familyWeekendKidStatus, type FamilyData } from '../lib/family'
import type { ChipSegment } from './Chip'

// Lead phrase: the count is folded into the title so it reads as one fact
// ("has 2 kids"). The "want (more) kids" preference is a SEPARATE phrase
// (familyPrefLabel) — self-preview supplies it from form state while editing,
// remote views resolve it from the snapshot's fam.isForKids.
//
// `isForKids` semantics: whether the user wants their OWN (more) kids —
// independent of partner preferences.
//   hasKids   + isForKids=true   → "wants more"
//   hasKids   + isForKids=false  → "doesn't want more"
//   !hasKids  + isForKids=true   → "wants kids"
//   !hasKids  + isForKids=false  → "doesn't want kids"
function familyBaseTitle(data: { hasKids: boolean; count?: number }, self: boolean): string {
  if (!data.hasKids) return t(self ? 'family.summarySelfNoKids' : 'family.summaryNoKids')
  if (data.count === 1) return t(self ? 'family.summarySelfHasOneKid' : 'family.summaryHasOneKid')
  // A count > 1 folds the number into the phrase ("has 3 kids"). Count 0 (the
  // "has kids" toggle is on but no kid chips added yet) or unknown falls through
  // to the plain "has kids" — never "has 0 kids".
  if (data.count != null && data.count > 1) {
    const tmpl = t(self ? 'family.summarySelfHasNKids' : 'family.summaryHasNKids')
    return tmpl.replace('{n}', String(data.count))
  }
  return t(self ? 'family.summarySelfHasKids' : 'family.summaryHasKids')
}

// "wants more" / "doesn't want kids" — the preference on its own, with no
// connector, so it can stand as its own phrase.
function familyPrefLabel(hasKids: boolean, isForKids: boolean, self: boolean): string {
  const key = self
    ? (hasKids
        ? (isForKids ? 'family.selfWantsMore' : 'family.selfDoesntWantMore')
        : (isForKids ? 'family.selfWantsKids' : 'family.selfDoesntWantKids'))
    : (hasKids
        ? (isForKids ? 'family.wantsMore' : 'family.doesntWantMore')
        : (isForKids ? 'family.wantsKids' : 'family.doesntWantKids'))
  return t(key)
}

// Shared "kids" chip content for any card that surfaces a Profile's family
// alongside live distance/time chips. Returns an interleaved list of text runs
// and mini-chips (Chip renders them as a wrapping row):
//
//   "יש לי 3 ילדים"  [0] [5] [?]  "ורוצה עוד"  [לא פנויה בסופ״ש הקרוב]
//
//   - the count lives in the lead phrase ("has 3 kids"); each kid's AGE is its
//     own mini-chip in kids order, "?" for an age not set yet (user directive
//     2026-07-26 — replaces the old parenthetical "(0, 5, -)" text);
//   - the isForKids preference is a text run glued to the lead with a vav
//     connector ("ורוצה עוד"), no comma;
//   - the upcoming-weekend status is its own mini-chip.
//
// Args:
//   - `family`: the rendered profile's family (snapshot or own data).
//   - `isForKids`: explicit override; pass `undefined` to fall back to
//     family.isForKids (the remote-snapshot path).
//   - `self`: first-person phrasing for the own-profile preview.
//   - `isMale`: the rendered profile's gender; used to gender the weekend
//     status in Hebrew ("פנוי"/"פנויה", "לא פנוי"/"לא פנויה"). Null/
//     undefined falls back to masculine, matching `tg`'s convention.
export function buildFamilySegments(
  family: FamilyData | null | undefined,
  isForKids: boolean | null | undefined,
  self: boolean,
  isMale: boolean | null | undefined,
): ChipSegment[] {
  if (!family) return []
  const kids = family.kids ?? []
  const count = kids.length
  const segments: ChipSegment[] = [{ text: familyBaseTitle({ hasKids: family.hasKids, count }, self) }]

  // Ages as one dense cluster of mini-chips, in kids order — only when at least
  // one age is known, so a profile with no ages set stays clean instead of a row
  // of "?" pills. "?" stands in for an age not picked yet.
  if (family.hasKids && kids.some(k => k.age != null)) {
    segments.push({ badges: kids.map(k => (k.age != null ? String(k.age) : '?')), ltr: true })
  }

  const effIsForKids = isForKids !== undefined ? isForKids : (family.isForKids ?? null)
  if (effIsForKids != null) {
    // Glued to the lead with a vav connector ("ורוצה עוד"), no comma.
    segments.push({ text: t('family.prefConnector') + familyPrefLabel(family.hasKids, effIsForKids, self) })
  }

  const weekend = familyWeekendKidStatus(family.schedule, lang)
  if (weekend) {
    // Weekend status on its OWN line (user directive 2026-07-26): a forced break
    // before the bold status run, so "busy weekend" never trails the kids
    // sentence but always starts a fresh line under it.
    segments.push({ br: true })
    segments.push({ text: tg(weekend === 'free' ? 'family.summaryFreeWeekend' : 'family.summaryWithKidsWeekend', isMale), bold: true })
  }

  return segments
}
