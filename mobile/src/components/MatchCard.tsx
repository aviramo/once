import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View, ActivityIndicator } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { PullScrollView } from './HomeCard'
import { Text } from './AppText'
import Svg, { Path, Circle } from 'react-native-svg'
import { t, tg } from '../i18n'
import type { Profile } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon, BellOffIcon } from './Chip'
import { SINGLE, DOUBLE } from '../fonts'
import { TEXT_PRIMARY, WHITE, PRIMARY, PRIMARY_BG, DESTRUCTIVE, GRAY_400 } from '../colors'

// Display-only card for non-resting states. Action buttons live in the
// home screen's pinned bottom bar so they share spacing + positioning with
// the HIDDEN/VISIBLE toggle.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!

function toStorageUrl(userId: string, filename: string) {
  return `${supabaseUrl}/storage/v1/object/public/users/${userId}/normal/${filename}`
}

function resolveImages(m: Profile): string[] {
  return (m.images ?? [])
    .filter(img => img.normal)
    .map(img => {
      const n = img.normal!
      return n.includes('://') ? n : toStorageUrl(m.user_id, n)
    })
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

// units not available on Profile — callers may pass from user profile

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

const isOnlineNow = (iso: string | null | undefined) =>
  !!iso && (Date.now() - new Date(iso).getTime()) / 1000 < 60

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

// ── LoadingImage ───────────────────────────────────────────────────────────

const spinnerOverlay = [StyleSheet.absoluteFillObject, { justifyContent: 'center' as const, alignItems: 'center' as const }]

function LoadingImage({
  style,
  onSettle,
  ...props
}: Omit<React.ComponentProps<typeof Image>, 'onLoad' | 'onError' | 'placeholder' | 'placeholderContentFit'> & {
  style?: any
  onSettle?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const settle = useCallback(() => { setLoading(false); onSettle?.() }, [onSettle])
  return (
    <View style={style}>
      <Image {...props} style={StyleSheet.absoluteFill} onLoad={settle} onError={settle} />
      {loading && (
        <View style={spinnerOverlay}>
          <ActivityIndicator size="large" color={WHITE} />
        </View>
      )}
    </View>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function MatchCard({
  match,
  userIsMale,
  units,
  bottomInset = 0,
  hideTime = false,
  onReady,
  topBlock,
  revealPhase,
}: {
  match: Profile
  userIsMale: boolean | null
  units?: string | null
  bottomInset?: number
  hideTime?: boolean
  onReady?: () => void
  topBlock?: React.ReactNode
  /** Drives the staggered reveal of name + chips when wrapped by DiscoveryReveal.
   *  - 'idle': fully hidden (still mounted, awaiting reveal)
   *  - 'reveal': animate in (name first, chips +100ms)
   *  - 'done' / undefined: fully visible (default behavior) */
  revealPhase?: 'idle' | 'reveal' | 'done'
}) {
  // Stabilise imageUrls against profile-ref churn from periodic Realtime
  // updates (every-minute location refresh recreates page1.profile, even
  // when image filenames are identical). Memo on the joined filename list
  // so the underlying Image component sees the same source value.
  const imageKey = useMemo(
    () => (match.images ?? []).map(i => i.normal ?? '').filter(Boolean).join('|'),
    [match.images],
  )
  const imageUrls = useMemo(() => resolveImages(match), [match.user_id, imageKey])
  const loadedCount = useRef(0)
  useEffect(() => { loadedCount.current = 0 }, [match.user_id])
  useEffect(() => { if (imageUrls.length === 0) onReady?.() }, [imageUrls.length])
  const onImageSettle = useCallback(() => {
    loadedCount.current += 1
    if (loadedCount.current >= imageUrls.length) onReady?.()
  }, [imageUrls.length, onReady])
  const [cardH, setCardH] = useState(0)
  const photoHeight = Math.max(280, cardH - bottomInset)
  const ready = cardH > 0
  const timeIso = match.last_seen
  const timeStr = hideTime ? '' : formatLocatedAt(timeIso)
  const distStr = formatDistance(match.distance, units)
  const displayTitle = match.title

  const distGreen = isDistanceNear(match.distance)
  const endsWithPhoto = imageUrls.length > 1 && match.is_for_kids == null
  const hasTopBlock = !!topBlock
  const [topBlockHeight, setTopBlockHeight] = useState(0)
  // If the card mounts already with a topBlock (cold start), start expanded
  // so it shows in place without animation. Otherwise start collapsed so the
  // watching → waiting transition can slide in from above.
  const slideAnim = useSharedValue(hasTopBlock ? 1 : 0)
  const animatedRef = useRef(false)
  const wasAbsentRef = useRef(false)
  useEffect(() => {
    if (!hasTopBlock) {
      wasAbsentRef.current = true
      animatedRef.current = false
      slideAnim.value = 0
      if (topBlockHeight !== 0) setTopBlockHeight(0)
      return
    }
    // Cold start with topBlock present (new screen, not a transition): show
    // it in place without animation.
    if (!wasAbsentRef.current) {
      slideAnim.value = 1
      return
    }
    // watching → waiting transition: photo stays put, timer slides in from
    // above using marginTop animation on the topBlock wrapper.
    if (animatedRef.current || topBlockHeight === 0) return
    animatedRef.current = true
    slideAnim.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
  }, [hasTopBlock, topBlockHeight])

  const animatedTopBlockStyle = useAnimatedStyle(() => ({
    marginTop: (slideAnim.value - 1) * topBlockHeight,
  }), [topBlockHeight])

  // ── Reveal stagger (name → chips) when used with DiscoveryReveal ──────────
  const initialRevealOpacity = revealPhase === 'idle' || revealPhase === 'reveal' ? 0 : 1
  const nameOpacity = useSharedValue(initialRevealOpacity)
  const chipsOpacity = useSharedValue(initialRevealOpacity)
  useEffect(() => {
    if (revealPhase === 'idle') {
      nameOpacity.value = 0
      chipsOpacity.value = 0
    } else if (revealPhase === 'reveal') {
      nameOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })
      chipsOpacity.value = withDelay(100, withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }))
    } else {
      // 'done' or undefined: fully visible (no animation)
      nameOpacity.value = 1
      chipsOpacity.value = 1
    }
  }, [revealPhase])
  const nameRevealStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }))
  const chipsRevealStyle = useAnimatedStyle(() => ({ opacity: chipsOpacity.value }))

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
        {topBlock && (
          <Animated.View
            key="top"
            style={[
              topBlockHeight === 0 && { position: 'absolute', opacity: 0, start: 0, end: 0 },
              animatedTopBlockStyle,
            ]}
            onLayout={e => {
              const h = e.nativeEvent.layout.height
              if (h > 0 && topBlockHeight === 0) setTopBlockHeight(h)
            }}
          >
            {topBlock}
          </Animated.View>
        )}
        <View key="photo" style={{ height: photoHeight }}>
          {imageUrls.length > 0 && (
            <LoadingImage
              source={imageUrls[0]}
              style={[styles.photo, StyleSheet.absoluteFill]}
              contentFit="cover"
              cachePolicy="disk"
              onSettle={onImageSettle}
            />
          )}

          <View style={styles.infoOverlay}>
            <Animated.View style={nameRevealStyle}>
              <Text style={styles.name}>{displayTitle}</Text>
            </Animated.View>

            <Animated.View style={[styles.chipsRow, chipsRevealStyle]}>
              <View style={styles.chipsLeft}>
                {distStr ? (
                  <Chip
                    renderIcon={c => <PinIcon color={c} />}
                    text={distStr}
                    tone="neutral"
                    onPhoto
                  />
                ) : null}
                {timeStr ? (
                  <Chip
                    renderIcon={c => <ClockIcon color={c} />}
                    text={timeStr}
                    tone="neutral"
                    onPhoto
                  />
                ) : null}
              </View>

              <View style={styles.chipsRight}>
                {match.push_enabled === false && (
                  <Chip
                    renderIcon={c => <BellOffIcon color={c} />}
                    text={tg('home.notifOff', match.is_male)}
                    tone="neutral"
                    onPhoto
                  />
                )}
              </View>
            </Animated.View>
          </View>
        </View>

        {match.bio ? (
          <View key="bio" style={styles.aboutSection}>
            <View style={styles.aboutBubble}>
              <Text style={[styles.aboutQuote, styles.aboutQuoteOpen]}>“</Text>
              <Text style={styles.aboutText}>{match.bio}</Text>
              <Text style={[styles.aboutQuote, styles.aboutQuoteClose]}>”</Text>
            </View>
          </View>
        ) : null}

        {imageUrls.length > 1 && (
          <View key="extras" style={styles.extraPhotos}>
            {imageUrls.slice(1).map((url) => (
              <LoadingImage
                key={url}
                source={url}
                style={[styles.extraPhoto, { height: photoHeight }]}
                contentFit="cover"
                cachePolicy="disk"
                onSettle={onImageSettle}
              />
            ))}
          </View>
        )}

        {match.is_for_kids != null && (
          <View key="kids" style={styles.kidsRow}>
            <View style={styles.kidsLabel}>
              <BabyIcon color={TEXT_PRIMARY} />
              <Text style={styles.kidsLabelText}>{tg('settings.kidsLabel', match.is_male)}</Text>
            </View>
            <Text style={[styles.kidsValue, { color: match.is_for_kids ? PRIMARY : DESTRUCTIVE }]}>
              {match.is_for_kids ? t('settings.kidsYes') : t('settings.kidsNo')}
            </Text>
          </View>
        )}
      </PullScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 0,
  },
  photo: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    padding: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  chipsLeft: {
    width: '50%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  chipsRight: {
    width: '50%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 8,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    textAlign: 'left',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  nameNoChips: {
    marginBottom: SINGLE,
  },
  aboutSection: {
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  aboutBubble: {
    alignSelf: 'stretch',
    backgroundColor: PRIMARY_BG,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    position: 'relative',
  },
  aboutQuote: {
    position: 'absolute',
    fontSize: 32,
    color: PRIMARY,
    fontWeight: '700',
    lineHeight: 32,
  },
  aboutQuoteOpen: {
    top: 4,
    start: 10,
  },
  aboutQuoteClose: {
    bottom: 4,
    end: 10,
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  extraPhotos: {
    backgroundColor: WHITE,
    gap: SINGLE,
  },
  extraPhoto: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: DOUBLE,
    marginHorizontal: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
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
    color: TEXT_PRIMARY,
  },
  kidsValue: {
    fontSize: 14,
    fontWeight: '600',
  },
})
