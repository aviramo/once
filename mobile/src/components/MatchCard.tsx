import React, { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable, Keyboard, Platform } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut, useAnimatedRef, scrollTo, useDerivedValue, cancelAnimation, runOnJS } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PullScrollView, PullContext } from './PullPane'

const AnimatedPullScrollView = Animated.createAnimatedComponent(PullScrollView)
import { Text, TextInput } from './AppText'
import { t } from '../i18n'
import { ageFromTitle, nameFromTitle } from '../lib/profileTitle'
import { BIO_MIN, BIO_MAX, normalizeBio } from '../lib/bio'
import { resolveLocationType, type Profile, type LocationType } from '../stores/userStore'
import type { FamilyData } from '../lib/family'
import { buildFamilyChipText } from './FamilyCard'
import { Chip, PinIcon, HomeIcon, WorkIcon, ClockIcon, KidsIcon, PresenceDot } from './Chip'
import { HeartIcon, ShieldIcon, GroupsIcon } from './icons'
import { RoundButton } from './RoundButton'
import { Button } from './Button'
import { SM, MD, LG, RADIUS, ICON, TEXT, WEIGHT, STROKE, OVERLAY, ROUND_BUTTON_SIZE, ROUND_BUTTON_SIZE_SM, lh } from '../tokens'
import { BG, INK, SURFACE, BLACK, WHITE, GREEN, PRIMARY, BLACK_SOFT, BLACK_MID, BLACK_STRONG, BIO_INK } from '../colors'
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

// One "add this to your profile" chip in the own-profile preview's chip
// column. Same Chip primitive as the fact chips above it — only the tone
// differs — so an add row can never drift from the row it sits under.
export type CardAddChip = {
  key: string
  label: string
  renderIcon: (color: string) => React.ReactNode
  onPress: () => void
}

