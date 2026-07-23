import { t, tg, lang } from '../i18n'
import { familyScheduleOverlap, familyWeekendKidStatus, type FamilyData } from '../lib/family'

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
  if (data.count != null) {
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

// Shared "kids" chip text for any card that surfaces a Profile's family
// alongside live distance/time chips.
//
// The facts — count + ages, the isForKids preference, the kid-free schedule
// overlap, the upcoming-weekend status — are joined with plain commas into one
// chip label. Each is a phrase that STANDS ALONE in the i18n table (no leading
// connector, no leading comma), because the comma is the seam `phraseWrap` in
// Chip.tsx breaks the label at when the narrow chips column can't hold it on
// one line. Sentence-glued text ("Has 2 kids (7, -) and doesn't want more…")
// is what used to break mid-phrase over five ragged lines.
//   - `family`: the rendered profile's family (snapshot or own data).
//   - `isForKids`: explicit override; pass `undefined` to fall back to
//     family.isForKids (the remote-snapshot path).
//   - `self`: first-person phrasing for the own-profile preview.
//   - `viewerFamily`: viewer's family for the schedule-overlap part; pass
//     `null`/`undefined` to skip it (own preview / no kids).
//   - `isMale`: the rendered profile's gender; used to gender the weekend
//     status in Hebrew ("פנוי"/"פנויה", "לא פנוי"/"לא פנויה"). Null/
//     undefined falls back to masculine, matching `tg`'s convention.
export function buildFamilyChipText(
  family: FamilyData | null | undefined,
  isForKids: boolean | null | undefined,
  self: boolean,
  viewerFamily: FamilyData | null | undefined,
  isMale: boolean | null | undefined,
): string {
  if (!family) return ''
  const kids = family.kids ?? []
  const count = family.kids?.length
  const anyAgeSet = kids.some(k => k.age != null)
  const ageStr = anyAgeSet
    ? kids.map(k => (k.age != null ? String(k.age) : '-')).join(', ')
    : null
  const base = familyBaseTitle({ hasKids: family.hasKids, count }, self)
  const parts = [ageStr ? `${base} (${ageStr})` : base]

  const effIsForKids = isForKids !== undefined ? isForKids : (family.isForKids ?? null)
  if (effIsForKids != null) parts.push(familyPrefLabel(family.hasKids, effIsForKids, self))

  const overlap =
    viewerFamily?.hasKids && family.hasKids
      ? familyScheduleOverlap(viewerFamily.schedule, family.schedule)
      : null
  if (overlap != null) parts.push(t('family.overlapChip').replace('{pct}', String(Math.round(overlap * 100))))

  const weekend = familyWeekendKidStatus(family.schedule, lang)
  if (weekend) parts.push(tg(weekend === 'free' ? 'family.summaryFreeWeekend' : 'family.summaryWithKidsWeekend', isMale))

  return parts.join(', ')
}
