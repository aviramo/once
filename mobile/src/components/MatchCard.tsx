import React, { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable, Keyboard, Platform } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut, useAnimatedRef, scrollTo, useDerivedValue, cancelAnimation, runOnJS } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import { useBottomInset } from '../hooks/useBottomInset'
import { PullScrollView, PullContext } from './PullPane'

const AnimatedPullScrollView = Animated.createAnimatedComponent(PullScrollView)
import { Text, TextInput } from './AppText'
import { t, isRTL } from '../i18n'
import { ageFromTitle, nameFromTitle } from '../lib/profileTitle'
import { BIO_MIN, BIO_MAX } from '../lib/bio'
import { resolveLocationType, type Profile, type LocationType } from '../stores/userStore'
import { buildFamilySegments } from './FamilyCard'
import { Chip, PinIcon, HomeIcon, WorkIcon, ClockIcon, KidsIcon, PresenceDot } from './Chip'
import { HeartIcon, ShieldIcon, GroupsIcon } from './icons'
import { sharedCircle, useMyFriendCount } from '../lib/communities'
import { RoundButton } from './RoundButton'
import { Button } from './Button'
import { EditableText } from './EditableText'
import { SM, MD, LG, RADIUS, ICON, TEXT, WEIGHT, OVERLAY, ROUND_BUTTON_SIZE, ROUND_BUTTON_SIZE_SM, lh, bottomGap } from '../tokens'
import { PAGE, PHOTO_CHROME, INK, SURFACE, WHITE, INK_DIM, INK_SUBTLE } from '../colors'
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
  /** When true, the shared notification dot rides the button's top-END arc
   *  (the open-chat button uses it to signal new messages). */
  badge?: boolean
}

// One "add this to your profile" chip in the own-profile preview's chip
// column. Same Chip primitive as the fact chips above it — only the tone
// differs — so an add row can never drift from the row it sits under.
export type CardAddChip = {
  key: string
  label: string
  renderIcon: (color: string) => React.ReactNode
  onPress: () => void
}

function CardActionStack({ actions }: { actions: Array<CardAction & { onPress: () => void }> }) {
  return (
    <View style={styles.actionStack}>
      {actions.map(a => (
        <RoundButton key={a.key} bg={a.bg} badge={a.badge} onPress={a.onPress}>
          {a.icon}
        </RoundButton>
      ))}
    </View>
  )
}

