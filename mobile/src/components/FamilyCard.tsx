import { t } from '../i18n'
import { familyScheduleOverlap, type FamilyData } from '../lib/family'

// Header line: count is folded into the title so the card reads as one
// phrase. When `isForKids` is non-null, the user's "want (more) kids"
// preference is appended. Self-preview supplies it from form state while
// editing; remote views resolve it from the snapshot's fam.isForKids.
//
// `isForKids` semantics: whether the user wants their OWN (more) kids —
// independent of partner preferences.
//   hasKids   + isForKids=true   → "…, wants more"
//   hasKids   + isForKids=false  → "…, doesn't want more"
//   !hasKids  + isForKids=true   → "…, wants kids"
//   !hasKids  + isForKids=false  → "…, doesn't want kids"
function familyBaseTitle(data: { hasKids: boolean; count?: number }, self: boolean): string {
  if (!data.hasKids) return t(self ? 'family.summarySelfNoKids' : 'family.summaryNoKids')
  if (data.count === 1) return t(self ? 'family.summarySelfHasOneKid' : 'family.summaryHasOneKid')
  if (data.count != null) {
    const tmpl = t(self ? 'family.summarySelfHasNKids' : 'family.summaryHasNKids')
    return tmpl.replace('{n}', String(data.count))
  }
  return t(self ? 'family.summarySelfHasKids' : 'family.summaryHasKids')
}

function familyHeaderTitle(
  data: FamilyData,
  count: number | undefined,
  ageStr: string | null,
  isForKids: boolean | null | undefined,
  self: boolean,
): string {
  const base = familyBaseTitle({ hasKids: data.hasKids, count }, self)
  const withAges = ageStr ? `${base} (${ageStr})` : base
  if (isForKids == null) return withAges
  const prefKey = self
    ? (data.hasKids
        ? (isForKids ? 'family.selfWantsMore' : 'family.selfDoesntWantMore')
        : (isForKids ? 'family.selfWantsKids' : 'family.selfDoesntWantKids'))
    : (data.hasKids
        ? (isForKids ? 'family.wantsMore' : 'family.doesntWantMore')
        : (isForKids ? 'family.wantsKids' : 'family.doesntWantKids'))
  return `${withAges}${t('family.prefSeparator')}${t(prefKey)}`
}

// Shared "kids" chip text for any card that surfaces a Profile's family
// alongside live distance/time chips. Folds count + ages + isForKids
// preference into one line via familyHeaderTitle, then appends the
// kid-free schedule overlap percentage when the viewer also has kids.
//   - `family`: the rendered profile's family (snapshot or own data).
//   - `isForKids`: explicit override; pass `undefined` to fall back to
//     family.isForKids (the remote-snapshot path).
//   - `self`: first-person phrasing for the own-profile preview.
//   - `viewerFamily`: viewer's family for schedule-overlap suffix; pass
//     `null`/`undefined` to skip the suffix (own preview / no kids).
export function buildFamilyChipText(
  family: FamilyData | null | undefined,
  isForKids: boolean | null | undefined,
  self: boolean,
  viewerFamily: FamilyData | null | undefined,
): string {
  if (!family) return ''
  const kids = family.kids ?? []
  const count = family.kids?.length
  const anyAgeSet = kids.some(k => k.age != null)
  const ageStr = anyAgeSet
    ? kids.map(k => (k.age != null ? String(k.age) : '-')).join(', ')
    : null
  const effIsForKids = isForKids !== undefined ? isForKids : (family.isForKids ?? null)
  const base = familyHeaderTitle(family, count, ageStr, effIsForKids, self)
  const overlap =
    viewerFamily?.hasKids && family.hasKids
      ? familyScheduleOverlap(viewerFamily.schedule, family.schedule)
      : null
  if (overlap == null) return base
  const pct = Math.round(overlap * 100)
  return base + t('family.overlapChipSuffix').replace('{pct}', String(pct))
}
