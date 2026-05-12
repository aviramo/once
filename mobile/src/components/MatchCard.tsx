import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut, useAnimatedRef, scrollTo, useDerivedValue, cancelAnimation } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PullScrollView } from './HomeCard'

const AnimatedPullScrollView = Animated.createAnimatedComponent(PullScrollView)
import { Text } from './AppText'
import { t, tg } from '../i18n'
import type { Profile } from '../stores/userStore'
import { type FamilyData, familyScheduleOverlap } from '../lib/family'
import { familyHeaderTitle } from './FamilyCard'
import { Chip, PinIcon, ClockIcon, KidsIcon } from './Chip'
import { HeartIcon } from './icons'
import { SINGLE, DOUBLE, BUTTON, RADIUS } from '../tokens'
import { BLACK, WHITE, PRIMARY, PRIMARY_BG, BLACK_SOFT, BLACK_MID, BLACK_STRONG } from '../colors'
import { formatDistance } from '../lib/units'

// Display-only card for non-resting states. Action buttons live in the
// home screen's pinned bottom bar so they share spacing + positioning with
// the HIDDEN/VISIBLE toggle.

const ACTION_BTN = 76
const SCROLL_TO_END_MS = 1400

// One round icon-button overlaid on the hero photo. CardActionStack stacks
// these vertically growing upward from the heart's anchor. Default usage is
// a single heart button (invite affordance); the self-profile preview passes
// multiple actions (add-photo, add-family) instead.
export type CardAction = {
  key: string
  icon: React.ReactNode
  onPress: () => void
  /** Optional override for the circular button's background color. Defaults
   * to BLACK_STRONG (translucent black). Used by chat-state dots to differentiate
   * from the default heart-on-photo affordance. */
  bg?: string
}

function CardActionStack({ actions, bottom }: { actions: CardAction[]; bottom: number }) {
  return (
    <View style={[styles.actionStack, { bottom }]}>
      {actions.map(a => (
        <Pressable
          key={a.key}
          style={({ pressed }) => [
            styles.actionButton,
            a.bg ? { backgroundColor: a.bg } : null,
            pressed && styles.actionButtonPressed,
          ]}
          hitSlop={12}
          onPress={a.onPress}
        >
          {a.icon}
        </Pressable>
      ))}
    </View>
  )
}

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


