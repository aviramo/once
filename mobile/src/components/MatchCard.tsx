import React, { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable, Keyboard, Platform } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut, useAnimatedRef, scrollTo, useDerivedValue, cancelAnimation, runOnJS } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PullScrollView, PullContext } from './PullPane'

const AnimatedPullScrollView = Animated.createAnimatedComponent(PullScrollView)
import { Text, TextInput } from './AppText'
import { t, tg } from '../i18n'
import { ageFromTitle, nameFromTitle } from '../lib/profileTitle'
import { BIO_MIN, BIO_MAX, normalizeBio } from '../lib/bio'
import { resolveLocationType, type Profile, type LocationType } from '../stores/userStore'
import type { FamilyData } from '../lib/family'
import { buildFamilyChipText } from './FamilyCard'
import { Chip, PinIcon, HomeIcon, WorkIcon, ClockIcon, KidsIcon, PresenceDot } from './Chip'
import { HeartIcon, QuoteIcon, CakeIcon, ShieldIcon, GroupsIcon } from './icons'
import { RoundButton } from './RoundButton'
import { SM, MD, RADIUS, ICON, TEXT, WEIGHT, OVERLAY, ROUND_BUTTON_SIZE_SM, lh } from '../tokens'
import { BLACK, WHITE, PRIMARY, BLACK_SOFT, BLACK_MID, BLACK_STRONG } from '../colors'
import { formatProximity, isDistanceHere } from '../lib/units'
import { isLastSeenJustNow } from '../lib/lastSeen'

// Display-only card for non-resting states. Action buttons live in the
// home screen's pinned bottom bar so they share spacing + positioning with
// the HIDDEN/VISIBLE toggle.

const SCROLL_TO_END_MS = 1400

// One round icon-button overlaid on the hero photo. CardActionStack stacks
// these vertically growing upward from the heart's anchor. Default usage is
// a single heart button (invite affordance); the self-profile preview passes
// multiple actions (add-photo, add-family) instead. The button shape / size /
// shadow / press feedback live in RoundButton — this just stacks them.
// `onPress` is optional: when omitted, MatchCard fills it with its built-in
// scroll-to-end behavior. Lets callers reuse the "teaser" affordance with a
// custom icon (e.g. the page2 pending-invite question-mark) without
// reimplementing the scroll.
//
// The stack is `column-reverse`, so actions[0] anchors at the BOTTOM and later
// entries stack upward.
export type CardAction = {
  key: string
  icon: React.ReactNode
  onPress?: () => void
  bg?: string
  /** When true, a minimal unread dot is overlaid on the button's top-END arc
   *  (the open-chat button uses it to signal new messages). */
  badge?: boolean
}

// Minimal unread marker. Sized/placed to sit ON the round button's upper-END
// arc (~11px in from each corner of the 76dp button), so it reads as attached
// to the button rather than floating in the empty square corner. The brand is
// strictly monochrome (no warning hue) — attention on a dark surface is WHITE
// (see colors.ts), so this is a solid WHITE dot with a thin BLACK ring that
// separates it from both the dark button scrim and any bright photo behind it.
const UNREAD_DOT_SIZE = 14
const UNREAD_DOT_INSET = 4

function CardActionStack({ actions }: { actions: Array<CardAction & { onPress: () => void }> }) {
  return (
    <View style={styles.actionStack}>
      {actions.map(a => (
        <View key={a.key} style={styles.actionItem}>
          <RoundButton bg={a.bg} onPress={a.onPress}>
            {a.icon}
          </RoundButton>
          {a.badge ? <View pointerEvents="none" style={styles.unreadDot} /> : null}
        </View>
      ))}
    </View>
  )
}

// ── Inline bio editing (own-profile preview) ───────────────────────────────
// Replaces the old "tap bio → BottomSheet popup" flow. The bio bubble itself
// becomes the editor: a multiline TextInput styled byte-identically to the
// read-only bio Text, so when it isn't focused it looks exactly like static
// text. Tapping anywhere drops the caret at that character natively. There is
// no save button — editing auto-commits on blur (keyboard dismissed / tap
// outside / focus lost). Sub-min input is discarded and reverts to the last
// committed value, matching the popup's old "can't save below minimum" rule.
export type BioEdit = {
  /** Last committed bio (server truth, '' when unset). */
  value: string
  /** Server round-trip in flight — locks the field. */
  saving?: boolean
  /** Called with the normalized bio once on blur, only when it changed and
   * is at least BIO_MIN chars. `null` is reserved for a cleared bio (never
   * produced today since sub-min reverts, but the contract allows it). */
  onCommit: (next: string | null) => void
}