// ── Inline bio editing (own-profile preview) ───────────────────────────────
// Replaces the old "tap bio → BottomSheet popup" flow. The bio bubble itself
// becomes the editor: a multiline TextInput styled byte-identically to the
// read-only bio Text, so when it isn't focused it looks exactly like static
// text. Tapping anywhere drops the caret at that character natively. While
// focused, a footer bar under the field carries the char counter and an
// explicit Update button (enabled only on a saveable change) — the ONLY save
// path. Leaving the field without pressing it (keyboard dismissed / tap
// outside / focus lost) discards the edit and reverts to the last committed
// value, same as sub-min input. Nothing is saved on blur.
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
  onPhoto = false,
}: {
  edit: BioEdit
  /** Ask the parent card to scroll this field above the keyboard. */
  onFocusRequested: () => void
  /** When rendered inside the on-photo bio chip (own-profile preview), the
   * field styles itself byte-for-byte like the static remote bio: purple
   * INK, START-aligned, larger. Otherwise it matches the white fallback
   * bubble (own-profile editor with a single photo). */
  onPhoto?: boolean
}) {
  // Thin wrapper over the shared EditableText: pass the bio's min/max, i18n
  // labels and the card's bio styles so the card stays pixel-identical while
  // the draft/commit/Update behavior lives in one place (also used by the group
  // description editor).
  return (
    <EditableText
      value={edit.value}
      saving={edit.saving}
      onCommit={edit.onCommit}
      min={BIO_MIN}
      max={BIO_MAX}
      placeholder={t('bio.placeholder')}
      updateLabel={t('bio.update')}
      minLabel={t('bio.min')}
      // On-photo: omitted, so the editor follows the writing direction exactly
      // like the static bio it must be pixel-identical to. The white fallback
      // bubble is centred text, so its editor is too.
      textAlign={onPhoto ? undefined : 'center'}
      onFocusRequested={onFocusRequested}
      inputStyle={[onPhoto ? styles.photoBioText : styles.aboutText, styles.bioInput]}
      footerStyle={styles.bioFooter}
      hintStyle={styles.bioHint}
    />
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
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: INK_DIM }]} />
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
  /** Drops the proximity chip (distance + last-seen) entirely. Used by the
   * communities profile page: a group member or a friend is opened from a
   * list you already belong to, and neither where they are nor when they were
   * last around is part of what that context reveals (user directive
   * 2026-07-29). `hideTime` only mutes the time half; this drops the chip. */
  hideProximity?: boolean
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
  /** When provided, the shared-circle chip becomes tappable and opens the popup
   * listing everything the pair shares (every mutual friend, every shared
   * group). Absent on the own-profile preview (no chip). */
  onCircleTap?: () => void
  /** When provided (and `self`), the bio bubble becomes an inline editor:
   * tap-to-place-caret, keyboard-aware scroll, auto-save on blur. Replaces
   * the old onBioTap popup. The bio section renders even when the bio is
   * empty in this mode, so the user can add one in place. */
  bioEdit?: BioEdit
  /** Overlay action buttons stacked at the bottom-right of the hero photo,
   * starting at the heart's anchor and growing upward. When omitted, a
   * single heart button is rendered (tapping scrolls to the end of the
   * card). Pass `[]` for a card that carries no round action at all — the
   * own-profile preview, whose adds are `addChips` instead. */
  actions?: CardAction[]
  /** Add-affordances for the own-profile preview, rendered as a COLUMN of
   * chips PINNED to the card's top-END — outside the scroll, level with the
   * sheet's close X and facing it across the card (user directive 2026-07-24).
   * They are deliberately out of the bottom fact-chip column: everything down
   * there states a fact about the profile, an add is a thing to do about it.
   * The `action` tone is what keeps a "do this" from reading as "here is a
   * fact". `chromeInset` is what lines them up with the X. */
  addChips?: CardAddChip[]
  /** An action chip pinned BESIDE the name/age heading at the card's top-END
   * (chat state only). A solid PURPLE tile with the same soft lift shadow the
   * on-photo chips cast — today the "End chat" control, moved here from the
   * chat sheet header (user directive 2026-07-26) so ending the conversation
   * lives on the card, beside whom it ends. */
  headingAction?: { label: string; onPress: () => void }
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
  hideProximity = false,
  onReady,
  topBlock,
  onTopBlockShown,
  footerBlock,
  footerBg,
  onPhotoTap,
  onFamilyTap,
  onCircleTap,
  bioEdit,
  actions,
  addChips,
  headingAction,
  onReport,
  isForKids,
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
  // True while the inline bio field holds focus — suppresses reels paging (so a
  // keyboard-driven scroll isn't snapped to a page boundary) without forking the
  // card's look otherwise.
  const [bioFocused, setBioFocused] = useState(false)
  // ── Tap-to-toggle the on-photo fact chips (user directive 2026-07-26) ───────
  // The fact-chip column (distance, family/kids, shared group) states important
  // info but sits over the face. A tap on the photo fades the whole column out
  // so the portrait is unobscured, and a second tap fades it back — the info is
  // never removed, only one tap away. Gated to remote match cards: the
  // own-profile preview (onPhotoTap set) taps photos to edit them instead, so it
  // keeps its chips fixed. The floating heart/report/name ride ABOVE this and
  // capture their own taps, so only a tap on the open photo toggles. Reset to
  // visible on every profile swap so a hidden state can't carry into card B.
  const chipsToggleable = !onPhotoTap
  const [chipsHidden, setChipsHidden] = useState(false)
  // Mirror of chipsHidden the scroll handler reads without re-subscribing.
  const chipsHiddenRef = useRef(false)
  // ONE progress value drives the whole toggle: 1 = the info set is up (full
  // size), 0 = it is away (zoomed to nothing). It IS the scale — see
  // chipsAnimStyle — so every group in the set leaves and returns on the same
  // frame, and the transition rides the framework's default withTiming curve,
  // an ease-in-out, which is what makes it start and land without a snap.
  const chipsShown = useSharedValue(1)
  const toggleChips = useCallback(() => {
    const next = !chipsHiddenRef.current
    chipsHiddenRef.current = next
    setChipsHidden(next)
    chipsShown.value = withTiming(next ? 0 : 1)
  }, [])
  // Bring the chips back — used both on a fresh profile and whenever the user
  // scrolls onto a different photo (user directive 2026-07-26): a hidden state
  // must never persist past the photo it was toggled on. No-op when visible.
  const revealChips = useCallback(() => {
    if (!chipsHiddenRef.current) return
    chipsHiddenRef.current = false
    setChipsHidden(false)
    chipsShown.value = withTiming(1)
  }, [])
  useEffect(() => {
    chipsHiddenRef.current = false
    setChipsHidden(false)
    chipsShown.value = 1
  }, [match.user_id])
  // ZOOM ONLY — scale 1 → 0 and back, nothing else (user directive 2026-07-29).
  // There is deliberately NO opacity here, and none may be added back: an
  // on-photo chip wears LIFT_SHADOW, whose Android `elevation` shadow is drawn
  // from the view's outline and does NOT inherit an animated opacity from its
  // parent. A fade therefore held every chip's shadow at full strength for the
  // whole transition and popped it off only at the end — a dark ghost of the
  // column that stayed behind and then vanished. A transform has no such hole:
  // the shadow rides the same matrix as the view that casts it, so the tile and
  // its lift leave together.
  // Each group that wears this style sets its own `transformOrigin` in the
  // stylesheet, always the corner it is PINNED to: the fact column and the bio
  // tile into their bottom-START corner, the heading chips into the top-END
  // corner. Never the default centre — a box that spans the photo's width would
  // pull its contents sideways as it shrank, so the zoom would read as a drift,
  // or as the text imploding mid-photo instead of the info set clearing off it.
  const chipsAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chipsShown.value }],
  }))
  // Which full-viewport photo page the scroll is resting on; a change reveals
  // the chips again.
  const photoPageRef = useRef(0)
  // Refs the inline-bio keyboard handling reads from JS callbacks. Declared up
  // here because bioOnSecondPhotoRef is assigned during render (below), before
  // the rest of the keyboard wiring.
  const bioPhotoYRef = useRef(0)          // content-Y of the 2nd photo section
  const kbHeightRef = useRef(0)           // latest keyboard height
  const bioOnSecondPhotoRef = useRef(false)
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
    // The bio is laid over the bottom of the SECOND photo (see render) as the
    // white chip, so photos 1 and 2 sit flush with no band between them
    // (user directive 2026-07-25). This holds for the own-profile preview too:
    // the inline editor renders INSIDE that same chip (user directive
    // 2026-07-25), so a self card looks exactly like a match card. A standalone
    // bubble survives only when there is no second photo to sit on (own-profile
    // editor with a single photo, or a remote bio with one photo).
    const bioAsBubble = photos.length < 2 && (bioEditable || !!match.bio)
    const built: CardSection[] = []
    if (photos.length > 0) built.push(photos[0])
    if (bioAsBubble) built.push({ type: 'bio', value: match.bio ?? '', key: 'bio' })
    for (let i = 1; i < photos.length; i++) built.push(photos[i])
    return built
  }, [match.user_id, match.images, imageUrls, match.bio, bioEditable])

  const photoCount = sections.filter(s => s.type === 'photo').length
  // Key of the SECOND photo — the remote bio is laid over its bottom (white
  // text + shadow, like the chips) instead of a bubble between photos, so photos
  // 1 and 2 sit flush. Null with <2 photos, where the bio falls back to a
  // bubble (see the sections builder).
  const secondPhotoKey = useMemo(() => {
    const keys = sections.filter(s => s.type === 'photo').map(s => s.key)
    return keys[1] ?? null
  }, [sections])
  // The bio rides the bottom of the 2nd photo as the white chip whenever a 2nd
  // photo exists — static text on a remote card, the inline editor on the
  // own-profile preview (bioEditable), which renders even with an empty bio so
  // one can be added in place. Mirrored into a ref for the keyboard-scroll math.
  const bioOnSecondPhoto = !!secondPhotoKey && (bioEditable || !!match.bio)
  bioOnSecondPhotoRef.current = bioOnSecondPhoto
  // Key of the hero section (the first section, expected to be a photo). Used
  // both as its React key and as its snap-offset key below.
  const heroKey = sections[0]?.type === 'photo' ? sections[0].key : 'hero'
  // ── Reels-style paging ─────────────────────────────────────────────────────
  // Photos sit flush (no gaps) and each is a full viewport tall, so `pagingEnabled`
  // makes a single swipe settle straight onto the next photo, like Reels. It's a
  // pure content prop — the native gesture arbitration is unchanged, so the
  // shell's pull-to-skip pan (a downward drag from the top) still wins there: at
  // offset 0 the paged scroll can't move up (bounces are off) and yields to the
  // pull. Disabled only in the own-bio editor, whose sections aren't full pages
  // and whose keyboard-driven scroll must not be snapped to a page boundary.
  // (An earlier `snapToOffsets` attempt broke the skip — its snap-to-start on the
  // 0 offset claimed the top-edge down-drag; `pagingEnabled` has no such offset.)
  // Reels paging is on everywhere now — including the own-profile preview, so it
  // scrolls exactly like a match card (user directive 2026-07-25). It is
  // suppressed ONLY while the inline bio field is focused, so a keyboard-driven
  // scroll isn't snapped to a page boundary mid-edit.
  const pagingAllowed = !bioFocused
  // With a status card on top (invite sent / received / event message) the timer
  // spacer pushes the photos down, so viewport-multiple `pagingEnabled` would
  // land mid-photo (a swipe off the status card shows a sliver of the hero, not
  // the whole photo). In those states we instead snap to the MEASURED section
  // tops: 0 keeps the status card (with its cancel/reply button) reachable, and
  // the hero's measured top lands the FIRST photo in full. Those states carry no
  // pull-to-skip, so the snap machinery owning the top edge is harmless there.
  const sectionYRef = useRef<Map<string, number>>(new Map())
  const [measureTick, setMeasureTick] = useState(0)
  const recordSectionY = useCallback((key: string, y: number) => {
    const rounded = Math.round(y)
    if (sectionYRef.current.get(key) === rounded) return
    sectionYRef.current.set(key, rounded)
    setMeasureTick(t => t + 1)
  }, [])
  const snapOffsets = useMemo(() => {
    const tops = Array.from(sectionYRef.current.values())
    return Array.from(new Set<number>([0, ...tops])).sort((a, b) => a - b)
    // measureTick is the change signal for the ref-held map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureTick])
  // The heart/chat action floats FIXED over the card (never scrolls) — rendered
  // as a pinned overlay after the ScrollView (user directive 2026-07-25). Both
  // the reserved gap on the chip column and that overlay derive from this.
  const showFloatingAction = sections[0]?.type === 'photo' && (actions ? actions.length > 0 : true)
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
  const safeBottomInset = useBottomInset()
  // The first photo runs to the bottom of the card (callers pass bottomInset=0
  // to keep it full-bleed), so the on-photo overlay (name + chips + heart)
  // must clear the home indicator on its own. This offset is shared by the
  // chips AND the heart, so the chips' extra breathing room is NOT added here
  // — it lives on the chip column alone (infoLeft), or the heart rides up with
  // it and leaves its anchored position.
  const overlayBottomOffset = bottomGap(safeBottomInset, MD)
  const ready = effectiveCardH > 0
  const timeIso = match.last_seen
  // Icon = the subject's (B = match) anchor (pin/home/work). The text is a
  // SINGLE merged phrase: anchor-aware distance + relative last-seen (see
  // formatProximity) — distance stays live ("ממך") only when both viewer and
  // subject are 'device', else it reads as anchored to a fixed address. Either
  // half may be missing and the chip still renders with the other one — only a
  // phrase with NEITHER half comes back empty, and then the chip is dropped.
  const subjectLocationType = resolveLocationType(match)
  const viewerType: LocationType = viewerLocationType ?? 'device'
  const hasDistance = match.distance != null && !isNaN(match.distance)
  const proximityStr = hideProximity
    ? ''
    : formatProximity(match.distance, timeIso, match.is_male, viewerType, subjectLocationType, hideTime)
  const proximityLive = isDistanceHere(match.distance) || (!hideTime && isLastSeenJustNow(timeIso))
  // Name and age are the two halves of the server's combined `title`, and both
  // ride the first chips line. The name used to live in the home TAB; that
  // strip was deleted with the pager (2026-07-19), which left the card showing
  // a person with no name at all.
  const nameChipText = nameFromTitle(match.title)
  const age = ageFromTitle(match.title)
  // Name and age live in ONE chip, as bare "נטע, 45" — no gendered בן/בת prefix
  // (2026-07-24). Either half can be missing — an unnamed match, or one with no
  // birth date — so the comma is applied by joining the present parts, never
  // leaving a stray separator behind.
  const identityChipText = [nameChipText, age].filter(Boolean).join(', ')

  // The one circle chip: which shared circle to name and how many others there
  // are. My friends is a circle like any group, and the SMALLEST one wins — so
  // the card needs the size of my own friends circle, read off my summary here
  // rather than threaded through every call site.
  const myFriends = useMyFriendCount()
  const circle = useMemo(() => sharedCircle(match, myFriends), [match.group_name, match.group_members, match.group_extra, match.friend_name, match.is_male, myFriends])

  // Several facts in one label; Chip's phraseWrap decides where it breaks.
  const familySegments = useMemo(
    () => buildFamilySegments(match.family, isForKids, self, match.is_male),
    [match.family, isForKids, self, match.is_male],
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
  // Guards the scroll-to-top on a watching → waiting transition so it fires
  // exactly once per transition. Separate from `animatedRef` (which gates the
  // measurement-dependent slide-in) because the scroll fires FIRST, before the
  // topBlock measures — see the transition effect below.
  const scrolledForTopBlockRef = useRef(false)
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
    // Defer one tick so the focus-triggered layout/resize settles first.
    setTimeout(() => {
      let target: number
      if (bioOnSecondPhotoRef.current) {
        // Bio on the 2nd photo: scroll so that photo's BOTTOM (where the bio
        // chip sits) lands just above the keyboard. The extra kb-height bottom
        // padding (kbPad) makes room to reach it. photoHeight ~= viewport.
        const photoBottom = bioPhotoYRef.current + photoHeight
        const visible = Math.max(1, viewportHRef.current - kbHeightRef.current)
        target = Math.max(0, photoBottom - visible + MD)
      } else {
        // Bubble fallback (single photo): land it a hair below the viewport top.
        target = Math.max(0, bioSectionYRef.current - MD)
      }
      scrollRef.current?.scrollTo({ y: target, animated: true })
    }, 60)
  }, [photoHeight])
  const onBioFocusRequested = useCallback(() => {
    bioFocusedRef.current = true
    setBioFocused(true)
    scrollBioIntoView()
  }, [scrollBioIntoView])
  // While the bio editor is focused, a tap outside it (a photo, the family
  // chip) is CONSUMED to close the editor and does nothing else — no photo
  // popup, no family sheet. Only a second tap, now that editing is closed,
  // performs the tap's real action. Without this the editor stays open AND
  // the tapped affordance fires at once, which reads as a confusing
  // double-action. bioFocusedRef stays true until the keyboard actually
  // hides, so it's still set at the moment this outside tap lands.
  const swallowTapWhileEditing = useCallback(() => {
    if (!bioFocusedRef.current) return false
    Keyboard.dismiss()
    return true
  }, [])
  const handlePhotoTap = useCallback((imageIndex: number) => {
    if (swallowTapWhileEditing()) return
    onPhotoTap?.(imageIndex)
  }, [swallowTapWhileEditing, onPhotoTap])
  const handleFamilyTap = useCallback(() => {
    if (swallowTapWhileEditing()) return
    onFamilyTap?.()
  }, [swallowTapWhileEditing, onFamilyTap])
  const handleCircleTap = useCallback(() => {
    if (swallowTapWhileEditing()) return
    onCircleTap?.()
  }, [swallowTapWhileEditing, onCircleTap])
  // The circle chip lives INSIDE the card's scroll, so a plain Pressable onPress
  // waits on the scroll / pull-to-skip pan before firing — a visible lag before
  // the popup opens. A native RNGH tap recognizes immediately (and still yields
  // to a real drag, which becomes the pull-to-skip pan). runOnJS so the JS
  // handler fires directly. Disabled while the chips are hidden so a reveal-tap
  // still passes through.
  const circleTapGesture = useMemo(
    () => Gesture.Tap().runOnJS(true).onEnd((_e, success) => { if (success) handleCircleTap() }),
    [handleCircleTap],
  )
  useEffect(() => {
    if (!bioEditable) return
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, e => {
      const h = e.endCoordinates?.height ?? 0
      kbHeightRef.current = h
      setKbHeight(h)
      // On Android the window resizes after the keyboard shows; re-assert the
      // scroll target so the field ends up correctly placed post-reflow.
      if (bioFocusedRef.current) scrollBioIntoView()
    })
    const hideSub = Keyboard.addListener(hideEvt, () => {
      bioFocusedRef.current = false
      setBioFocused(false)
      kbHeightRef.current = 0
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
    // Drop the previous card's measured section tops so its snap offsets can't
    // carry into the new card before this one re-measures.
    sectionYRef.current.clear()
    setMeasureTick(t => t + 1)
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
      scrolledForTopBlockRef.current = false
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
    // watching → waiting transition (e.g. the invite popup just sent). Two
    // coherent motions back-to-back: scroll up, then the timer descends.
    //
    // Scroll the card to the top the INSTANT the topBlock appears — the same
    // React commit that drops the invite popup — WITHOUT waiting for the
    // block to measure. Gating the scroll on `topBlockHeight` (its onLayout
    // round-trip) made it visibly lag the popup's dismissal: on Android that
    // layout pass is starved until the dismissing popup Modal finishes tearing
    // down, so the user saw the popup fall, a pause, then the scroll, and read
    // the gap as a freeze. The scroll target is always y=0, so it needs no
    // measurement. The slide-in below still waits for the measured height.
    //
    // The scroll uses the native ScrollView animation (UI thread). The
    // earlier rAF-based easing competed with the JS thread for cycles
    // during the post-press React commit and looked stuttery.
    if (!scrolledForTopBlockRef.current) {
      scrolledForTopBlockRef.current = true
      if (scrollYRef.current > 0) {
        scrollRef.current?.scrollTo({ y: 0, animated: true })
      }
    }
    if (animatedRef.current || topBlockHeight === 0) return
    animatedRef.current = true
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
        // The one surface that opts OUT of PullScrollView's dismiss-on-drag: the
        // bio editor lives INSIDE this reel, and paging is suspended for as long
        // as it is focused. A drag that closed the keyboard would blur the field
        // and hand paging back on the same frame, snapping the photo out from
        // under the finger mid-gesture. The bio commits from its own control.
        keyboardDismissMode="none"
        // Reels paging. Without a status card: `pagingEnabled` (full-viewport
        // photos from offset 0; leaves the pull-to-skip untouched). With a status
        // card: snap to the measured section tops so a swipe lands the first photo
        // in full despite the timer spacer (see the note by `snapOffsets`).
        pagingEnabled={pagingAllowed && !hasTopBlock}
        snapToOffsets={pagingAllowed && hasTopBlock && snapOffsets.length > 1 ? snapOffsets : undefined}
        snapToAlignment="start"
        // True Reels feel: ONE photo per swipe, always. Android's paging carries
        // fling momentum across several pages on a fast flick, so a quick swipe
        // skipped photos and settled two or three ahead. disableIntervalMomentum
        // clamps every fling to the single adjacent snap point regardless of
        // velocity, so a swipe settles on the NEXT photo and never skips it
        // (user directive 2026-07-26). decelerationRate 'fast' lands that snap
        // crisply. Applies to both the pagingEnabled and snapToOffsets branches.
        disableIntervalMomentum
        decelerationRate="fast"
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y
          scrollYRef.current = y
          // Reveal the toggled-off chips the moment the scroll lands on a
          // different photo page, so a hidden state never carries across photos.
          if (chipsToggleable && photoHeight > 0) {
            const page = Math.round(y / photoHeight)
            if (page !== photoPageRef.current) {
              photoPageRef.current = page
              revealChips()
            }
          }
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
              {/* The reserved band is painted INK, not left transparent:
                  every topBlock the app renders is a status card on the light
                  PAGE, so a transparent gap would expose the backdrop as a stripe
                  above it. If a topBlock ever ships a different background this
                  needs to become a prop alongside `footerBg`. */}
              <View style={chromeBottom > 0 ? { paddingTop: chromeBottom, backgroundColor: PAGE } : undefined}>
                {effectiveTopBlock}
              </View>
            </Animated.View>
            <Animated.View key="top-spacer" pointerEvents="none" style={animatedSpacerStyle} />
          </>
        )}
        {/* Hero: always the first section (expected to be a photo) */}
        <Animated.View
          key={heroKey}
          style={{ height: photoHeight }}
          onLayout={e => recordSectionY(heroKey, e.nativeEvent.layout.y)}
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
              {onPhotoTap ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => handlePhotoTap(sections[0].type === 'photo' ? sections[0].imageIndex : -1)}
                />
              ) : chipsToggleable ? (
                // Remote match card: a tap on the open photo toggles the
                // fact-chip column so the face can be seen unobscured.
                <Pressable style={StyleSheet.absoluteFill} onPress={toggleChips} />
              ) : null}
            </>
          )}

          {/* Bottom-of-hero overlay: the fact-chip stack. The name/age heading
              no longer lives here — it is pinned FIXED to the card's top-END
              (opposite the shell's hamburger), out of the scroll (see the
              top-END column after the ScrollView). The heart/chat action also
              floats fixed after the ScrollView so it never scrolls; the chip
              column reserves a gap on the END side (floatingActionReserve) so a
              long chip wraps before reaching it. pointerEvents="box-none" so
              taps on empty regions fall through to the photo. */}
          <View
            // box-none so taps on empty regions fall through to the photo's
            // toggle Pressable. On a toggleable (remote) card the non-interactive
            // fact lines below ALSO pass through (pointerEvents 'none') so a tap
            // on them still hides/reveals the column; only an interactive chip
            // (the group chip's popup, the own-profile family editor) captures
            // its own tap. The own-profile preview isn't toggleable, so its
            // lines stay box-none and its chips are tappable.
            pointerEvents="box-none"
            style={[styles.infoOverlay, { paddingBottom: overlayBottomOffset }]}
          >
            <View pointerEvents="box-none" style={[styles.infoLeft, showFloatingAction && styles.floatingActionReserve]}>
              {/* The toggle's fade+zoom rides HERE and not on the overlay above:
                  this is the box that hugs the chips, so its bottom-START origin
                  is the chips' own corner. On the full-width overlay the same
                  scale would have dragged the column toward the middle of the
                  screen instead of shrinking it in place. */}
              <Animated.View pointerEvents="box-none" style={[styles.chipsStack, chipsAnimStyle]}>
                {proximityStr ? (
                  <View pointerEvents={chipsToggleable ? 'none' : 'box-none'} style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => hasDistance
                        ? (subjectLocationType === 'work' ? <WorkIcon color={c} /> : subjectLocationType === 'home' ? <HomeIcon color={c} /> : <PinIcon color={c} />)
                        : <ClockIcon color={c} />}
                      text={proximityStr}
                      tone="neutral"
                      onPhoto
                      renderTrailing={proximityLive ? (c => <PresenceDot color={c} />) : undefined}
                    />
                  </View>
                ) : null}
                {familySegments.length ? (
                  <View pointerEvents={chipsToggleable ? 'none' : 'box-none'} style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => <KidsIcon color={c} />}
                      segments={familySegments}
                      onPhoto
                      onPress={onFamilyTap ? handleFamilyTap : undefined}
                    />
                  </View>
                ) : null}
                {/* The circle we share: the last fact line, under family/kids.
                    ONE chip for every kind of connection (user directive
                    2026-07-29) — a shared group and a mutual friend answer the
                    same question, so "my friends" is ranked among the groups as
                    a group and the SMALLEST circle is the one named (the rule
                    lives in lib/communities.ts → sharedCircle). "+N" counts the
                    other circles; tapping lists them all. Same on-photo tile as
                    the chips above it, wearing the circles feature's own
                    interlaced-rings mark. Interactive via a native RNGH tap (not
                    the Chip's Pressable) so the popup opens the instant it's
                    tapped, without waiting on the scroll/pull pan. 'auto' so the
                    gesture receives the touch while the chips are visible; when
                    hidden it drops to 'none' so a reveal-tap passes through. */}
                {circle ? (
                  <GestureDetector gesture={circleTapGesture}>
                    <View
                      pointerEvents={onCircleTap && !chipsHidden ? 'auto' : (chipsToggleable ? 'none' : 'box-none')}
                      style={styles.chipsLine}
                    >
                      <Chip
                        renderIcon={c => <GroupsIcon color={c} size={ICON.sm} />}
                        text={circle.label}
                        plusCount={circle.extra}
                        onPhoto
                      />
                    </View>
                  </GestureDetector>
                ) : null}
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        {/* Rest of sections rendered in items order */}
        {sections.slice(1).map((section) => {
          if (section.type === 'photo') return (
            <Animated.View
              key={section.key}
              exiting={onPhotoTap ? FadeOut.duration(220) : undefined}
              onLayout={e => {
                recordSectionY(section.key, e.nativeEvent.layout.y)
                if (bioEditable && section.key === secondPhotoKey) {
                  bioPhotoYRef.current = e.nativeEvent.layout.y
                }
              }}
            >
              <LoadingImage
                source={section.url}
                hash={section.hash}
                style={[styles.extraPhoto, { height: photoHeight }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                onSettle={onImageSettle}
              />
              {onPhotoTap ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => handlePhotoTap(section.imageIndex)}
                />
              ) : chipsToggleable ? (
                // Same toggle as the hero: a tap on this photo fades its bio chip
                // out so the image is unobscured, and taps it back.
                <Pressable style={StyleSheet.absoluteFill} onPress={toggleChips} />
              ) : null}
              {/* Bio as a big WHITE chip floated at the bottom of the second
                  photo, inset on every side. Its END inset clears the floating
                  heart (so it is never where the heart is). On
                  a remote card it fades with the same tap-toggle as the fact
                  chips (user directive 2026-07-26): the info clears off whichever
                  photo the user is on. */}
              {section.key === secondPhotoKey && bioOnSecondPhoto ? (
                <Animated.View
                  // Interactive on the own-profile preview so the inline editor
                  // inside catches taps; on a remote card it's non-interactive so
                  // a tap falls through to the photo's toggle Pressable.
                  pointerEvents={bioEditable ? 'auto' : 'none'}
                  style={[
                    styles.photoBioCard,
                    {
                      end: showFloatingAction ? ROUND_BUTTON_SIZE + MD + MD : MD,
                      bottom: overlayBottomOffset + LG,
                    },
                    chipsToggleable && chipsAnimStyle,
                  ]}
                >
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} onFocusRequested={onBioFocusRequested} onPhoto />
                  ) : (
                    <Text style={styles.photoBioText}>{match.bio}</Text>
                  )}
                </Animated.View>
              ) : null}
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
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} onFocusRequested={onBioFocusRequested} />
                  ) : (
                    <Text style={styles.aboutText}>{section.value}</Text>
                  )}
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
      {/* The heart/chat action, pinned over the card so it never scrolls: a
          sibling of the ScrollView, anchored bottom-END at the same offset it
          used to sit at inside the hero. The chip column reserves a matching
          gap (infoLeftReserve) so nothing scrolls under it. */}
      {showFloatingAction ? (
        <View pointerEvents="box-none" style={[styles.actionStackFixed, { bottom: overlayBottomOffset }]}>
          {(() => {
            const base: CardAction[] = actions ?? [{
              key: 'like',
              icon: <HeartIcon color={WHITE} stroke={WHITE} size={ICON.huge} />,
            }]
            const resolved = base.map(a => ({ ...a, onPress: a.onPress ?? slowScrollToEnd }))
            return <CardActionStack actions={resolved} />
          })()}
        </View>
      ) : null}
      {/* Top-END fixed column: the name/age heading, pinned opposite the
          shell's hamburger (top-START) and OUT of the scroll so it stays put
          while the profile scrolls under it (user directive 2026-07-25). On the
          own-profile preview the add-chips follow it in the same column. Its
          white tile matches the round overlay buttons — same PHOTO_CHROME. */}
      {identityChipText || onReport || headingAction || (addChips && addChips.length > 0) ? (
        <View
          pointerEvents="box-none"
          style={[styles.topEndFixed, chromeTop > 0 && { paddingTop: chromeTop }]}
        >
          {identityChipText || onReport || headingAction ? (
            // The heading row: the name/age chip pinned at the END, with the
            // optional action chip (chat's "End") beside it on the START side.
            <View style={styles.headingRow}>
              {headingAction ? (
                // "End chat" fades with the rest of the info set on a toggleable
                // card (user directive 2026-07-26). While hidden its taps are
                // off, so a tap where it sat reveals the overlays again instead
                // of ending the chat by accident.
                <Animated.View
                  pointerEvents={chipsToggleable && chipsHidden ? 'none' : 'auto'}
                  style={[styles.headingChipWrap, chipsToggleable && chipsAnimStyle]}
                >
                  <Chip
                    tone="solid"
                    onPhoto
                    text={headingAction.label}
                    onPress={headingAction.onPress}
                  />
                </Animated.View>
              ) : null}
              {identityChipText || onReport ? (
                // The name/age chip fades with the fact chips on a toggleable
                // (remote) card (user directive 2026-07-26): a tap on the photo
                // clears the whole info set — facts AND identity — so the face is
                // fully unobscured. flexShrink on the wrapper keeps the chip's
                // shrink/wrap chain intact through the extra View; pointerEvents
                // none on toggleable cards lets a tap here fall through to the
                // photo instead of the chip swallowing it. The own-profile
                // preview (not toggleable) is unaffected — opacity stays 1.
                // The chip now HOLDS the report flag, so it can no longer be
                // touch-transparent: it stays live while visible and carries the
                // photo's toggle itself (Chip's own onPress — the tile is the
                // Pressable, so the flexShrink chain survives). The flag is a
                // nested Pressable and wins the responder over it. While hidden
                // everything goes off, so a tap there reveals instead of acting.
                <Animated.View
                  pointerEvents={chipsToggleable && chipsHidden ? 'none' : 'auto'}
                  style={[styles.identityChipWrap, chipsToggleable && chipsAnimStyle]}
                >
                  <Chip
                    text={identityChipText}
                    tone="neutral"
                    onPhoto
                    // Regular weight like every other chip (user directive
                    // 2026-07-29). Its POSITION is what makes it the heading —
                    // pinned to the card's top-END, alone up there opposite the
                    // shell's hamburger — so the weight was saying a second time
                    // what the corner already says.
                    // The report flag rides INSIDE the heading chip as a small
                    // TRAILING glyph (user directive 2026-07-29), replacing the
                    // round button that used to sit at the bottom-START of the
                    // last photo: reporting is a footnote to "who is this", not
                    // a second card-level control competing with the heart. Only
                    // the glyph opens the report — the rest of the tile keeps
                    // the photo's chip-toggle.
                    renderTrailing={onReport ? c => <ShieldIcon color={c} fill={c} size={ICON.sm} /> : undefined}
                    onTrailingPress={onReport}
                    onPress={chipsToggleable ? toggleChips : undefined}
                  />
                </Animated.View>
              ) : null}
            </View>
          ) : null}
          {addChips?.map(c => (
            <Chip
              key={c.key}
              renderIcon={c.renderIcon}
              text={c.label}
              tone="action"
              onPhoto
              onPress={c.onPress}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
})


const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: SURFACE,
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
    backgroundColor: PAGE,
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
  // Fixed top-END column: the name/age heading (always) with the own-profile
  // add chips beneath it. Chrome, not content — a sibling of the scroll view
  // (not a layer inside the hero), so it stays pinned to the card's top-END
  // while the profile scrolls under it, opposite the shell's hamburger / level
  // with a sheet's close X. Spans the full width so a long label wraps instead
  // of overflowing; alignItems keeps the column parked on the END edge.
  topEndFixed: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    padding: MD,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: SM,
  },
  // The name/age heading row. alignSelf:'stretch' so it spans the fixed
  // column's full width, letting justifyContent push the pair to the END edge
  // and a long name chip flexShrink/wrap before crowding the action chip beside
  // it. The action chip (chat's "End") leads, so under RTL the row mirrors and
  // it lands on the correct physical side automatically.
  headingRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: SM,
  },
  // Wraps the name/age chip so it can fade with the tap-toggle. flexShrink keeps
  // the chip's shrink/wrap chain intact through the extra View (a plain wrapper
  // would otherwise hide the shrink hint and let a long name overflow the row).
  identityChipWrap: {
    flexShrink: 1,
    // Both heading chips zoom into the top-END corner they are pinned to, so
    // the pair pulls back into that corner as one gesture rather than each
    // shrinking around its own middle. END is physically LEFT under RTL.
    transformOrigin: isRTL ? 'left top' : 'right top',
  },
  headingChipWrap: {
    transformOrigin: isRTL ? 'left top' : 'right top',
  },
  infoLeft: {
    flex: 1,
    flexDirection: 'column',
    // Breathing room under the chip column only. Deliberately here and not on
    // the shared overlay padding: the heart is anchored to the card's bottom
    // edge and must not move with the chips.
    marginBottom: LG,
  },
  // Reserve the END lane for the fixed floating action button, so on-photo text
  // (the chip column AND the second-photo bio) wraps before reaching it — same
  // footprint the in-flow action stack used to occupy: button width + old gap.
  floatingActionReserve: {
    marginEnd: ROUND_BUTTON_SIZE + MD,
  },
  actionStack: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    gap: SM,
  },
  // The floating heart/chat action: pinned to the card's bottom-END so it never
  // scrolls. `bottom` is set inline (overlayBottomOffset) to match the heart's
  // old distance off the photo edge.
  actionStackFixed: {
    position: 'absolute',
    end: MD,
    alignItems: 'center',
  },
  // Gap between the frosted-glass chips (name + fact lines). SM keeps each
  // frosted label a distinct, readable pill without the block feeling loose.
  chipsStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SM,
    // The anchor the tap-toggle's zoom collapses into: the corner the fact
    // column actually lives in. transformOrigin is PHYSICAL (there is no
    // `start`), so the horizontal half follows the app's reading direction the
    // same way every other RTL flip here does. The box hugs the chips
    // vertically, so `bottom` is the last chip's own baseline edge.
    transformOrigin: isRTL ? 'right bottom' : 'left bottom',
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
  // Bio as a big WHITE chip floated at the bottom of the second photo, inset on
  // every side (`start` here; `end` + `bottom` set inline so the END inset can
  // clear the floating heart and the bottom inset can clear the report). Fully
  // rounded like an oversized chip, padded on all sides. It is the SAME white
  // tile as every other on-photo chip and round button (PHOTO_CHROME), just
  // oversized — user directive 2026-07-28.
  photoBioCard: {
    position: 'absolute',
    start: MD,
    backgroundColor: PHOTO_CHROME,
    borderRadius: RADIUS,
    padding: MD,
    // Same corner the fact column collapses into (user directive 2026-07-29):
    // the bio used to zoom around its own centre, which on a tile this wide read
    // as the text imploding in the middle of the photo rather than the info set
    // clearing off it. Anchored bottom-START it withdraws into the corner it is
    // pinned to, so both bottom groups leave toward the same point.
    transformOrigin: isRTL ? 'right bottom' : 'left bottom',
  },
  // No textAlign: the bio follows the app's writing direction (TEXT_START in
  // src/fonts.ts) and lands on the START edge of the chip. It used to say
  // textAlign:'left', which is only "start" once RN flips it — and that flip
  // depends on the native view's layout direction, which on iOS left the bio
  // physically LEFT inside an RTL card.
  // The body size (user directive 2026-07-29), one rank down from where it was.
  // The bio is a PARAGRAPH, and `lg` is the heading rank — at 20dp the oversized
  // white tile read as a statement shouted over the photo and stood a whole step
  // above the fact chips beside it, which say things about the same person. At
  // `md` it matches every other on-photo chip, and it matches the fallback bubble
  // (`aboutText`) that renders the same bio when there is no second photo.
  photoBioText: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: INK,
  },
  // Fallback bio bubble — only the own-profile editor and a bio with no second
  // photo reach it (the remote bio is on-photo, above). Plain white card.
  aboutBubble: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: SURFACE,
    paddingVertical: MD,
    paddingHorizontal: MD,
    gap: MD,
  },
  aboutText: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: INK,
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
  // Footer bar under the editor: the minimum-length hint on the start edge,
  // Update button on the end edge (flips under RTL). Full bubble width so it
  // reads as the editor's own toolbar rather than floating centered text.
  bioFooter: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: MD,
    marginTop: MD,
  },
  bioHint: {
    fontSize: TEXT.md,
    color: INK_SUBTLE,
  },
  extraPhoto: {
    width: '100%',
    backgroundColor: PAGE,
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
    backgroundColor: PAGE,
  },
  kidsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  kidsLabelText: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
    color: INK,
  },
  kidsValue: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
  },
})
