import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { PullScrollView } from './HomeCard'
import { Text } from './AppText'
import Svg, { Path, Circle } from 'react-native-svg'
import { t, tg } from '../i18n'
import type { MatchData } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon, BellOnIcon, BellOffIcon } from './Chip'
import { SINGLE, DOUBLE } from '../fonts'
import { TEXT, WHITE, GREEN, RED } from '../colors'

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
    if (miles < 10) return `${miles.toFixed(1)} ${t('settings.miles')}`
    return `${Math.round(miles).toLocaleString()} ${t('settings.miles')}`
  }
  if (m < 1000) return `${Math.round(m)} ${t('settings.meter')}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()} ${t('settings.km')}`
  return `${km.toFixed(1)} ${t('settings.km')}`
}

function formatLocatedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('match.justNow')
  if (diff < 3600) return t('match.minsAgo').replace('{n}', String(Math.floor(diff / 60)))
  if (diff < 86400) return t('match.hrsAgo').replace('{n}', String(Math.floor(diff / 3600)))
  return t('match.daysAgo').replace('{n}', String(Math.floor(diff / 86400)))
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
  bottomInset?: number
  hideTime?: boolean
}) {
  const imageUrls = useMemo(() => resolveImages(match), [match])
  // Measure both the card's full interior and the name+chips block. Sizing
  // the photo from the real card height (not windowHeight − estimates) makes
  // the layout robust to safe-area insets, header height, and Android nav
  // bars. bottomInset is subtracted because the floating action bar covers
  // that slice of the card visually.
  const [cardH, setCardH] = useState(0)
  const [headerBlockH, setHeaderBlockH] = useState(0)
  const photoHeight = Math.max(280, cardH - headerBlockH - bottomInset)
  // Both measurements feed photoHeight, so we have to wait for both — if only
  // cardH is known and headerBlockH is still 0, the photo paints at almost
  // the full card height and then visibly shrinks once the header block
  // measures. Render the content normally so onLayout fires for both nodes,
  // but keep the wrap invisible until measurements settle.
  const ready = cardH > 0 && headerBlockH > 0
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
  const hasChips = !!distStr || !!timeStr || match.push_enabled != null
  const endsWithPhoto = imageUrls.length > 1 && match.is_for_kids == null

  return (
    <View style={[styles.wrap, !ready && styles.hidden]} onLayout={e => setCardH(e.nativeEvent.layout.height)}>
      <PullScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + (endsWithPhoto ? 0 : DOUBLE) }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {imageUrls.length > 0 && (
          <Image source={imageUrls[0]} style={[styles.photo, { height: photoHeight }]} contentFit="cover" cachePolicy="disk" />
        )}

        <View onLayout={e => setHeaderBlockH(e.nativeEvent.layout.height)}>
          <Text style={[styles.name, !hasChips && styles.nameNoChips]}>{displayTitle}</Text>

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
              {match.push_enabled != null ? (
                <Chip
                  renderIcon={c => match.push_enabled ? <BellOnIcon color={c} /> : <BellOffIcon color={c} />}
                  text={match.push_enabled ? tg('home.notifOn', match.is_male) : tg('home.notifOff', match.is_male)}
                  tone={match.push_enabled ? 'positive' : 'negative'}
                />
              ) : null}
            </View>
          )}
        </View>

        {match.bio ? (
          <Text style={styles.message}>{match.bio}</Text>
        ) : null}

        {imageUrls.length > 1 && (
          <View style={styles.extraPhotos}>
            {imageUrls.slice(1).map((url, i) => (
              <Image key={i} source={url} style={styles.extraPhoto} contentFit="cover" cachePolicy="disk" />
            ))}
          </View>
        )}

        {match.is_for_kids != null && (
          <View style={styles.kidsRow}>
            <View style={styles.kidsLabel}>
              <BabyIcon color={TEXT} />
              <Text style={styles.kidsLabelText}>{tg('settings.kidsLabel', match.is_male)}</Text>
            </View>
            <Text style={[styles.kidsValue, { color: match.is_for_kids ? GREEN : RED }]}>
              {match.is_for_kids ? t('settings.kidsYes') : t('settings.kidsNo')}
            </Text>
          </View>
        )}
      </PullScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  // Card chrome (rounding + clipping) lives on the outer matchCard wrapper
  // in home.tsx now — this inner wrap only needs to stretch.
  wrap: {
    flex: 1,
  },
  // Applied during the brief window between mount and the first onLayout pass
  // that resolves both cardH and headerBlockH. Layout still flows so onLayout
  // fires; only the visual is suppressed to hide the size correction.
  hidden: {
    opacity: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 0,
  },
  // Height is set inline so the photo fills the viewport above the name/chips
  // — chips become the last row visible before the user scrolls.
  photo: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: TEXT,
    marginTop: DOUBLE,
    marginHorizontal: SINGLE,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  nameNoChips: {
    marginBottom: 28,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SINGLE,
    marginTop: SINGLE,
    marginBottom: DOUBLE,
    marginHorizontal: SINGLE,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    marginTop: DOUBLE,
    marginHorizontal: SINGLE,
    textAlign: 'center',
  },
  extraPhotos: {
    marginTop: 20,
    backgroundColor: WHITE,
    gap: 2,
  },
  extraPhoto: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: DOUBLE,
    marginHorizontal: SINGLE,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: DOUBLE,
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
    color: TEXT,
  },
  kidsValue: {
    fontSize: 14,
    fontWeight: '600',
  },
})