function BioField({
  edit,
  onFocusRequested,
}: {
  edit: BioEdit
  /** Ask the parent card to scroll this field above the keyboard. */
  onFocusRequested: () => void
}) {
  const { value, saving, onCommit } = edit
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  // Last value we consider authoritative locally — server truth until the
  // user commits a change. Kept in a ref so blur logic reads the latest.
  const committedRef = useRef(value)

  // External value changes (Realtime profile refresh) sync into the draft
  // only while not actively editing, so a server echo can't yank text out
  // from under the user's caret.
  useEffect(() => {
    if (!focused) {
      committedRef.current = value
      setDraft(value)
    }
  }, [value, focused])

  const trimmedLen = draft.trim().length
  const belowMin = trimmedLen < BIO_MIN
  const remaining = BIO_MAX - draft.length

  const handleBlur = useCallback(() => {
    setFocused(false)
    const next = normalizeBio(draft)
    const prev = normalizeBio(committedRef.current)
    if (next === prev) {
      setDraft(committedRef.current)
      return
    }
    // Below the minimum (includes fully cleared) → discard, restore previous.
    if (next.trim().length < BIO_MIN) {
      setDraft(committedRef.current)
      return
    }
    committedRef.current = next
    setDraft(next)
    onCommit(next)
  }, [draft, onCommit])

  return (
    <>
      <TextInput
        style={[styles.aboutText, styles.bioInput]}
        value={draft}
        onChangeText={v => setDraft(v.slice(0, BIO_MAX))}
        maxLength={BIO_MAX}
        multiline
        scrollEnabled={false}
        textAlign="center"
        textAlignVertical="top"
        placeholder={t('bio.placeholder')}
        placeholderTextColor={BLACK_MID}
        editable={!saving}
        onFocus={() => { setFocused(true); onFocusRequested() }}
        onBlur={handleBlur}
      />
      {focused ? (
        <Text style={[styles.bioCounter, !belowMin && remaining < 20 && styles.bioCounterWarn]}>
          {belowMin ? t('bio.min') : remaining}
        </Text>
      ) : null}
    </>
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

type MatchCardProps = {
  match: Profile
  bottomInset?: number
  hideTime?: boolean
  onReady?: () => void
  topBlock?: React.ReactNode
  /** Fired when the topBlock slide-in animation completes after a transition
   * from no-topBlock to topBlock (e.g. watching → waiting). Lets the parent
   * sequence dependent UI (the tab clock chip on page1) to come in *after*
   * the card-side reveal lands instead of in parallel. Not fired on cold
   * mount with topBlock already present. */
  onTopBlockShown?: () => void
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
  /** When provided (and `self`), the bio bubble becomes an inline editor:
   * tap-to-place-caret, keyboard-aware scroll, auto-save on blur. Replaces
   * the old onBioTap popup. The bio section renders even when the bio is
   * empty in this mode, so the user can add one in place. */
  bioEdit?: BioEdit
  /** Overlay action buttons stacked at the bottom-right of the hero photo,
   * starting at the heart's anchor and growing upward. When omitted, a
   * single heart button is rendered (tapping scrolls to the end of the
   * card). The self-profile preview passes [add-photo, add-family]. */
  actions?: CardAction[]
  /** When provided, a report (flag) RoundButton is overlaid at the TOP corner
   * of the hero photo (the chips side), in EVERY state — separate from the
   * bottom action stack so the report affordance lives in one consistent
   * place. Centralised here so the report glyph + its placement live once;
   * callers only wire the handler (open the report confirm for `match`).
   * Omitted for the own-profile preview / preloader, which never report. */
  onReport?: () => void
  /** "Wants own (more) kids" preference (`data.family.isForKids`) — only
   * set for the user's own profile preview; remote match snapshots don't
   * carry this. Used by the family card to extend the "No kids" header
   * with the user's intent. */
  isForKids?: boolean | null
  /** Viewer's own family data (from userStore). Passed by remote-render call
   * sites so the family card can show the kid-free schedule overlap. Own
   * profile preview omits this — no overlap shown there. */
  viewerFamily?: FamilyData | null
  /** Viewer's (A's) own location anchor type. The distance chip's icon is
   * driven by the *subject's* (B = `match`) anchor (pin/home/work); the text
   * stays live ("away") only when BOTH viewer and subject are 'device',
   * otherwise it flips to the passive "from the set location" (the number is
   * anchored to a fixed address, not live proximity). Pass
   * resolveLocationType(ownProfile). */
  viewerLocationType?: LocationType | null
  /** First-person rendering for the own-profile preview ("I have 3 kids"
   * vs. the default third-person "Has 3 kids" used on remote match cards). */
  self?: boolean
  /** Deterministic height of the card area, supplied by callers that already
   * know it (page1 measures its pane height once on mount). When provided the
   * hero photo is sized from it on the FIRST render, so the card never needs
   * to measure-itself-then-reveal — it rises as one solid block instead of
   * popping into view partway through the slide-up. Callers that omit it fall
   * back to the self-measured height + the opacity gate. */
  cardHeight?: number
  /** The shell's safe-area top inset, when floating chrome is painted over this
   * card (home's hamburger, an OverlaySheet's close X). Two things derive from
   * it and must stay in lockstep, which is why it is one prop rather than two:
   * the card's own top-END row lines up WITH the chrome, and the topBlock
   * status card starts BELOW it. 0 / omitted = no chrome above the card. */
  chromeInset?: number
}

/** Imperative handle exposed to parents that need to drive the card's
 * internal scroll (e.g. the skip-hint dialog scrolling back to the top so
 * the user can perform the swipe-down-to-skip gesture). */
export type MatchCardHandle = { scrollToTop: () => void }

export const MatchCard = forwardRef<MatchCardHandle, MatchCardProps>(function MatchCard({
  match,
  bottomInset = 0,
  hideTime = false,
  onReady,
  topBlock,
  onTopBlockShown,
  footerBlock,
  footerBg,
  onPhotoTap,
  onFamilyTap,
  bioEdit,
  actions,
  onReport,
  isForKids,
  viewerFamily,
  viewerLocationType,
  self = false,
  cardHeight,
  chromeInset = 0,
}: MatchCardProps, ref) {
  // Top of the shell's floating chrome, and the bottom of the band it occupies.
  // The card's top-END row aligns with the first; the topBlock clears the second.
  const chromeTop = chromeInset > 0 ? chromeInset + OVERLAY.chromeGap : 0
  const chromeBottom = chromeTop > 0 ? chromeTop + ROUND_BUTTON_SIZE_SM : 0
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
  // Inline-edit mode: the bio bubble is an editor. Stable boolean (not the
  // bioEdit object, which settings recreates each render) so the sections
  // memo doesn't thrash. In this mode the bio section always renders — even
  // with no bio yet — so the user can add one in place.
  const bioEditable = self && !!bioEdit
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
    if (match.bio || bioEditable) built.push({ type: 'bio', value: match.bio ?? '', key: 'bio' })
    for (let i = 1; i < photos.length; i++) built.push(photos[i])
    return built
  }, [match.user_id, match.images, imageUrls, match.bio, bioEditable])

  const photoCount = sections.filter(s => s.type === 'photo').length
  const loadedCount = useRef(0)
  useEffect(() => { loadedCount.current = 0 }, [match.user_id])
  useEffect(() => { if (photoCount === 0) onReady?.() }, [photoCount])
  const onImageSettle = useCallback(() => {
    loadedCount.current += 1
    if (loadedCount.current >= photoCount) onReady?.()
  }, [photoCount, onReady])
  const [cardH, setCardH] = useState(0)
  // Prefer the caller-supplied card height (known on the first render) over
  // the self-measured one, so the hero is correctly sized before paint and
  // the `ready` opacity gate below never has to flip mid-slide-up.
  const effectiveCardH = cardHeight && cardHeight > 0 ? cardHeight : cardH
  const photoHeight = Math.max(280, effectiveCardH - bottomInset)
  const { bottom: safeBottomInset } = useSafeAreaInsets()
  // The first photo runs to the bottom of the card (callers pass bottomInset=0
  // to keep it full-bleed), so the on-photo overlay (name + chips + heart)
  // must clear the home indicator on its own.
  const overlayBottomOffset = Math.max(safeBottomInset, MD)
  const ready = effectiveCardH > 0
  const timeIso = match.last_seen
  // Icon = the subject's (B = match) anchor (pin/home/work). The text is a
  // SINGLE merged phrase: anchor-aware distance + relative last-seen (see
  // formatProximity) — distance stays live ("ממך") only when both viewer and
  // subject are 'device', else it reads as anchored to a fixed address.
  const subjectLocationType = resolveLocationType(match)
  const viewerType: LocationType = viewerLocationType ?? 'device'
  const hasDistance = match.distance != null && !isNaN(match.distance)
  const proximityStr = formatProximity(match.distance, timeIso, match.is_male, viewerType, subjectLocationType, hideTime)
  const proximityLive = isDistanceHere(match.distance) || (!hideTime && isLastSeenJustNow(timeIso))
  // Name and age are the two halves of the server's combined `title`, and both
  // ride the first chips line. The name used to live in the home TAB; that
  // strip was deleted with the pager (2026-07-19), which left the card showing
  // a person with no name at all.
  const nameChipText = nameFromTitle(match.title)
  const age = ageFromTitle(match.title)
  const ageChipText = age ? tg('home.ageChip', match.is_male).replace('{age}', age) : ''

  const familyChipText = useMemo(
    () => buildFamilyChipText(match.family, isForKids, self, viewerFamily, match.is_male),
    [match.family, isForKids, self, viewerFamily, match.is_male],
  )

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
  const scrollRef = useAnimatedRef<any>()
  const scrollYRef = useRef(0)
  // The pull pane (page1/page2) provides this context. `pullEngaged` is a
  // UI-thread flag, true for the whole life of a pull-down drag; `pullY` is
  // the live pull offset. While engaged we pin the inner scroll to offset 0
  // (see the derived value below) so a drag — in particular a down-then-up
  // "cancel" — can't leak into the scroll content before the JS-thread
  // scroll-disable lands. Both undefined for callers with no pull frame
  // (the hidden preloader / the profile sheet).
  const pullCtx = useContext(PullContext)
  const pullEngaged = pullCtx?.pullEngaged
  const pullY = pullCtx?.pullY

  // ── Inline-bio keyboard handling ─────────────────────────────────────────
  // The bio bubble is a TextInput inside this scroll view. On focus we scroll
  // it to the top of the card's viewport (which sits just under the home
  // TabStrip) so the whole bubble is visible above the keyboard. Because the
  // app uses softwareKeyboardLayoutMode "resize", the window shrinks from the
  // bottom and the TabStrip stays pinned — we must NOT pan/translate anything
  // at the screen level, only scroll within this card.
  const bioSectionYRef = useRef(0)
  const bioFocusedRef = useRef(false)
  const [kbHeight, setKbHeight] = useState(0)
  const scrollBioIntoView = useCallback(() => {
    // Land the bubble a hair below the viewport top. It's the section right
    // after the hero, so a near-top offset is always clear of the keyboard
    // regardless of keyboard height.
    const target = Math.max(0, bioSectionYRef.current - MD)
    // Defer one tick so the focus-triggered layout/resize settles first.
    setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: true }), 60)
  }, [])
  const onBioFocusRequested = useCallback(() => {
    bioFocusedRef.current = true
    scrollBioIntoView()
  }, [scrollBioIntoView])
  useEffect(() => {
    if (!bioEditable) return
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, e => {
      setKbHeight(e.endCoordinates?.height ?? 0)
      // On Android the window resizes after the keyboard shows; re-assert the
      // scroll target so the bubble ends up correctly placed post-reflow.
      if (bioFocusedRef.current) scrollBioIntoView()
    })
    const hideSub = Keyboard.addListener(hideEvt, () => {
      bioFocusedRef.current = false
      setKbHeight(0)
    })
    return () => { showSub.remove(); hideSub.remove() }
  }, [bioEditable, scrollBioIntoView])

  // Let parents drive the inner scroll back to the top (skip-hint "got it"
  // returns the user to where the swipe-down-to-skip gesture is armed).
  useImperativeHandle(ref, () => ({
    scrollToTop: () => { scrollRef.current?.scrollTo({ y: 0, animated: true }) },
  }), [])
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
    if (scrollAnimActive.value) { scrollTo(scrollRef, 0, scrollAnimY.value, false); return }
    // Reading pullY makes Reanimated re-run this worklet on every frame of a
    // pull. While the pull is engaged, hold the inner content pinned at the
    // top every frame — the synchronous UI-thread guard the async
    // `scrollEnabled` toggle can't provide (without it a fast pull-and-release
    // sometimes left the card body scrolled a few px down).
    void pullY?.value
    if (pullEngaged?.value) scrollTo(scrollRef, 0, 0, false)
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
    if (scrollYRef.current > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
    }
    // Slide-in uses Reanimated's default withTiming duration; the optional
    // onTopBlockShown callback fires from the same animation's completion
    // path so the parent doesn't have to mirror our timing.
    const cb = onTopBlockShown
    slideAnim.value = withTiming(1, undefined, (finished) => {
      if (finished && cb) runOnJS(cb)()
    })
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


  // contentContainer must flexGrow to viewport so the filler under
  // footerBlock can claim the leftover vertical space when content < viewport.
  // When footerBlock owns the bottom we skip the container's paddingBottom —
  // the footer block already includes its own safe-area padding.
  // Extra bottom room while the bio keyboard is up so the field can scroll
  // fully clear of it even when the bio is the last meaningful content.
  const kbPad = bioEditable && kbHeight > 0 ? kbHeight : 0
  const contentPaddingBottom = (footerBlock ? 0 : bottomInset + (endsWithPhoto ? 0 : MD)) + kbPad

  return (
    <View
      style={[styles.wrap, !ready && styles.hidden]}
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
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y
          scrollYRef.current = y
        }}
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
                // waiting InviteTimerCard → ended EventMessageCard on the same card)
                // resizes the hero spacer instead of leaving a stale gap.
                if (h > 0 && h !== topBlockHeight) setTopBlockHeight(h)
              }}
            >
              {/* The reserved band is painted PRIMARY, not left transparent:
                  every topBlock the app renders is a status card on PRIMARY, so
                  a transparent gap would expose the backdrop as a stripe above
                  it. If a topBlock ever ships a different background this needs
                  to become a prop alongside `footerBg`. */}
              <View style={chromeBottom > 0 ? { paddingTop: chromeBottom, backgroundColor: PRIMARY } : undefined}>
                {effectiveTopBlock}
              </View>
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

          {/* Top-END: the card's own chrome, in one row. Order in JSX (start
              → end within the overlay container, which itself sits at the
              screen END) is [group chip, report flag], so the report lands at
              the SCREEN EDGE (outermost) and the group chip sits INSIDE it —
              user directive 2026-07-20: "closest to the screen edge is the
              report, then the group after". Either child is optional; the row
              simply omits missing pieces.

              Top-START is deliberately left empty: the shell paints its
              floating chrome there (home's hamburger, a sheet's close X). */}
          {sections[0]?.type === 'photo' && (match.group_name || onReport) ? (
            <View
              pointerEvents="box-none"
              style={[styles.topEndOverlay, chromeTop > 0 && { paddingTop: chromeTop }]}
            >
              {match.group_name ? (
                <Chip
                  renderIcon={c => <GroupsIcon color={c} size={ICON.sm} />}
                  text={match.group_name}
                  tone="neutral"
                  onPhoto
                />
              ) : null}
              {onReport ? (
                <RoundButton size={ROUND_BUTTON_SIZE_SM} onPress={onReport}>
                  <ShieldIcon color={WHITE} fill={WHITE} size={ICON.round} />
                </RoundButton>
              ) : null}
            </View>
          ) : null}

          {/* Two-column overlay at the bottom of the hero photo: left column
              holds the name + chips stack (flex:1, so a long chip wraps its
              text instead of colliding with the buttons); right column holds
              the round-button stack (intrinsic width). A small gap separates
              the groups. pointerEvents="box-none" so taps on empty regions
              fall through to the photo. */}
          <View pointerEvents="box-none" style={[styles.infoOverlay, { paddingBottom: overlayBottomOffset }]}>
            <View pointerEvents="box-none" style={styles.infoLeft}>
              <View pointerEvents="box-none" style={styles.chipsStack}>
                {/* Identity line: name then age, side by side. The name chip
                    carries no icon — it is who this is, not an attribute of
                    them. chipsLine wraps, so a long name pushes the age to a
                    second row rather than squeezing it. */}
                {nameChipText || ageChipText ? (
                  <View style={styles.chipsLine}>
                    {nameChipText ? (
                      <Chip text={nameChipText} tone="neutral" onPhoto />
                    ) : null}
                    {ageChipText ? (
                      <Chip
                        renderIcon={c => <CakeIcon color={c} size={ICON.sm} />}
                        text={ageChipText}
                        tone="neutral"
                        onPhoto
                      />
                    ) : null}
                  </View>
                ) : null}
                {proximityStr ? (
                  <View style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => hasDistance
                        ? (subjectLocationType === 'work' ? <WorkIcon color={c} /> : subjectLocationType === 'home' ? <HomeIcon color={c} /> : <PinIcon color={c} />)
                        : <ClockIcon color={c} />}
                      text={proximityStr}
                      tone="neutral"
                      onPhoto
                      renderTrailing={proximityLive ? () => <PresenceDot /> : undefined}
                    />
                  </View>
                ) : null}
                {familyChipText ? (
                  <View style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => <KidsIcon color={c} />}
                      text={familyChipText}
                      onPhoto
                      onPress={onFamilyTap}
                    />
                  </View>
                ) : null}
              </View>
            </View>

            {sections[0]?.type === 'photo' && (() => {
              const base: CardAction[] = actions ?? [{
                key: 'like',
                icon: <HeartIcon color={WHITE} stroke={WHITE} size={ICON.huge} />,
              }]
              const resolved = base.map(a => ({ ...a, onPress: a.onPress ?? slowScrollToEnd }))
              return resolved.length > 0 ? <CardActionStack actions={resolved} /> : null
            })()}
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
            return (
              <View
                key={section.key}
                style={styles.aboutSection}
                onLayout={bioEditable
                  ? (e => { bioSectionYRef.current = e.nativeEvent.layout.y })
                  : undefined}
              >
                <View style={styles.aboutBubble}>
                  <View style={styles.aboutQuoteOpen}>
                    <QuoteIcon color={BLACK} size={ICON.xxl} />
                  </View>
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} onFocusRequested={onBioFocusRequested} />
                  ) : (
                    <Text style={styles.aboutText}>{section.value}</Text>
                  )}
                  <View style={styles.aboutQuoteClose}>
                    <QuoteIcon color={BLACK} size={ICON.xxl} />
                  </View>
                </View>
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
})


