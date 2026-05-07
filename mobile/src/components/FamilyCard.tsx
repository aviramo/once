import { StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { t } from '../i18n'
import type { FamilyData } from '../lib/family'
import { SINGLE, RADIUS } from '../fonts'
import { TEXT_PRIMARY, PRIMARY, PRIMARY_BG } from '../colors'

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
export function familyBaseTitle(data: { hasKids: boolean; count?: number }, self: boolean): string {
  if (!data.hasKids) return t(self ? 'family.summarySelfNoKids' : 'family.summaryNoKids')
  if (data.count === 1) return t(self ? 'family.summarySelfHasOneKid' : 'family.summaryHasOneKid')
  if (data.count != null) {
    const tmpl = t(self ? 'family.summarySelfHasNKids' : 'family.summaryHasNKids')
    return tmpl.replace('{n}', String(data.count))
  }
  return t(self ? 'family.summarySelfHasKids' : 'family.summaryHasKids')
}

export function familyHeaderTitle(
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

// The kids title chip moved to the photo overlay (MatchCard.infoOverlay).
// FamilyCard now renders only the schedule-overlap chip — and only when both
// sides have a schedule and an overlap was computed.
export function FamilyCard({
  overlap,
}: {
  overlap: number
}) {
  const overlapPct = Math.round(overlap * 100)
  const overlapStrong = overlapPct >= 50
  return (
    <View style={styles.wrap}>
      <View style={[styles.chip, overlapStrong && styles.chipStrong]}>
        <Text style={[styles.chipText, overlapStrong && styles.chipTextStrong]}>
          {t('family.overlapLabel').replace('{pct}', String(overlapPct))}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SINGLE,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  chipStrong: { backgroundColor: PRIMARY_BG },
  chipText: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  chipTextStrong: { color: PRIMARY },
})