// Minimal unread marker. Sized/placed to sit ON the round button's upper-END
// arc (~11px in from each corner of the 76dp button), so it reads as attached
// to the button rather than floating in the empty square corner. A solid GREEN
// disc inside a WHITE ring: the ring is what separates it from the white
// button below and from any photo behind it, and the brand orange keeps the
// marker in the app's "good news" hue (a waiting message is news, not a
// warning) and matches the chat glyph on the button it rides.
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
  /** When rendered inside the on-photo beige chip (own-profile preview), the
   * field styles itself byte-for-byte like the static remote bio: purple
   * BIO_INK, START-aligned, larger. Otherwise it matches the white fallback
   * bubble (own-profile editor with a single photo). */
  onPhoto?: boolean
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
  // A real, saveable change: normalized draft differs from the committed
  // value and clears the minimum. Drives the Update button's enabled state —
  // reading the ref during render is fine, `draft` is what re-renders us.
  const dirty = normalizeBio(draft) !== normalizeBio(committedRef.current)
  const canSave = !belowMin && dirty && !saving

  // The save routine, fired only by the Update button (never on blur).
  const commit = useCallback(() => {
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

  // Leaving the field without pressing Update discards the edit: revert the
  // draft to the last committed value. Only the Update button saves.
  const handleBlur = useCallback(() => {
    setFocused(false)
    setDraft(committedRef.current)
  }, [])

  // The only save path: commit, then drop the keyboard. commit() sets
  // committedRef to the new value, so the blur that follows reverts to it
  // (a no-op) rather than throwing the fresh save away.
  const handleUpdate = useCallback(() => {
    commit()
    Keyboard.dismiss()
  }, [commit])

  return (
    <>
      <TextInput
        style={[onPhoto ? styles.photoBioText : styles.aboutText, styles.bioInput]}
        value={draft}
        onChangeText={v => setDraft(v.slice(0, BIO_MAX))}
        maxLength={BIO_MAX}
        multiline
        scrollEnabled={false}
        textAlign={onPhoto ? 'left' : 'center'}
        textAlignVertical="top"
        placeholder={t('bio.placeholder')}
        placeholderTextColor={BLACK_MID}
        editable={!saving}
        onFocus={() => { setFocused(true); onFocusRequested() }}
        onBlur={handleBlur}
      />
      {focused ? (
        <View style={styles.bioFooter}>
          <Text style={[styles.bioCounter, !belowMin && remaining < 20 && styles.bioCounterWarn]}>
            {belowMin ? t('bio.min') : remaining}
          </Text>
          <Button
            label={t('bio.update')}
            onPress={handleUpdate}
            size="md"
            disabled={!canSave}
          />
        </View>
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
  addChips,
  headingAction,
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
  // True while the inline bio field holds focus — suppresses reels paging (so a
  // keyboard-driven scroll isn't snapped to a page boundary) without forking the
  // card's look otherwise.
  const [bioFocused, setBioFocused] = useState(false)
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
    // beige chip, so photos 1 and 2 sit flush with no band between them (user
    // directive 2026-07-25). This holds for the own-profile preview too: the
    // inline editor renders INSIDE that same beige chip (user directive
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
  // Key of the LAST photo section — the report button rides the bottom-center
  // of that photo (user directive 2026-07-25), not the hero's top-END. When
  // there is a single photo this resolves to the hero, so a one-photo profile
  // still carries the report affordance.
  const lastPhotoKey = useMemo(() => {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].type === 'photo') return sections[i].key
    }
    return null
  }, [sections])
  // Key of the SECOND photo — the remote bio is laid over its bottom (white
  // text + shadow, like the chips) instead of a bubble between photos, so photos
  // 1 and 2 sit flush. Null with <2 photos, where the bio falls back to a
  // bubble (see the sections builder).
  const secondPhotoKey = useMemo(() => {
    const keys = sections.filter(s => s.type === 'photo').map(s => s.key)
    return keys[1] ?? null
  }, [sections])
  // The bio rides the bottom of the 2nd photo as the beige chip whenever a 2nd
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
  const { bottom: safeBottomInset } = useSafeAreaInsets()
  // The first photo runs to the bottom of the card (callers pass bottomInset=0
  // to keep it full-bleed), so the on-photo overlay (name + chips + heart)
  // must clear the home indicator on its own. This offset is shared by the
  // chips AND the heart, so the chips' extra breathing room is NOT added here
  // — it lives on the chip column alone (infoLeft), or the heart rides up with
  // it and leaves its anchored position.
  const overlayBottomOffset = Math.max(safeBottomInset, MD)
  // Report affordance: the same round primitive as the hero heart (full
  // ROUND_BUTTON_SIZE, huge glyph), kept GREEN, centered along the bottom of
  // the LAST photo. Rendered on whichever photo section is last so it reads as
  // "having seen the whole profile, flag it" rather than sitting in the shell
  // chrome. Omitted for the own-profile preview (no onReport).
  const renderReportOverlay = () => onReport ? (
    <View pointerEvents="box-none" style={[styles.reportOverlay, { paddingBottom: overlayBottomOffset }]}>
      <RoundButton onPress={onReport}>
        <ShieldIcon color={GREEN} fill={GREEN} size={ICON.huge} />
      </RoundButton>
    </View>
  ) : null
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
  // Name and age live in ONE chip, as bare "נטע, 45" — no gendered בן/בת prefix
  // (2026-07-24). Either half can be missing — an unnamed match, or one with no
  // birth date — so the comma is applied by joining the present parts, never
  // leaving a stray separator behind.
  const identityChipText = [nameChipText, age].filter(Boolean).join(', ')

  // Several facts in one label; Chip's phraseWrap decides where it breaks.
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
        // Bio on the 2nd photo: scroll so that photo's BOTTOM (where the beige
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
        // Reels paging. Without a status card: `pagingEnabled` (full-viewport
        // photos from offset 0; leaves the pull-to-skip untouched). With a status
        // card: snap to the measured section tops so a swipe lands the first photo
        // in full despite the timer spacer (see the note by `snapOffsets`).
        pagingEnabled={pagingAllowed && !hasTopBlock}
        snapToOffsets={pagingAllowed && hasTopBlock && snapOffsets.length > 1 ? snapOffsets : undefined}
        snapToAlignment="start"
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
                  every topBlock the app renders is a status card on the light
                  BG, so a transparent gap would expose the backdrop as a stripe
                  above it. If a topBlock ever ships a different background this
                  needs to become a prop alongside `footerBg`. */}
              <View style={chromeBottom > 0 ? { paddingTop: chromeBottom, backgroundColor: BG } : undefined}>
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
              {onPhotoTap && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => handlePhotoTap(sections[0].type === 'photo' ? sections[0].imageIndex : -1)}
                />
              )}
            </>
          )}

          {/* Report rides the bottom-center of the LAST photo, not the shell
              chrome. When the profile has a single photo the hero IS the last
              photo, so it carries the report here; otherwise it lands on the
              trailing photo section below. Top-START/END are left to the shell
              (home's hamburger, a sheet's close X). */}
          {sections[0]?.type === 'photo' && sections[0].key === lastPhotoKey
            ? renderReportOverlay()
            : null}

          {/* Bottom-of-hero overlay: the fact-chip stack. The name/age heading
              no longer lives here — it is pinned FIXED to the card's top-END
              (opposite the shell's hamburger), out of the scroll (see the
              top-END column after the ScrollView). The heart/chat action also
              floats fixed after the ScrollView so it never scrolls; the chip
              column reserves a gap on the END side (floatingActionReserve) so a
              long chip wraps before reaching it. pointerEvents="box-none" so
              taps on empty regions fall through to the photo. */}
          <View pointerEvents="box-none" style={[styles.infoOverlay, { paddingBottom: overlayBottomOffset }]}>
            <View pointerEvents="box-none" style={[styles.infoLeft, showFloatingAction && styles.floatingActionReserve]}>
              <View pointerEvents="box-none" style={styles.chipsStack}>
                {proximityStr ? (
                  <View style={styles.chipsLine}>
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
                {familyChipText ? (
                  <View style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => <KidsIcon color={c} />}
                      text={familyChipText}
                      onPhoto
                      onPress={onFamilyTap ? handleFamilyTap : undefined}
                    />
                  </View>
                ) : null}
                {/* Shared group: the last fact line, under family/kids. Same
                    on-photo tile as the chips above it. Moved here from the bio
                    bubble (2026-07-25) at the user's request so every fact reads
                    together on the photo. */}
                {match.group_name ? (
                  <View style={styles.chipsLine}>
                    <Chip
                      renderIcon={c => <GroupsIcon color={c} size={ICON.sm} />}
                      text={match.group_name}
                      onPhoto
                    />
                  </View>
                ) : null}
              </View>
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
              {onPhotoTap && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => handlePhotoTap(section.imageIndex)}
                />
              )}
              {/* Bio as a big BEIGE chip floated at the bottom of the second
                  photo, inset on every side. Its END inset clears the floating
                  heart (so it is never where the heart is); its bottom inset
                  lifts it above the report button when this photo carries it. */}
              {section.key === secondPhotoKey && bioOnSecondPhoto ? (
                <View
                  // Interactive on the own-profile preview so the inline editor
                  // inside catches taps; a plain non-interactive label otherwise.
                  pointerEvents={bioEditable ? 'auto' : 'none'}
                  style={[
                    styles.photoBioCard,
                    {
                      end: showFloatingAction ? ROUND_BUTTON_SIZE + MD + MD : MD,
                      // Reserve the report's lane only when a report actually
                      // renders here (never on the own-profile preview).
                      bottom: overlayBottomOffset + LG
                        + (section.key === lastPhotoKey && onReport ? ROUND_BUTTON_SIZE + MD : 0),
                    },
                  ]}
                >
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} onFocusRequested={onBioFocusRequested} onPhoto />
                  ) : (
                    <Text style={styles.photoBioText}>{match.bio}</Text>
                  )}
                </View>
              ) : null}
              {section.key === lastPhotoKey ? renderReportOverlay() : null}
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
          beige tile matches the round overlay buttons — same PHOTO_CHROME. */}
      {identityChipText || headingAction || (addChips && addChips.length > 0) ? (
        <View
          pointerEvents="box-none"
          style={[styles.topEndFixed, chromeTop > 0 && { paddingTop: chromeTop }]}
        >
          {identityChipText || headingAction ? (
            // The heading row: the name/age chip pinned at the END, with the
            // optional action chip (chat's "End") beside it on the START side.
            <View style={styles.headingRow}>
              {headingAction ? (
                <Chip
                  tone="solid"
                  onPhoto
                  text={headingAction.label}
                  onPress={headingAction.onPress}
                />
              ) : null}
              {identityChipText ? (
                <Chip
                  text={identityChipText}
                  tone="neutral"
                  onPhoto
                  bold
                />
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
  // Report button overlay: pinned to the bottom-START of the last photo — the
  // opposite side from the floating heart/chat action (END), so it never sits in
  // the middle (user directive 2026-07-25). paddingStart matches the heart's
  // end inset; paddingBottom (overlayBottomOffset, set inline) matches the
  // heart so both round buttons sit the same distance off the photo edge.
  reportOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingStart: MD,
    alignItems: 'flex-start',
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
    backgroundColor: PRIMARY,
    borderWidth: STROKE.base,
    borderColor: WHITE,
  },
  // Gap between the frosted-glass chips (name + fact lines). SM keeps each
  // frosted label a distinct, readable pill without the block feeling loose.
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
  // Bio as a big BEIGE chip floated at the bottom of the second photo, inset on
  // every side (`start` here; `end` + `bottom` set inline so the END inset can
  // clear the floating heart and the bottom inset can clear the report). Fully
  // rounded like an oversized chip, padded on all sides.
  photoBioCard: {
    position: 'absolute',
    start: MD,
    backgroundColor: BG,
    borderRadius: RADIUS,
    padding: MD,
  },
  photoBioText: {
    fontSize: TEXT.lg,
    lineHeight: lh(TEXT.lg),
    color: BIO_INK,
    textAlign: 'left',
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
  // Footer bar under the editor: char count on the start edge, Update button
  // on the end edge (flips under RTL). Full bubble width so it reads as the
  // editor's own toolbar rather than floating centered text.
  bioFooter: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: MD,
  },
  bioCounter: {
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
  },
  bioCounterWarn: { color: INK },
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