const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: WHITE,
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: MD,
    padding: MD,
  },
  topEndOverlay: {
    position: 'absolute',
    top: 0,
    end: 0,
    padding: MD,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  infoLeft: {
    flex: 1,
    flexDirection: 'column',
  },
  actionStack: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    gap: SM,
  },
  actionItem: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: UNREAD_DOT_INSET,
    end: UNREAD_DOT_INSET,
    width: UNREAD_DOT_SIZE,
    height: UNREAD_DOT_SIZE,
    borderRadius: UNREAD_DOT_SIZE / 2,
    backgroundColor: WHITE,
    borderWidth: 2,
    borderColor: BLACK,
  },
  chipsStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SM,
  },
  chipsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SM,
  },
  aboutSection: {
    alignItems: 'center',
    marginVertical: MD,
  },
  aboutBubble: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: WHITE,
    paddingVertical: MD,
    paddingHorizontal: MD,
    gap: MD,
  },
  aboutQuoteOpen: {
    alignSelf: 'flex-start',
  },
  aboutQuoteClose: {
    alignSelf: 'flex-end',
  },
  aboutText: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: BLACK,
    textAlign: 'center',
  },
  // Layered over aboutText so the editor is visually identical to the static
  // bio when unfocused: full bubble width (so a tap anywhere lands), no
  // intrinsic TextInput padding, no Android font padding skew.
  bioInput: {
    alignSelf: 'stretch',
    padding: 0,
    includeFontPadding: false,
  },
  bioCounter: {
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
    textAlign: 'center',
  },
  bioCounterWarn: { color: PRIMARY },
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
    marginTop: SM,
    marginHorizontal: 0,
    paddingVertical: MD,
    paddingHorizontal: MD,
    borderRadius: RADIUS,
    backgroundColor: BLACK_SOFT,
  },
  kidsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  kidsLabelText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: BLACK,
  },
  kidsValue: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
  },
})
