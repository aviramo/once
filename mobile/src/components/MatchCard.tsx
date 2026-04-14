import { useMemo } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'
import { t, tg } from '../i18n'
import type { MatchData } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon, BellOnIcon, BellOffIcon } from './Chip'

// Display-only card for non-resting states. Action buttons live in the
// home screen's pinned bottom bar so they share spacing + positioning with
// the HIDDEN/VISIBLE toggle.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!

function toStorageUrl(userId: string, filename: string) {
  if (filename.includes('://')) return filename
  return `${supabaseUrl}/storage/v1/object/public/users/${userId}/normal/${filename}`
}

function resolveImages(m: MatchData): string[] {
  if (m.images) {
    const arr = Array.isArray(m.images)
      ? m.images
      : (() => {
          try { return JSON.parse(m.images as string) } catch { return null }
        })()
    if (Array.isArray(arr) && arr.length > 0) return arr.map(f => toStorageUrl(m.user_id, f))
  }
  if (m.image) {
    return [m.image.includes('://') ? m.image : `${supabaseUrl}/storage/v1/object/public/users/${m.image}`]
  }
  return []
}

function formatDistance(m: number | null | undefined, units?: string | null): string {
  if (m == null || isNaN(m)) return ''
  if (m < 250) return t('home.distanceHere')
  if (units === 'imperial') {
    const miles = m / 1609.344
    if (miles < 0.1) return t('home.distanceHere')
    if (miles < 10) return `${miles.toFixed(1)}${t('settings.miles')}`
    return `${Math.round(miles).toLocaleString()}${t('settings.miles')}`
  }
  if (m < 1000) return `${Math.round(m)}${t('settings.meter')}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()}${t('settings.km')}`
  return `${km.toFixed(1)}${t('settings.km')}`
}

function formatLocatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('match.justNow')
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('match.minsAgo')}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('match.hrsAgo')}`
  return `${Math.floor(diff / 86400)}${t('match.daysAgo')}`
}

const isDistanceNear = (m: number | null | undefined) =>
  m != null && !isNaN(m) && m < 1000
const isTimeRecent = (iso: string | null | undefined) =>
  !!iso && (Date.now() - new Date(iso).getTime()) / 1000 < 600

// ── Icons ──────────────────────────────────────────────────────────────────

function BabyIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h3l3 9h8l2-6H8" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={9} cy={19} r={1.5} stroke={color} strokeWidth={1.5} />
      <Circle cx={17} cy={19} r={1.5} stroke={color} strokeWidth={1.5} />
    </Svg>
  )
}

function KidsCheckIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function KidsXIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function MatchCard({
  match,
  userIsMale,
  bottomInset = 0,
  hideTime = false,
}: {
  match: MatchData
  userIsMale: boolean | null
  // Extra padding at the bottom of the inner ScrollView so the last row of
  // content isn't hidden behind the home screen's floating action bar.
  bottomInset?: number
  // Suppress the last-seen chip — the CHAT state has no use for it since
  // the two users are already in active conversation.
  hideTime?: boolean
}) {
  const imageUrls = useMemo(() => resolveImages(match), [match])
  const timeIso = match.last_seen ?? match.located_at
  const timeStr = hideTime ? '' : formatLocatedAt(timeIso)
  const distStr = formatDistance(match.distance, match.units)
  const cleanTitle = match.title.replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  const age = match.age ?? (() => {
    const mm = match.title.match(/,\s*(\d+)\s*$/)
    return mm ? Number(mm[1]) : null
  })()
  const displayTitle = age != null ? `${cleanTitle}, ${age}` : cleanTitle

  const distGreen = isDistanceNear(match.distance)
  const timeGreen = isTimeRecent(timeIso)
  const hasChips = !!distStr || !!timeStr || match.subscribed != null

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {imageUrls.length > 0 && (
          <Image source={{ uri: imageUrls[0] }} style={styles.photo} resizeMode="cover" />
        )}

        <Text style={styles.name}>{displayTitle}</Text>

        {hasChips && (
          <View style={styles.chips}>
            {distStr ? (
              <Chip
                renderIcon={c => <PinIcon color={c} />}
                text={distStr}
                tone={distGreen ? 'positive' : 'neutral'}
              />
            ) : null}
            {timeStr ? (
              <Chip
                renderIcon={c => <ClockIcon color={c} />}
                text={timeStr}
                tone={timeGreen ? 'positive' : 'neutral'}
              />
            ) : null}
            {match.subscribed != null ? (
              <Chip
                renderIcon={c => match.subscribed ? <BellOnIcon color={c} /> : <BellOffIcon color={c} />}
                text={match.subscribed ? tg('home.notifOn', match.is_male) : tg('home.notifOff', match.is_male)}
                tone={match.subscribed ? 'positive' : 'negative'}
              />
            ) : null}
          </View>
        )}

        {match.message ? (
          <Text style={styles.message}>{match.message}</Text>
        ) : null}

        {imageUrls.length > 1 && (
          <View style={styles.extraPhotos}>
            {imageUrls.slice(1).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.extraPhoto} resizeMode="cover" />
            ))}
          </View>
        )}

        {match.is_for_kids != null && (
          <View style={styles.kidsRow}>
            <View style={styles.kidsLabel}>
              <BabyIcon color="#111" />
              <Text style={styles.kidsLabelText}>{tg('settings.kidsLabel', userIsMale)}</Text>
            </View>
            {match.is_for_kids
              ? <KidsCheckIcon color="#15803d" />
              : <KidsXIcon color="#c53030" />}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  // overflow:hidden + matching border radius on the top corners clips the
  // photo so it reads as flush against the card's rounded top edge. Matches
  // the outer matchCard wrapper in home.tsx.
  wrap: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  // Fixed 3:4 portrait so the photo has a predictable size and anchors flush
  // to the card's top edge. flex:1 + minHeight in a non-flex parent can land
  // on inconsistent heights across platforms — an aspectRatio is stable.
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    marginTop: 16,
    marginHorizontal: 20,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.75)',
    marginTop: 18,
    marginHorizontal: 20,
    textAlign: 'center',
  },
  extraPhotos: {
    marginTop: 20,
    backgroundColor: '#fff',
    gap: 2,
  },
  extraPhoto: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  kidsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kidsLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
})
