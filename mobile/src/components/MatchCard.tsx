import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { PullScrollView } from './HomeCard'
import { Text } from './AppText'
import Svg, { Path, Circle } from 'react-native-svg'
import { t, tg } from '../i18n'
import type { Profile } from '../stores/userStore'
import { type FamilyData, familyScheduleOverlap } from '../lib/family'
import { FamilyCard, familyHeaderTitle } from './FamilyCard'
import { Chip, PinIcon, ClockIcon, KidsIcon } from './Chip'
import { SINGLE, DOUBLE, RADIUS } from '../fonts'
import { TEXT_PRIMARY, WHITE, PRIMARY, PRIMARY_BG, DESTRUCTIVE } from '../colors'

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

// Average luminance (0..255) of a blurhash, derived from the DC component
// (chars 2..6 in base83). Lets callers gate UI decisions — e.g. darken the
// hero placeholder when the hash is near-white so overlaid text stays
// readable until the real image arrives.
const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'
function decode83(s: string): number {
  let v = 0
  for (let i = 0; i < s.length; i++) {
    const idx = BASE83.indexOf(s[i])
    if (idx < 0) return NaN
    v = v * 83 + idx
  }
  return v
}
function hashLuminance(hash: string | undefined): number | null {
  if (!hash || hash.length < 6) return null
  const dc = decode83(hash.slice(2, 6))
  if (!Number.isFinite(dc)) return null
  const r = (dc >> 16) & 0xff
  const g = (dc >> 8) & 0xff
  const b = dc & 0xff
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function LoadingImage({
  style,
  hash,
  onSettle,
  darkenIfLight,
  ...props
}: Omit<React.ComponentProps<typeof Image>, 'onLoad' | 'onError' | 'placeholder' | 'placeholderContentFit'> & {
  style?: any
  hash?: string
  onSettle?: () => void
  darkenIfLight?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const attemptRef = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settle = useCallback(() => { setLoading(false); onSettle?.() }, [onSettle])
  const handleError = useCallback(() => {
    // expo-image doesn't retry on its own. First failure → remount and refetch
    // after a short delay (covers transient network/race issues that surface
    // when many images mount simultaneously). Second failure → give up.
    if (attemptRef.current < 1) {
      attemptRef.current += 1
      retryTimer.current = setTimeout(() => setAttempt(attemptRef.current), 800)
    } else {
      settle()
    }
  }, [settle])
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current) }, [])
  const placeholder = hash ? { blurhash: hash } : undefined
  const isLightHash = useMemo(() => {
    if (!darkenIfLight) return false
    const lum = hashLuminance(hash)
    return lum != null && lum > 180
  }, [darkenIfLight, hash])
  return (
    <View style={style}>
      <Image
        {...props}
        key={`attempt-${attempt}`}
        placeholder={placeholder}
        placeholderContentFit="cover"
        style={StyleSheet.absoluteFill}
        onLoad={settle}
        onError={handleError}
      />
      {loading && isLightHash && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
      )}
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
  onPhotoTap,
  onFamilyTap,
  onBioTap,
  isForKids,
  viewerFamily,
  self = false,
}: {
  match: Profile
  userIsMale: boolean | null
  units?: string | null
  bottomInset?: number
  hideTime?: boolean
  onReady?: () => void
  topBlock?: React.ReactNode
  /** When provided, each photo becomes tappable and the callback receives the
   * photo's index in `match.images` (own-profile preview / edit mode). */
  onPhotoTap?: (imageIndex: number) => void
  /** When provided, the family/kids card becomes tappable (own-profile preview). */
  onFamilyTap?: () => void
  /** When provided, the bio bubble becomes tappable (own-profile preview). */
  onBioTap?: () => void
  /** "Wants own (more) kids" preference (`data.family.isForKids`) — only
   * set for the user's own profile preview; remote match snapshots don't
   * carry this. Used by the family card to extend the "No kids" header
   * with the user's intent. */
  isForKids?: boolean | null
  /** Viewer's own family data (from userStore). Passed by remote-render call
   * sites so the family card can show the kid-free schedule overlap. Own
   * profile preview omits this — no overlap shown there. */
  viewerFamily?: FamilyData | null
  /** First-person rendering for the own-profile preview ("I have 3 kids"
   * vs. the default third-person "Has 3 kids" used on remote match cards). */
  self?: boolean
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

  // Fixed display order:
  //   1. Hero photo (images[0])
  //   2. Bio (if present), with family card attached underneath when present
  //   3. Family card (if present, but no bio)
  //   4. Remaining photos (images[1..])
  // `imageIndex` is the index into match.images (or -1 for non-photo sections).
  type CardSection =
    | { type: 'photo'; url: string; hash?: string; imageIndex: number; key: string }
    | { type: 'bio'; value: string; key: string }
    | { type: 'family'; data: FamilyData; key: string }
  const sections = useMemo((): CardSection[] => {
    const images = match.images ?? []
    const photos: CardSection[] = images
      .filter(img => img.normal)
      .map((img, i) => ({
        type: 'photo' as const,
        url: imageUrls[i],
        hash: img.hash || undefined,
        imageIndex: i,
        key: `photo-${img.normal}`,
      }))
    const built: CardSection[] = []
    if (photos.length > 0) built.push(photos[0])
    if (match.bio) built.push({ type: 'bio', value: match.bio, key: 'bio' })
    if (match.family) built.push({ type: 'family', data: match.family, key: 'family' })
    for (let i = 1; i < photos.length; i++) built.push(photos[i])
    return built
  }, [match.user_id, match.images, imageUrls, match.bio, match.family])

  const photoCount = sections.filter(s => s.type === 'photo').length
  const loadedCount = useRef(0)
  useEffect(() => { loadedCount.current = 0 }, [match.user_id])
  useEffect(() => { if (photoCount === 0) onReady?.() }, [photoCount])
  const onImageSettle = useCallback(() => {
    loadedCount.current += 1
    if (loadedCount.current >= photoCount) onReady?.()
  }, [photoCount, onReady])
  const [cardH, setCardH] = useState(0)
  const photoHeight = Math.max(280, cardH - bottomInset)
  const ready = cardH > 0
  const timeIso = match.last_seen
  const timeStr = hideTime ? '' : formatLocatedAt(timeIso)
  const distStr = formatDistance(match.distance, units)
  const displayTitle = match.title

  // Build the kids chip text from match.family. Same phrasing as the old
  // FamilyCard title chip: "Has N kids (ages)" (+ "and wants more"). The
  // explicit isForKids prop overrides — used by the self-preview where
  // settings drives the value while editing. Remote snapshots fall back to
  // fam.isForKids, which make_profile includes in every snapshot.
  const familyChipText = useMemo(() => {
    const fam = match.family
    if (!fam) return ''
    const kids = fam.kids ?? []
    const count = fam.kids?.length
    const anyAgeSet = kids.some(k => k.age != null)
    const ageStr = anyAgeSet
      ? kids.map(k => (k.age != null ? String(k.age) : '-')).join(', ')
      : null
    const effIsForKids = isForKids !== undefined ? isForKids : (fam.isForKids ?? null)
    return familyHeaderTitle(fam, count, ageStr, effIsForKids, self)
  }, [match.family, isForKids, self])

  const distGreen = isDistanceNear(match.distance)
  const endsWithPhoto = sections.length > 0 && sections[sections.length - 1].type === 'photo'
  const effectiveTopBlock = topBlock
  const hasTopBlock = !!effectiveTopBlock
  const [topBlockHeight, setTopBlockHeight] = useState(0)
  // If the card mounts already with a topBlock (cold start), start expanded
  // so it shows in place without animation. Otherwise start collapsed so the
  // watching → waiting transition can slide in from above.
  const slideAnim = useSharedValue(hasTopBlock ? 1 : 0)
  const animatedRef = useRef(false)
  const wasAbsentRef = useRef(false)
  const scrollRef = useRef<any>(null)
  const scrollYRef = useRef(0)
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
    // watching → waiting transition: wait until the timer block has measured
    // before we move anything. Then snap scroll to 0 *instantly* (an animated
    // scrollTo races the slide-in below and looks like the card is reloading)
    // and start the timer's slide-in. One coherent motion: scroll first, then
    // the timer descends.
    if (animatedRef.current || topBlockHeight === 0) return
    animatedRef.current = true
    if (scrollYRef.current > 0) scrollRef.current?.scrollTo({ y: 0, animated: false })
    slideAnim.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
  }, [hasTopBlock, topBlockHeight])

  // Timer is absolute-positioned over the scroll content (no flow contribution),
  // animating `top` from -h to 0. A sibling spacer animates its height from 0
  // to h to push the hero photo down in lockstep. Keeping the timer permanently
  // absolute avoids the absolute→in-flow style flip that caused a visible
  // flicker when the user sent an invite while scroll was at y=0.
  const animatedTopBlockStyle = useAnimatedStyle(() => ({
    top: (slideAnim.value - 1) * topBlockHeight,
    opacity: topBlockHeight === 0 ? 0 : 1,
  }), [topBlockHeight])
  const animatedSpacerStyle = useAnimatedStyle(() => ({
    height: slideAnim.value * topBlockHeight,
  }), [topBlockHeight])


  return (
    <View style={[styles.wrap, !ready && styles.hidden]} onLayout={e => setCardH(e.nativeEvent.layout.height)}>
      <PullScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + (endsWithPhoto ? 0 : DOUBLE) }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y }}
      >
        {effectiveTopBlock && (
          <>
            {/* Absolute timer slides in via `top`; spacer below grows in sync. */}
            <Animated.View
              key="top"
              style={[styles.topBlockAbsolute, animatedTopBlockStyle]}
              onLayout={e => {
                const h = e.nativeEvent.layout.height
                if (h > 0 && topBlockHeight === 0) setTopBlockHeight(h)
              }}
            >
              {effectiveTopBlock}
            </Animated.View>
            <Animated.View key="top-spacer" style={animatedSpacerStyle} />
          </>
        )}
        {/* Hero: always the first section (expected to be a photo) */}
        <Animated.View
          key={sections[0]?.type === 'photo' ? sections[0].key : 'hero'}
          style={{ height: photoHeight }}
          exiting={onPhotoTap && sections[0]?.type === 'photo' ? FadeOut.duration(220) : undefined}
        >
          {sections[0]?.type === 'photo' && (
            <>
              <LoadingImage
                source={sections[0].url}
                hash={sections[0].hash}
                style={[styles.photo, StyleSheet.absoluteFill]}
                contentFit="cover"
                cachePolicy="memory-disk"
                onSettle={onImageSettle}
                darkenIfLight
              />
              {onPhotoTap && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => onPhotoTap(sections[0].type === 'photo' ? sections[0].imageIndex : -1)}
                />
              )}
            </>
          )}

          <View style={styles.infoOverlay}>
            <View>
              <Text style={styles.name}>{displayTitle}</Text>
            </View>

            <View style={styles.chipsStack}>
              {familyChipText ? (
                <View style={styles.chipsLine}>
                  {onFamilyTap ? (
                    <Pressable onPress={onFamilyTap}>
                      <Chip
                        renderIcon={c => <KidsIcon color={c} />}
                        text={familyChipText}
                        tone="neutral"
                        onPhoto
                      />
                    </Pressable>
                  ) : (
                    <Chip
                      renderIcon={c => <KidsIcon color={c} />}
                      text={familyChipText}
                      tone="neutral"
                      onPhoto
                    />
                  )}
                </View>
              ) : null}
              {(distStr || timeStr) ? (
                <View style={styles.chipsLine}>
                  {timeStr ? (
                    <Chip
                      renderIcon={c => <ClockIcon color={c} />}
                      text={timeStr}
                      tone="neutral"
                      onPhoto
                    />
                  ) : null}
                  {distStr ? (
                    <Chip
                      renderIcon={c => <PinIcon color={c} />}
                      text={distStr}
                      tone="neutral"
                      onPhoto
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Rest of sections rendered in items order */}
        {sections.slice(1).map((section) => {
          if (section.type === 'photo') return (
            <Animated.View
              key={section.key}
              style={{ marginTop: SINGLE }}
              exiting={onPhotoTap ? FadeOut.duration(220) : undefined}
            >
              <LoadingImage
                source={section.url}
                hash={section.hash}
                style={[styles.extraPhoto, { height: photoHeight }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                onSettle={onImageSettle}
              />
              {onPhotoTap && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => onPhotoTap(section.imageIndex)}
                />
              )}
            </Animated.View>
          )
          if (section.type === 'bio') {
            const bubble = (
              <View style={styles.aboutBubble}>
                <Text style={[styles.aboutQuote, styles.aboutQuoteOpen]}>"</Text>
                <Text style={styles.aboutText}>{section.value}</Text>
                <Text style={[styles.aboutQuote, styles.aboutQuoteClose]}>"</Text>
              </View>
            )
            return (
              <View key={section.key} style={styles.aboutSection}>
                {onBioTap ? <Pressable onPress={onBioTap} style={{ alignSelf: 'stretch' }}>{bubble}</Pressable> : bubble}
              </View>
            )
          }
          if (section.type === 'family') {
            // The kids title chip moved to the photo overlay. The only thing
            // FamilyCard still renders is the schedule-overlap chip — and that
            // only when the viewer passed their own family (remote render, not
            // the own-profile preview) and both sides have hasKids + a usable
            // schedule. No overlap → render nothing here.
            const overlap =
              viewerFamily?.hasKids && section.data.hasKids
                ? familyScheduleOverlap(viewerFamily.schedule, section.data.schedule)
                : null
            if (overlap == null) return null
            return <FamilyCard key={section.key} overlap={overlap} />
          }
          return null
        })}
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
  topBlockAbsolute: {
    position: 'absolute',
    start: 0,
    end: 0,
  },
  photo: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: RADIUS,
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
  chipsStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 8,
  },
  chipsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
    marginTop: SINGLE,
    alignItems: 'center',
  },
  aboutBubble: {
    alignSelf: 'stretch',
    backgroundColor: PRIMARY_BG,
    borderRadius: RADIUS,
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
  // The `"` glyph sits at the top of its lineHeight, so a literal `bottom: 4`
  // would leave a tall empty band beneath the glyph. Pull the line container
  // a bit below the bubble's bottom so the glyph itself mirrors the open
  // quote's 4 px distance from the top.
  aboutQuoteClose: {
    bottom: -8,
    end: 10,
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  extraPhoto: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SINGLE,
    marginHorizontal: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS,
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