function formatLocatedAt(iso: string | null | undefined, isMale: boolean | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return tg('match.justNow', isMale)
  if (diff < 3600) {
    const n = Math.floor(diff / 60)
    return tg(n === 1 ? 'match.minAgo' : 'match.minsAgo', isMale).replace('{n}', String(n))
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600)
    return tg(n === 1 ? 'match.hrAgo' : 'match.hrsAgo', isMale).replace('{n}', String(n))
  }
  const n = Math.floor(diff / 86400)
  return tg(n === 1 ? 'match.dayAgo' : 'match.daysAgo', isMale).replace('{n}', String(n))
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
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BLACK_MID }]} />
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
  bottomInset = 0,
  hideTime = false,
  onReady,
  topBlock,
  footerBlock,
  footerBg,
  onPhotoTap,
  onFamilyTap,
  onBioTap,
  actions,
  isForKids,
  viewerFamily,
  self = false,
}: {
  match: Profile
  bottomInset?: number
  hideTime?: boolean
  onReady?: () => void
  topBlock?: React.ReactNode
  /** Rendered as the last child of the scroll content, after all sections.
   * Use for an action button that should scroll with the card (not pinned
   * to the bottom of the screen). */
  footerBlock?: React.ReactNode
  /** Background color the caller wants painted behind the footerBlock area
   * (and any space below it — bottomInset, scroll bounce). Pass the same
   * color as the footerBlock's own background so the page ends in one
   * continuous tone instead of revealing the parent's white. */
  footerBg?: string
  /** When provided, each photo becomes tappable and the callback receives the
   * photo's index in `match.images` (own-profile preview / edit mode). */
  onPhotoTap?: (imageIndex: number) => void
  /** When provided, the family/kids card becomes tappable (own-profile preview). */
  onFamilyTap?: () => void
  /** When provided, the bio bubble becomes tappable (own-profile preview). */
  onBioTap?: () => void
  /** Overlay action buttons stacked at the bottom-right of the hero photo,
   * starting at the heart's anchor and growing upward. When omitted, a
   * single heart button is rendered (tapping scrolls to the end of the
   * card). The self-profile preview passes [add-photo, add-family]. */
  actions?: CardAction[]
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
    for (let i = 1; i < photos.length; i++) built.push(photos[i])
    return built
  }, [match.user_id, match.images, imageUrls, match.bio])

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
  const { bottom: safeBottomInset } = useSafeAreaInsets()
  // The first photo runs to the bottom of the card (callers pass bottomInset=0
  // to keep it full-bleed), so the on-photo overlay (name + chips + heart)
  // must clear the home indicator on its own.
  const overlayBottomOffset = Math.max(safeBottomInset, BUTTON)
  const ready = cardH > 0
  const timeIso = match.last_seen
  const timeStr = hideTime ? '' : formatLocatedAt(timeIso, match.is_male)
  const distStr = formatDistance(match.distance, match.is_male)
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
    const base = familyHeaderTitle(fam, count, ageStr, effIsForKids, self)
    const overlap =
      viewerFamily?.hasKids && fam.hasKids
        ? familyScheduleOverlap(viewerFamily.schedule, fam.schedule)
        : null
    if (overlap == null) return base
    const pct = Math.round(overlap * 100)
    return base + t('family.overlapChipSuffix').replace('{pct}', String(pct))
  }, [match.family, isForKids, self, viewerFamily])

  const endsWithPhoto = sections.length > 0 && sections[sections.length - 1].type === 'photo'
  const endsWithBio = sections.length > 0 && sections[sections.length - 1].type === 'bio'
  const effectiveTopBlock = topBlock
  const hasTopBlock = !!effectiveTopBlock
  const [topBlockHeight, setTopBlockHeight] = useState(0)
  // If the card mounts already with a topBlock (cold start), start expanded
  // so it shows in place without animation. Otherwise start collapsed so the
  // watching → waiting transition can slide in from above.
  const slideAnim = useSharedValue(hasTopBlock ? 1 : 0)
  const animatedRef = useRef(false)
  const wasAbsentRef = useRef(false)
  const scrollRef = useAnimatedRef<any>()
  const scrollYRef = useRef(0)
  // Snap the scroll back to the top whenever a new profile is shown. The
  // ScrollView is the same instance across profile swaps, so a previously
  // scrolled position from card A would otherwise carry over into card B and
  // (a) show the user a mid-page slice of the new content, and (b) leave the
  // parent's pull-to-skip gate stuck at "not at top". The parent also resets
  // its cached gate on user_id change; this keeps the two states aligned.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
    scrollYRef.current = 0
  }, [match.user_id])
  const contentHRef = useRef(0)
  const viewportHRef = useRef(0)
  // UI-thread driver for slow programmatic scroll. The previous rAF-based
  // approach drove `scrollTo({animated:false})` from JS every frame and
  // stuttered near the end of the scroll, where laying in the bio + family
  // chip + lower photos competed with the rAF tick on the JS thread.
  // `scrollAnimActive` gates the worklet so this only writes during the
  // animation; once it ends, the user scrolls freely.
  const scrollAnimY = useSharedValue(0)
  const scrollAnimActive = useSharedValue(false)
  useDerivedValue(() => {
    if (scrollAnimActive.value) scrollTo(scrollRef, 0, scrollAnimY.value, false)
  })
  const slowScrollToEnd = useCallback(() => {
    const target = Math.max(0, contentHRef.current - viewportHRef.current)
    const start = scrollYRef.current
    if (Math.abs(target - start) < 0.5) return
    scrollAnimY.value = start
    scrollAnimActive.value = true
    scrollAnimY.value = withTiming(
      target,
      { duration: SCROLL_TO_END_MS, easing: Easing.out(Easing.cubic) },
      (finished) => { if (finished) scrollAnimActive.value = false }
    )
  }, [])
  useEffect(() => () => {
    cancelAnimation(scrollAnimY)
    scrollAnimActive.value = false
  }, [])
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
    // before we move anything. If the user scrolled down (e.g. tapped the
    // heart or the invite block sat at the bottom), scroll back to the top
    // first, then start the timer's slide-in from above. Two coherent
    // motions back-to-back: scroll up, then timer descends.
    //
    // The scroll uses the native ScrollView animation (UI thread). The
    // earlier rAF-based easing competed with the JS thread for cycles
    // during the post-press React commit and looked stuttery.
    if (animatedRef.current || topBlockHeight === 0) return
    animatedRef.current = true
    const startSlide = () => {
      slideAnim.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    }
    if (scrollYRef.current > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
      // Native animated scroll completes in ~300ms on both platforms.
      // Kick the timer slide-in just after so the two motions read as
      // sequential rather than overlapping.
      setTimeout(startSlide, 320)
    } else {
      startSlide()
    }
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


  // Trailing background.
  //   - footerBlock case: paint *only* the area below the footer via a
  //     flexGrow filler — DO NOT tint the wrap, because the bio bubble
  //     (PRIMARY_BG = translucent coral) would composite over a coral wrap
  //     and read as full coral instead of cream.
  //   - bio-end case (no footerBlock): wrap = PRIMARY_BG. Both layers are
  //     translucent so they don't visually conflict.
  const wrapBg = !footerBlock && endsWithBio ? PRIMARY_BG : undefined
  // contentContainer must flexGrow to viewport so the filler under
  // footerBlock can claim the leftover vertical space when content < viewport.
  // When footerBlock owns the bottom we skip the container's paddingBottom —
  // the footer block already includes its own safe-area padding.
  const contentPaddingBottom = footerBlock ? 0 : bottomInset + (endsWithPhoto ? 0 : DOUBLE)

  return (
    <View
      style={[styles.wrap, wrapBg ? { backgroundColor: wrapBg } : null, !ready && styles.hidden]}
      onLayout={e => setCardH(e.nativeEvent.layout.height)}
    >
      <AnimatedPullScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPaddingBottom, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onScroll={(e: any) => { scrollYRef.current = e.nativeEvent.contentOffset.y }}
        onContentSizeChange={(_: number, h: number) => { contentHRef.current = h }}
        onLayout={(e: any) => { viewportHRef.current = e.nativeEvent.layout.height }}
      >
        {effectiveTopBlock && (
          <>
            {/* Absolute timer slides in via `top`; spacer below grows in sync. */}
            <Animated.View
              key="top"
              style={[styles.topBlockAbsolute, animatedTopBlockStyle]}
              onLayout={e => {
                const h = e.nativeEvent.layout.height
                // Track current height so swapping topBlock content (e.g.
                // waiting InfoBlock → ended MessageBlock on the same card)
                // resizes the hero spacer instead of leaving a stale gap.
                if (h > 0 && h !== topBlockHeight) setTopBlockHeight(h)
              }}
            >
              {effectiveTopBlock}
            </Animated.View>
            <Animated.View key="top-spacer" pointerEvents="none" style={animatedSpacerStyle} />
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

          {sections[0]?.type === 'photo' && (() => {
            // When `actions` is omitted, fall back to a single heart that
            // scrolls the card to its end. When it's an empty array, render
            // nothing — callers use that to suppress the affordance entirely
            // (e.g. waiting/ended page1 states where no overlay button fits).
            const resolved = actions ?? [{
              key: 'like',
              icon: <HeartIcon color={PRIMARY} stroke={WHITE} size={48} />,
              onPress: slowScrollToEnd,
            }]
            return resolved.length > 0
              ? <CardActionStack bottom={overlayBottomOffset} actions={resolved} />
              : null
          })()}

          {/* pointerEvents="box-none" so taps on empty regions of this full-
              width overlay fall through to the action stack underneath (the
              dots / heart button lives at the same bottom strip). */}
          <View pointerEvents="box-none" style={[styles.infoOverlay, { paddingBottom: overlayBottomOffset }]}>
            <View pointerEvents="box-none">
              <Text style={styles.name}>{displayTitle}</Text>
            </View>

            <View pointerEvents="box-none" style={styles.chipsStack}>
              {timeStr ? (
                <View style={styles.chipsLine}>
                  <Chip
                    renderIcon={c => <ClockIcon color={c} />}
                    text={timeStr}
                    tone="neutral"
                    onPhoto
                  />
                </View>
              ) : null}
              {distStr ? (
                <View style={styles.chipsLine}>
                  <Chip
                    renderIcon={c => <PinIcon color={c} />}
                    text={distStr}
                    tone="neutral"
                    onPhoto
                  />
                </View>
              ) : null}
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
            </View>
          </View>
        </Animated.View>

        {/* Rest of sections rendered in items order */}
        {sections.slice(1).map((section) => {
          if (section.type === 'photo') return (
            <Animated.View
              key={section.key}
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
            // When the bio is the final section the wrap behind it is painted
            // PRIMARY_BG; stacking another PRIMARY_BG layer on the bubble
            // doubles the translucent tint and makes the bubble read darker
            // than the area below. Drop the bubble's own bg in that case so
            // the page ends in one continuous tone.
            const transparentBubble = !footerBlock && endsWithBio
            const bubble = (
              <View style={[styles.aboutBubble, transparentBubble && styles.aboutBubbleTransparent]}>
                <Text style={styles.aboutText}>{section.value}</Text>
              </View>
            )
            return (
              <View key={section.key} style={styles.aboutSection}>
                {onBioTap ? <Pressable onPress={onBioTap} style={{ alignSelf: 'stretch' }}>{bubble}</Pressable> : bubble}
              </View>
            )
          }
          return null
        })}
        {footerBlock ? (
          <View style={styles.footerBlock}>{footerBlock}</View>
        ) : null}
        {/* Coral (or whatever footerBg) tile that grows to fill the gap
            between the footerBlock and the bottom of the viewport when the
            card content is shorter than the viewport. Stays at 0 height
            otherwise — long content just scrolls normally. */}
        {footerBlock && footerBg ? (
          <View style={{ flexGrow: 1, backgroundColor: footerBg }} />
        ) : null}
      </AnimatedPullScrollView>
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
    backgroundColor: BLACK_SOFT,
    overflow: 'hidden',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    padding: BUTTON,
  },
  actionStack: {
    position: 'absolute',
    right: BUTTON,
    flexDirection: 'column-reverse',
    alignItems: 'center',
    gap: SINGLE,
  },
  actionButton: {
    width: ACTION_BTN,
    height: ACTION_BTN,
    borderRadius: ACTION_BTN / 2,
    backgroundColor: BLACK_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.92 }],
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
    textShadowColor: BLACK_STRONG,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  nameNoChips: {
    marginBottom: SINGLE,
  },
  aboutSection: {
    alignItems: 'center',
  },
  aboutBubble: {
    alignSelf: 'stretch',
    backgroundColor: PRIMARY_BG,
    paddingVertical: BUTTON * 2,
    paddingHorizontal: BUTTON,
  },
  aboutBubbleTransparent: {
    backgroundColor: 'transparent',
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    color: BLACK,
    textAlign: 'center',
  },
  extraPhoto: {
    width: '100%',
    backgroundColor: BLACK_SOFT,
    overflow: 'hidden',
  },
  footerBlock: {
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
    backgroundColor: BLACK_SOFT,
  },
  kidsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kidsLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  kidsValue: {
    fontSize: 14,
    fontWeight: '600',
  },
})
