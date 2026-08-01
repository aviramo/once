import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View, ActivityIndicator, Pressable, Keyboard, type GestureResponderEvent } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeOut, useAnimatedRef, scrollTo, useDerivedValue, cancelAnimation, runOnJS, type SharedValue } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import { useBottomInset } from '../hooks/useBottomInset'
import { useKeyboardOpen } from '../hooks/useKeyboard'
import { PullScrollView, PullContext } from './PullPane'

const AnimatedPullScrollView = Animated.createAnimatedComponent(PullScrollView)
import { Text, TextInput } from './AppText'
import { t, genderize, isRTL } from '../i18n'
import { ageFromTitle, nameFromTitle } from '../lib/profileTitle'
import { BIO_MAX } from '../lib/bio'
import { resolveLocationType, type Profile, type LocationType } from '../stores/userStore'
import { buildFamilySegments } from './FamilyCard'
import { Chip, ChipStack, plusBadge, CHIP_BLOCK_PAD, PinIcon, HomeIcon, WorkIcon, ClockIcon, KidsIcon, PresenceDot } from './Chip'
import { HeartIcon, ShieldIcon, GroupsIcon, ChevronEndIcon } from './icons'
import type { TapPoint } from './TapMenu'
import { sharedCircle, useMyFriendCount } from '../lib/communities'
import { RoundButton } from './RoundButton'
import { SheetTitle } from './BottomSheet'
import { OptionStrip, type StripOption } from './OptionStrip'
import { EditableText } from './EditableText'
import { XS, SM, MD, LG, RADIUS, ICON, TEXT, WEIGHT, ROUND_BUTTON_SIZE, SHEET_GAP, DOCK_SHADOW, TAP_SLOP, chromeTop, lh, bottomGap } from '../tokens'
import { PAGE, PHOTO_CHROME, INK, SURFACE, WHITE, INK_DIM, INK_SUBTLE, LIFT_SHADOW } from '../colors'
import { formatProximity, isDistanceHere } from '../lib/units'
import { isLastSeenJustNow } from '../lib/lastSeen'
import { useSecsLeft, formatClock } from '../lib/countdown'

// Display-only card for non-resting states. Action buttons live in the
// home screen's pinned bottom bar so they share spacing + positioning with
// the HIDDEN/VISIBLE toggle.

const SCROLL_TO_END_MS = 1400

// One round icon-button overlaid on the hero photo. CardActionStack stacks
// these vertically growing upward from the heart's anchor. Default usage is
// a single heart button (invite affordance); the own-profile preview passes `[]`
// — the one thing to do about that card is the plus on its heading tile. The
// button shape / size / shadow / press feedback live in RoundButton — this just
// stacks them.
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
  /** ANOTHER MARK IN THAT SAME CORNER (user directive 2026-08-01): the credit
   *  gem on the incoming invitation's accept, saying what the press spends where
   *  the dot would have said there is something here. One slot, one geometry —
   *  see RoundButton's `marker`. */
  marker?: React.ReactNode
}

// ── WHAT RIDES THE NAME/AGE CHIP AFTER ITS RULE ────────────────────────────
// THE CLOCK RIDES THE NAME (user directive 2026-07-30, restored 2026-08-01):
// an invitation's countdown is stated inside the heading chip, ENDING it behind
// the chip's hairline rule ("Moran, 46 | 07:44"), on the card of the person the
// invitation concerns. The name leads and the clock finishes the line: the tile
// exists to say who this is, and a clock in front of the name pushes the person
// out of the corner the card is read from.
//
// A CARD'S STRIP stood at the foot of the card for a few hours that day, carrying
// all of this plus a line of state and a row of action chips. It is deleted: what
// the game has to say about a profile turned out to be too much furniture on the
// one surface that is supposed to be a face (user, 2026-08-01, "it is too
// ornamented"). The heading chip is back exactly as it was, minus the two marks
// that had been bolted onto it — the ended card's X and the own card's plus.
export type CardCountdown = {
  expiresAt?: string | null
  /** Fired once, the moment the clock reaches zero. */
  onLapsed?: () => void
}

// Its own component for one reason: A SECOND OF THE COUNTDOWN RE-RENDERS THE
// CLOCK AND NOTHING ELSE. The card it stands on measures photo boxes, holds a
// reel and paints a profile — none of that may be re-rendered once a second — so
// the interval lives down here, below the Chip, and reaches it as a render slot
// (Chip's renderAfterRule) rather than as a string the card would recompute.
function InviteCountdown({ countdown, color }: { countdown: CardCountdown; color: string }) {
  const { expiresAt, onLapsed } = countdown
  const secsLeft = useSecsLeft(expiresAt ?? null, onLapsed)
  return <Text style={[styles.countdown, { color }]}>{formatClock(secsLeft)}</Text>
}

// What stands behind the chip's rule, whichever of the three it is. All of them
// are the SAME object as far as the tile is concerned — a second fact on the
// heading, in the chip's own label size with the chip's one emphasis — so they
// are one slot and not three, and none of them may grow a tile of its own.
//
//   · the invitation's CLOCK, and after it the mark that opens the message
//   · the mark ALONE, on a card that is over: no deadline is left, and there is
//     still something to read
//   · one WORD, for the state that has neither: chat's "End chat" (user
//     directive 2026-08-01, "in the timer's place, bold purple on white")
//
// The mark is a chevron pointing at the reading END (user directive 2026-08-01):
// the app's disclosure mark, "there is more behind this and pressing it goes
// there". It opened as an up-chevron, on "that is where the popup comes from" —
// but a reader does not read a mark as a stage direction for the animation, he
// reads it as where it takes him. It is its own press target and the only one on
// this tile besides the flag; the tile itself is inert.
//
// IT SLIDES OUT OF THE NAME, AND BACK INTO IT (user directive 2026-08-01). The
// block is not a thing that is suddenly there — it EMERGES: a clipping box whose
// width runs 0 → the content's own measured width, with the content hung out of
// flow at the box's START edge, so the clock unfolds from behind the name and the
// tile grows with it to its final shape. Going away is that sentence backwards,
// and the node stays mounted until it lands (`useTrailing`) — an exit animation
// on a child React has already unmounted is no animation at all.
//
// The block does NOT shrink (`trailingRow`): when the row runs out of width the
// NAME is what gives — it wraps, which is what a name does — and a clock that
// loses a digit is a clock that lies (a Hebrew name at font_scale 2 on a narrow
// screen, 2026-08-01).
//
// A card that ARRIVES with a clock on it does not play the slide: it is not a
// change, it is what this card has always been. Only a state changing under a
// card the user is already looking at is one.
function useTrailing(active: boolean) {
  const [mounted, setMounted] = useState(active)
  const progress = useSharedValue(active ? 1 : 0)
  const settled = useRef(false)
  useEffect(() => {
    if (active) {
      setMounted(true)
      progress.value = settled.current ? withTiming(1) : 1
    } else if (settled.current) {
      progress.value = withTiming(0, undefined, finished => {
        'worklet'
        if (finished) runOnJS(setMounted)(false)
      })
    } else {
      setMounted(false)
    }
    settled.current = true
  }, [active])
  return { mounted, progress }
}

function CardTrailing({ color, progress, countdown, onMessage, trailingLabel, trailingAction }: {
  color: string
  progress: SharedValue<number>
  countdown?: CardCountdown
  onMessage?: () => void
  trailingLabel?: string
  trailingAction?: { label: string; onPress: () => void }
}) {
  // The content's own box, measured once it has laid out. Until then the clip is
  // 0 wide and paints nothing, which is also the state the slide starts from.
  const [box, setBox] = useState({ w: 0, h: 0 })
  const onBox = useCallback((w: number, h: number) => {
    setBox(cur => (Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5 ? cur : { w, h }))
  }, [])
  const clip = useAnimatedStyle(() => ({ width: box.w * progress.value }), [box.w])
  const inner = trailingAction ? (
    <Pressable
      onPress={trailingAction.onPress}
      hitSlop={TAP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={trailingAction.label}
    >
      <Text style={[styles.countdown, { color }]}>{trailingAction.label}</Text>
    </Pressable>
  ) : onMessage ? (
    <Pressable
      onPress={onMessage}
      hitSlop={TAP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('home.a11y.cardMessage')}
      style={styles.trailingRow}
    >
      {countdown
        ? <InviteCountdown countdown={countdown} color={color} />
        : trailingLabel
          ? <Text style={[styles.countdown, { color }]}>{trailingLabel}</Text>
          : null}
      <ChevronEndIcon color={color} size={ICON.sm} />
    </Pressable>
  ) : countdown ? (
    <InviteCountdown countdown={countdown} color={color} />
  ) : null
  return (
    <Animated.View style={[styles.trailingClip, { height: box.h }, clip]}>
      <View
        style={styles.trailingInner}
        onLayout={e => onBox(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      >
        {inner}
      </View>
    </Animated.View>
  )
}

function CardActionStack({ actions }: { actions: Array<CardAction & { onPress: () => void }> }) {
  return (
    <View style={styles.actionStack}>
      {actions.map(a => (
        <RoundButton key={a.key} bg={a.bg} badge={a.badge} marker={a.marker} onPress={a.onPress}>
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
  /** Called with the normalized bio when Update is pressed, only when it
   * changed. `null` is a CLEARED bio — a real answer since 2026-07-31, when
   * the bio stopped being required at all. */
  onCommit: (next: string | null) => void
}

function BioField({
  edit,
  isMale,
  onFocusRequested,
  onPhoto = false,
}: {
  edit: BioEdit
  /** Whose card this is, for the placeholder's gendered verb. Only ever the
   * user's own — the field is editable on the self preview alone. */
  isMale?: boolean | null
  /** Ask the parent card to scroll this field above the keyboard. */
  onFocusRequested: () => void
  /** When rendered inside the on-photo bio chip (own-profile preview), the
   * field styles itself byte-for-byte like the static remote bio: purple
   * INK, START-aligned, larger. Otherwise it matches the white fallback
   * bubble (own-profile editor with a single photo). */
  onPhoto?: boolean
}) {
  // Thin wrapper over the shared EditableText: pass the bio's cap, i18n labels
  // and the card's bio styles so the card stays pixel-identical while the
  // draft/commit/Update behavior lives in one place (also used by the group
  // description editor).
  //
  // NO MINIMUM AND allowEmpty (user directive 2026-07-31): the bio is optional,
  // so clearing the field is a save that commits null, exactly like the group
  // description. There is no hint slot to fill either — a minLabel would state
  // a requirement that no longer exists.
  return (
    <EditableText
      value={edit.value}
      saving={edit.saving}
      onCommit={edit.onCommit}
      min={0}
      allowEmpty
      max={BIO_MAX}
      placeholder={genderize(t('bio.placeholder'), isMale)}
      updateLabel={t('bio.update')}
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

// (`photoIsPage` used to stand here: with a status card at the top of the scroll
// the reel's first page was that card, so the tap-to-hide had to be disarmed
// until it had been scrolled off. There is no status card any more — every page
// of the reel is a photo — so the question has one answer and no helper.)

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
   * photo's index in `match.images` (own-profile preview / edit mode) plus the
   * point that was touched, in window coordinates — what the photo's actions open
   * out of (see TapMenu). The card knows where the finger was and nothing else
   * does, so it is the card that says. */
  onPhotoTap?: (imageIndex: number, at: TapPoint) => void
  /** When provided, the family/kids card becomes tappable (own-profile preview). */
  onFamilyTap?: () => void
  /** When provided, the shared-circle chip becomes tappable and opens the popup
   * listing everything the pair shares (every mutual friend, every shared
   * group). Absent on the own-profile preview (no chip).
   * It is handed HOW MANY circles the chip counted — the card is the one thing
   * that knows that before anything is fetched, and a pair sharing exactly one
   * circle is taken straight to that circle's own surface (user directive
   * 2026-08-02, see SharedCirclesPopup). */
  onCircleTap?: (circles: number) => void
  /** When provided (and `self`), the bio bubble becomes an inline editor:
   * tap-to-place-caret, keyboard-aware scroll, auto-save on blur. Replaces
   * the old onBioTap popup. The bio section renders even when the bio is
   * empty in this mode, so the user can add one in place. */
  bioEdit?: BioEdit
  /** Overlay action buttons stacked at the bottom-right of the hero photo,
   * starting at the heart's anchor and growing upward. When omitted, a
   * single heart button is rendered (tapping scrolls to the end of the
   * card). Pass `[]` for a card that carries no round action at all — the
   * own-profile preview, whose adds are the buttons in the bar UNDER the card
   * (ProfileActionBar). */
  actions?: CardAction[]
  /** The live invitation countdown, drawn INSIDE the name/age chip after the
   * name and age (see CardCountdown). Set by home for the two states that have a
   * deadline — the invitation this user sent and the one he received. Absent
   * everywhere else, a card that is OVER included: a deadline that has passed is
   * not a number any more. */
  countdown?: CardCountdown
  /** THE CARD HAS SOMETHING TO SAY, AND THIS OPENS IT (user directive
   * 2026-08-01). A mark after the clock — a chevron, the app's "there is more,
   * and it comes up from below" — whose press raises the popup carrying the
   * state's own title, paragraph and buttons: what to do about the invitation
   * being waited on, the invitation that arrived, or the one that ended. Those
   * three used to be a status CARD at the top of this card's scroll, which meant
   * scrolling to the face carried the message off the screen; the mark is out of
   * the scroll with the name, so the way to the message never leaves.
   *
   * It draws with or without a clock: an ended card has no deadline left and
   * still has something to say. */
  onMessage?: () => void
  /** A WORD WHERE THE CLOCK WAS, once it has run out (user directive
   * 2026-08-01): "הסתיים". A card that is over has no deadline left, and the
   * slot going empty read as a clock that had failed rather than one that had
   * finished — the block was there, the mark was there, and the number was
   * simply missing. It is not its own press target: the whole block opens the
   * message, which is what a card that is over has to say. */
  trailingLabel?: string
  /** A WORD IN THE CLOCK'S PLACE (user directive 2026-08-01): the same slot,
   * the same bold purple on the chip's white, for the one state that has no
   * deadline but does have something to press — chat, whose "End chat" has lived
   * with whom it ends since 2026-07-26. It is not the purple `endAction` block
   * the chip used to grow for it: that read as a second tile stuck to the
   * heading, and this reads as the tile's second fact, which is what it is. */
  trailingAction?: { label: string; onPress: () => void }
  /** When provided, a report (flag) glyph LEADS the name/age chip — in EVERY
   * state, so the report affordance lives in one place. Centralised here so the
   * glyph and its placement live once; callers only wire the handler (open the
   * report confirm for `match`). Omitted for the own-profile preview /
   * preloader, which never report. */
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
   * card. The card's own heading row lines up WITH that chrome. 0 / omitted = no
   * chrome above the card. */
  chromeInset?: number
  /** THE CARD DOES NOT STAND ON THE SCREEN EDGE: something of the app's own is
   * under it — home's dock, a profile page's ProfileActionBar — and that thing
   * owns the clearance off the system's bottom band, so the card's STRIP ends on
   * the card's own MD gutter instead of spending BOTTOM_AIR on furniture that is
   * not below it. Left off by a host whose card genuinely runs to the bottom of
   * the screen — a profile page whose bar renders nothing
   * (`profileActionBarShows`) — which must still clear a drawn navigation bar
   * itself: not doing that is what sliced the card's controls in half on a
   * 3-button Redmi (2026-07-29). */
  bottomChrome?: boolean
}

// (An imperative handle used to hang off this card — `scrollToTop` and
// `backToTop`, for the marks that took the reader up to the status card at the
// top of the scroll and for hardware back. There is no such card any more: what
// it said is a line in the strip, permanently on screen. Nothing outside drives
// this scroll, so there is no ref to hold.)
export function MatchCard({
  match,
  bottomInset = 0,
  hideTime = false,
  hideProximity = false,
  onReady,
  footerBlock,
  footerBg,
  onPhotoTap,
  onFamilyTap,
  onCircleTap,
  bioEdit,
  actions,
  countdown,
  onMessage,
  trailingLabel,
  trailingAction,
  onReport,
  isForKids,
  viewerLocationType,
  self = false,
  cardHeight,
  chromeInset = 0,
  bottomChrome = false,
}: MatchCardProps) {
  // (The bio's padding box used to be pulled from `useChipPadding` here, so the
  // oversized tile could not drift from the pill chips beside it. Those chips are
  // BLOCKS now and the bio is one too, so its box is the flat CHIP_BLOCK_PAD —
  // stated in `photoBioCard` below, still from the chip's own constant.)
  //
  // The chip's trailing block, and whether it is on screen — it stays mounted
  // through its own slide back into the name (see useTrailing).
  const trailing = useTrailing(!!(countdown || onMessage || trailingAction))
  // Top of the shell's floating chrome: the card's heading row hangs from the
  // same line, so the two read as one row. `chromeTop()` in tokens is where that
  // line is stated — the same one the hamburger and a sheet's close X hung from.
  const chromeRowTop = chromeInset > 0 ? chromeTop(chromeInset) : 0
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
  // keeps its chips fixed.
  //
  // THE PHOTO TOGGLES, THE CHIPS DO NOT (user directive 2026-07-30). The only
  // toggle surface is the photo Pressable under the whole info set; every tile
  // over it — each fact chip, the shared-circle chip, the bio card, the name/age
  // heading, the floating heart — is live where it is painted and swallows its
  // own touch, so a tap on a chip can never be the tap that takes that chip
  // away. The chips used to be touch-transparent (pointerEvents 'none') so a tap
  // ON them reached the photo, and the heading chip called toggleChips itself;
  // both are gone. That also settles the invite states, where the heading chip
  // floats over the status card at the top of the card: a tap there now lands on
  // the status card and stops, instead of reading as "the info card hides the
  // chips". Only while the set is HIDDEN does everything drop to 'none', so a tap
  // anywhere over the photo brings it back.
  //
  // Reset to visible on every profile swap so a hidden state can't carry into
  // card B.
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
    // Nothing gates it any more: the reel's every page is a photo now that the
    // status card at the top of the scroll is gone, so the photo IS the page
    // whenever this fires.
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
  // Which full-viewport photo page the scroll is resting on. A change reveals
  // the chips again — and it is what the reel is re-pinned to when the page
  // height changes under it (see the re-pin effect below).
  const photoPageRef = useRef(0)
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
  // (A whole second snap regime used to stand here — measured section tops,
  // recorded from each section's onLayout — for the states with a status card at
  // the top of the scroll, where viewport-multiple paging would have landed
  // mid-photo. There is no status card any more, so every page of this reel is a
  // photo and `pagingEnabled` is the only mode.)
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
  const safeBottomInset = useBottomInset()
  const photoHeight = Math.max(280, effectiveCardH - bottomInset)
  // WHERE THE ON-PHOTO SET ENDS. The first photo runs to the bottom of the card,
  // so this one offset is the bottom gutter of everything painted on it — the
  // chips AND the heart.
  //
  // WITH FURNITURE UNDER THE CARD IT IS THE CARD'S OWN GUTTER, MD (user
  // directive 2026-07-30) — the very inset its other three edges take
  // (`photoBioCard.start`, `actionStackFixed.end`, `topStartFixed.padding`), so
  // the set is bedded in the photo evenly on all four sides. Without it,
  // `bottomGap` still: a card with nothing under it reaches the screen edge and a
  // drawn navigation bar would swallow these buttons whole (the 3-button Redmi,
  // 2026-07-29). See the `bottomChrome` prop.
  const overlayBottomOffset = bottomChrome ? MD : bottomGap(safeBottomInset, MD)
  // The extra lift under the bottom-START info (fact chips AND the bio tile)
  // exists ONLY to clear the floating heart's lane (user directive 2026-07-30):
  // a card with no floating action has nothing down there to clear, so its
  // chips end at the SAME ordinary gap off the bottom of the screen as every
  // other bottom-anchored thing in the app. One value for both groups, so the
  // chip column and the bio tile can never sit at different heights.
  const infoBottomLift = showFloatingAction ? LG : 0
  const ready = effectiveCardH > 0
  const timeIso = match.last_seen
  // Icon = the subject's (B = match) anchor (pin/home/work). The text is a
  // SINGLE merged phrase: anchor-aware distance + relative last-seen (see
  // formatProximity) — distance stays live ("ממך") only when both viewer and
  // subject are 'device', else it reads as anchored to a fixed address. Either
  // half may be missing and the chip still renders with the other one — only a
  // phrase with NEITHER half comes back empty, and then the chip is dropped.
  //
  // NEVER ON YOUR OWN CARD (user directive 2026-07-31). The chip answers "how far
  // away is this person and when were they last about" — of yourself it can only
  // ever say "here, now", which is the one thing the reader already knows, and it
  // was the last row of the fact tile on the profile preview. It is stated here
  // rather than as a `hideProximity` at the preview's call site so a `self` card
  // anywhere in the app is the same card.
  const subjectLocationType = resolveLocationType(match)
  const viewerType: LocationType = viewerLocationType ?? 'device'
  const hasDistance = match.distance != null && !isNaN(match.distance)
  const proximityStr = hideProximity || self
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
  const circle = useMemo(() => sharedCircle(match, myFriends), [match.group_name, match.group_members, match.group_extra, match.friend_name, match.friend_extra, match.is_male, myFriends])

  // The circle's name with the "+N more" pill FLOWING after it (user directive
  // 2026-07-30): the same segment list the kids' ages ride, so the pill sits
  // beside the last WORD of the name wherever that word lands, instead of after
  // the label's whole box — which on a wrapped name left it stranded a dead
  // half-tile away from the circle it counts.
  const circleSegments = useMemo(
    () => (circle ? [{ text: circle.label }, ...(circle.extra ? [plusBadge(circle.extra)] : [])] : []),
    [circle],
  )

  // Several facts in one label; Chip's phraseWrap decides where it breaks.
  const familySegments = useMemo(
    () => buildFamilySegments(match.family, isForKids, self, match.is_male),
    [match.family, isForKids, self, match.is_male],
  )

  const endsWithPhoto = sections.length > 0 && sections[sections.length - 1].type === 'photo'
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
  // Almost none, by design. The bio bubble is a TextInput inside this scroll
  // view, and it used to hand-roll everything: its own Keyboard listeners, its
  // own height state, its own bottom padding, and a deferred scroll that
  // measured the field against the keyboard by hand. All of it is now the
  // app-wide contract (src/hooks/useKeyboard.ts) — the page shrinks to the
  // keyboard, and `PullScrollView` brings the focused field above the fold once
  // that shrink has landed. What is left here is only what is specific to a
  // paged reel: suspending paging while the field is focused, and re-pinning to
  // the current photo when the page height changes (both below).
  const bioFocusedRef = useRef(false)
  const onBioFocusRequested = useCallback(() => {
    bioFocusedRef.current = true
    setBioFocused(true)
  }, [])
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
  const handlePhotoTap = useCallback((imageIndex: number, e: GestureResponderEvent) => {
    if (swallowTapWhileEditing()) return
    // Window coordinates, straight off the touch: what opens is a menu that grows
    // out of the finger (TapMenu), and this is the only place that knows where it
    // was. Read on the frame of the tap — the card scrolls and rises, so a point
    // measured later is a point somewhere else.
    onPhotoTap?.(imageIndex, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
  }, [swallowTapWhileEditing, onPhotoTap])
  const handleFamilyTap = useCallback(() => {
    if (swallowTapWhileEditing()) return
    onFamilyTap?.()
  }, [swallowTapWhileEditing, onFamilyTap])
  const handleCircleTap = useCallback(() => {
    if (swallowTapWhileEditing()) return
    onCircleTap?.(circle?.count ?? 0)
  }, [swallowTapWhileEditing, onCircleTap, circle])
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
  // The keyboard going away is what ends an editing session — the field can
  // also be dismissed by the back gesture or a tap outside, so the keyboard is
  // the only reliable signal. Paging comes back on with it.
  const keyboardOpen = useKeyboardOpen()
  useEffect(() => {
    if (keyboardOpen) return
    bioFocusedRef.current = false
    setBioFocused(false)
  }, [keyboardOpen])
  // Read from `onLayout`, which is not a render — assigned during render, the
  // same way `photoIsPageRef` is. See the card's onLayout for what it gates.
  const keyboardOpenRef = useRef(false)
  keyboardOpenRef.current = keyboardOpen

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
  // The reel is a pager whose page IS the viewport: every photo is `photoHeight`
  // tall and the snap points are multiples of it. So when the viewport height
  // changes under a resting scroll the snap points move out from under the
  // offset and the reel is left showing the seam between two photos. Re-pin to
  // the page it was on.
  //
  // The KEYBOARD is no longer one of those changes — the card refuses to be
  // re-measured while one is up (see its onLayout), so the grid holds still
  // through an edit and there is no seam to come back from. What is left is a
  // genuine change of the card's box: a profile page's action bar appearing or
  // going away, and THE STRIP growing or shrinking under a state change (its
  // second row arriving, a line wrapping) — which is the same question and takes
  // the same answer, since the page is now the card less the strip.
  //
  // Skipped while the bio is focused, because the shared reveal in
  // PullScrollView owns the scroll position then (it has just lifted the field
  // above the keyboard, and a re-pin would put it straight back under it).
  const prevPhotoHeightRef = useRef(0)
  useEffect(() => {
    const prev = prevPhotoHeightRef.current
    prevPhotoHeightRef.current = photoHeight
    if (!prev || prev === photoHeight || bioFocused) return
    scrollRef.current?.scrollTo({ y: photoPageRef.current * photoHeight, animated: false })
  }, [photoHeight, bioFocused])
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
  // (The status card's whole entrance lived here: a slide-in driven off its
  // measured height, an animated spacer pushing the hero photo down in lockstep,
  // and a scroll-to-top fired the instant the block appeared. All of it is gone
  // with the block — what it announced is a line in the strip, which is already
  // on screen and never has to arrive.)

  // contentContainer must flexGrow to viewport so the filler under
  // footerBlock can claim the leftover vertical space when content < viewport.
  // When footerBlock owns the bottom we skip the container's paddingBottom —
  // the footer block already includes its own safe-area padding.
  // No keyboard term: the reel's pages shrink with the page, so the bio chip at
  // the bottom of photo 2 is still exactly one page down and reachable without
  // any extra room made for the keyboard.
  const contentPaddingBottom = footerBlock ? 0 : bottomInset + (endsWithPhoto ? 0 : MD)

  return (
    <View
      style={[styles.wrap, !ready && styles.hidden]}
      onLayout={e => {
        // THE REEL'S PAGE HEIGHT IS MEASURED WITH THE KEYBOARD DOWN, and the
        // keyboard never re-measures it: a shorter window CROPS this card, it
        // does not resize its pages. Two reasons, and either alone is enough.
        //
        // The shrink is driven on the UI thread (a shared value on the root's
        // padding), so what reaches JS is an unreliable trickle of onLayout
        // events rather than a value per frame ending on the truth — the card
        // was left sized to a mid-animation FRAME of a keyboard that had
        // already gone, and painted two photos in one screen with the action
        // bar crammed under them (Pixel, 2026-07-30). And a pager whose page IS
        // the viewport re-flows its whole grid under a resting offset every
        // time that viewport moves, which is the same thing onboarding already
        // refuses to do with its `measuredOnceRef`.
        //
        // Rejecting the measurement leaves the last one taken with the keyboard
        // down, which IS the card's full height — so there is nothing to
        // restore when the keyboard leaves.
        if (keyboardOpenRef.current && cardH > 0) return
        setCardH(e.nativeEvent.layout.height)
      }}
    >
      <AnimatedPullScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPaddingBottom, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        // No keyboard props: PullScrollView declares them for every surface in
        // the app (scrolling never closes the keyboard; a tap outside does).
        // This reel used to opt out of the old dismiss-on-drag rule; there is
        // nothing left to opt out of.
        // Reels paging: full-viewport photos from offset 0, which leaves the
        // pull-to-skip untouched. The second regime that stood beside it —
        // snapping to measured section tops, for the states with a status card
        // above the photos — went with the status card.
        pagingEnabled={pagingAllowed}
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
          // The resting page is tracked unconditionally — the re-pin on a page
          // height change needs it on every card, not only the ones whose chips
          // can be toggled. Revealing the chips is what is conditional.
          if (photoHeight > 0) {
            const page = Math.round(y / photoHeight)
            if (page !== photoPageRef.current) {
              photoPageRef.current = page
              if (chipsToggleable) revealChips()
            }
          }
        }}
        onContentSizeChange={(_: number, h: number) => { contentHRef.current = h }}
        onLayout={(e: any) => { viewportHRef.current = e.nativeEvent.layout.height }}
      >
        {/* Hero: always the first section (expected to be a photo) */}
        <Animated.View
          key={heroKey}
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
              {onPhotoTap ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={e => handlePhotoTap(sections[0].type === 'photo' ? sections[0].imageIndex : -1, e)}
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
            // toggle Pressable. THE TILE ITSELF DOES NOT (user directive
            // 2026-07-30): a chip is the thing the user is reading, so a tap on
            // one must never be the tap that takes it away — only the open photo
            // toggles. The fact tile is 'auto' and swallows the touch everywhere
            // it is painted, which since the facts were merged into ONE tile
            // (see ChipStack) is the whole white block, its widest row included.
            // While the set is HIDDEN it drops to 'none': the tile is zoomed
            // away, so a tap where it used to sit has to reach the photo and
            // bring the whole set back.
            pointerEvents="box-none"
            style={[styles.infoOverlay, { paddingBottom: overlayBottomOffset }]}
          >
            <View
              pointerEvents="box-none"
              style={[
                styles.infoLeft,
                { marginBottom: infoBottomLift },
                showFloatingAction && styles.floatingActionReserve,
              ]}
            >
              {/* The toggle's fade+zoom rides HERE and not on the overlay above:
                  this is the box that hugs the chips, so its bottom-START origin
                  is the chips' own corner. On the full-width overlay the same
                  scale would have dragged the column toward the middle of the
                  screen instead of shrinking it in place. */}
              <Animated.View pointerEvents="box-none" style={[styles.chipsStack, chipsAnimStyle]}>
                {/* ONE TILE, NOT THREE (user directive 2026-07-30): these facts
                    are one set of facts about one person, so they share a single
                    white tile and the app's hairline stands between the KINDS —
                    see ChipStack, which owns the tile, the rules and the rows'
                    shared ground. Three separate tiles read as three unrelated
                    labels stacked in the corner.

                    The set reads TOP-DOWN: circle → kids/family → time/distance
                    (user directive 2026-07-30). How we are already connected
                    comes first — it is the fact that decides whether the rest is
                    worth reading — then who is in this person's life, and the
                    where/when last, since it is the one fact that is true of any
                    stranger.

                    'auto' while the set is up: the tile is painted white
                    everywhere its widest row reaches, so it swallows its own
                    touch there (a chip never carries the tap that takes it away)
                    — and RNGH hit-tests through pointerEvents too, so this is
                    also what lets the circle row's tap be recognized. 'none' when
                    hidden, so a reveal-tap passes straight through to the photo.

                    The circle we share: ONE row for every kind of connection
                    (user directive 2026-07-29) — a shared group and a mutual
                    friend answer the same question, so "my friends" is ranked
                    among the groups as a group and the SMALLEST circle is the one
                    named (the rule lives in lib/communities.ts → sharedCircle).
                    "+N" counts the other circles; tapping lists them all. It
                    wears the circles feature's own interlaced-rings mark, and is
                    interactive via a native RNGH tap (not the Chip's Pressable)
                    so the popup opens the instant it's tapped, without waiting on
                    the scroll/pull pan. */}
                <ChipStack onPhoto pointerEvents={chipsHidden ? 'none' : 'auto'}>
                  {circle ? (
                    <GestureDetector gesture={circleTapGesture}>
                      <View style={styles.chipsLine}>
                        <Chip
                          renderIcon={c => <GroupsIcon color={c} size={ICON.sm} />}
                          segments={circleSegments}
                        />
                      </View>
                    </GestureDetector>
                  ) : null}
                  {familySegments.length ? (
                    <Chip
                      renderIcon={c => <KidsIcon color={c} />}
                      segments={familySegments}
                      onPress={onFamilyTap ? handleFamilyTap : undefined}
                    />
                  ) : self && onFamilyTap ? (
                    // AN EMPTY FACT IS AN INVITATION TO FILL IT (user directive
                    // 2026-08-01), in the same shape the bio takes when it has
                    // nothing in it: the tile stands in the very place the fact
                    // will stand, saying what belongs there. It replaced a row in
                    // a popup behind a plus — a way of adding something that was
                    // nowhere near the thing being added. Only on your own card,
                    // and only while there is nothing to state: the moment the
                    // entry exists it is the ordinary fact row above.
                    //
                    // AND IT IS SAID IN A PLACEHOLDER'S INK (user directive
                    // 2026-08-01): an empty fact and an empty bio are the same
                    // thing on this card, so the row wears the `placeholder`
                    // tone — `INK_DIM`, the colour the bio's own empty field
                    // paints its sentence in — rather than standing at the full
                    // strength of the facts that ARE filled in.
                    <Chip
                      tone="placeholder"
                      renderIcon={c => <KidsIcon color={c} />}
                      text={t('settings.addFamily')}
                      onPress={handleFamilyTap}
                    />
                  ) : null}
                  {proximityStr ? (
                    <Chip
                      renderIcon={c => hasDistance
                        ? (subjectLocationType === 'work' ? <WorkIcon color={c} /> : subjectLocationType === 'home' ? <HomeIcon color={c} /> : <PinIcon color={c} />)
                        : <ClockIcon color={c} />}
                      text={proximityStr}
                      tone="neutral"
                      renderTrailing={proximityLive ? (c => <PresenceDot color={c} />) : undefined}
                    />
                  ) : null}
                </ChipStack>
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
                  onPress={e => handlePhotoTap(section.imageIndex, e)}
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
                  // Live while it is painted, on a remote card as much as on the
                  // own-profile preview (whose inline editor inside must catch
                  // taps): the bio is the biggest white chip on the card, and a
                  // chip never carries the tap that takes it away (user directive
                  // 2026-07-30) — so it swallows its own touch and only the photo
                  // around it toggles. 'none' once the set is zoomed away, so a
                  // tap over its old footprint reaches the photo and reveals.
                  pointerEvents={chipsHidden ? 'none' : 'auto'}
                  style={[
                    styles.photoBioCard,
                    {
                      end: showFloatingAction ? ROUND_BUTTON_SIZE + MD + MD : MD,
                      bottom: overlayBottomOffset + infoBottomLift,
                    },
                    chipsToggleable && chipsAnimStyle,
                  ]}
                >
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} isMale={match.is_male} onFocusRequested={onBioFocusRequested} onPhoto />
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
              >
                <View style={styles.aboutBubble}>
                  {bioEditable && bioEdit ? (
                    <BioField edit={bioEdit} isMale={match.is_male} onFocusRequested={onBioFocusRequested} />
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
      {/* THE CARD'S HEADING: ONE TILE IN THE TOP-START CORNER (user directive
          2026-07-30, restored 2026-08-01 after a few hours as a band at the foot
          of the card). Everything that names this person shares a single chip,
          read start-to-end: the report flag, the name and age, and behind the
          chip's hairline whatever the state has to say for itself — the
          invitation's clock, chat's "End chat", and the mark that opens the
          state's own message. It is OUT of the scroll, so it stays put while the
          profile scrolls under it, and its white matches the round overlay
          buttons (same PHOTO_CHROME).

          The box is stretched to the card's full width so a long name can wrap;
          `box-none` keeps it from eating every tap across the top of the photo —
          only the tile standing in it does. */}
      {identityChipText || onReport || trailing.mounted ? (
        <View
          pointerEvents="box-none"
          style={[styles.topStartFixed, chromeRowTop > 0 && { paddingTop: chromeRowTop }]}
        >
          {/* WHO THIS IS NEVER LEAVES THE SCREEN (user directive 2026-07-30).
              This one chip is OUT of the tap-toggle: a tap on the photo zooms the
              fact chips and the bio card away, and the heading stays exactly
              where it is. It carries the one number on the screen with a deadline
              on it and the only way to the state's message — a face with nothing
              naming it, and a clock a stray tap could take away, are both worse
              than the sliver of photo this covers. The tile itself is inert; only
              the pieces INSIDE it act, each its own press target. */}
          <View style={styles.identityChipWrap}>
            <Chip
              text={identityChipText}
              tone="neutral"
              onPhoto
              // The state's own trailing fact, behind the chip's hairline rule:
              // "Moran, 46 | 07:44 ›". See CardTrailing.
              renderAfterRule={trailing.mounted
                ? c => (
                  <CardTrailing
                    color={c}
                    progress={trailing.progress}
                    countdown={countdown}
                    onMessage={onMessage}
                    trailingLabel={trailingLabel}
                    trailingAction={trailingAction}
                  />
                )
                : undefined}
              // THE WHOLE TILE OPENS THE MESSAGE (user directive 2026-08-01):
              // the clock and the chevron are two small marks at the end of a
              // line, and asking a thumb to find them when the tile beside them
              // means the same thing is asking for a miss. The report flag keeps
              // its own target and wins the responder over this one — it is the
              // one thing on the tile that is NOT "what is happening with this
              // person". (The tile was deliberately inert while it could hide
              // the info set on a tap; it is out of that toggle entirely, so
              // there is nothing left for a tap on it to do wrongly.)
              onPress={onMessage && !trailingAction ? onMessage : undefined}
              // The report flag rides INSIDE the heading chip (user directive
              // 2026-07-29): reporting is a footnote to "who is this", not a
              // second card-level control competing with the heart. It is the
              // tile's FIRST mark.
              renderIcon={onReport ? c => <ShieldIcon color={c} fill={c} size={ICON.sm} /> : undefined}
              onIconPress={onReport}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

// ── The bar under a profile card ───────────────────────────────────────────
// THE block that stands under a full-screen profile card and carries what can be
// done ABOUT the person on it: the decisions on a communities person page
// (approve / make approver / remove). One component, so a control under a face is
// placed and spaced the same wherever the card is rendered.
//
// THE ACTIONS ARE A STRIP, NOT A COLUMN OF BUTTONS (user directive 2026-07-31):
// side by side, each a glyph with one small word under it, no tile behind either
// of them, and the app's one hairline between. It is `OptionStrip` — literally
// home's dock, which is the same object: a set of marks along the foot of a
// surface, none of them what the surface is FOR. What stood here before was a
// stack of full-width tinted pills, one of them (approve) solid purple, and a
// page about a person read as a page asking a question. A person page asks
// nothing; it shows someone, and states quietly what may be done about them.
//
// Your OWN preview used to stand on one too, carrying its two adds. It does not
// any more (user directive 2026-07-31): an add is not a decision someone else's
// page puts to you, it is a thing you go and do — so it is the plus on the card's
// heading tile and a popup behind it, and the card fills the screen again
// instead of paying for a permanent bar that states two one-off actions.
//
// It is the FOOT OF A POPUP, standing on a page — WHITE included (user directive
// 2026-07-30): `SheetTitle` for the circle the person is standing in, and the two
// gaps that belong to a popup's head (SHEET_GAP.title above a title, .actions
// between it and what can be done), so the bar can never state a rhythm the
// popups don't. The ground is the popup's own SURFACE — every popup in the app is
// white, and this block is one. (It used to be defended by the tiles that stood
// on it: a PAGE-tinted pill on a PAGE-tinted page was ink floating on the ground.
// Those tiles are gone, and the white stands on the popup rule alone.) Only the
// gutter and the bottom gap are its own, and the bottom gap is the app's one
// bottom gap (bottomGap over useBottomInset), read HERE rather than passed in —
// a caller cannot get it wrong.
//
// It is a SIBLING of the card, not a layer over it: the card takes the room that
// is left, so the profile ends where the bar begins. With nothing to put in it
// the bar does not render AT ALL and the profile fills the whole screen (user
// directive 2026-07-30) — an empty bar used to leave a dead band under the photo.
// A caller builds its list by filtering on the viewer's role, so the question is
// simply how long that list is: one action left renders one option, across the
// whole strip, with no rule to draw.
//
// The question is asked from OUTSIDE too, which is why it is a function and not
// four lines in the body: the card above the bar has to know whether it is
// standing on it or on the screen edge (MatchCard's `bottomChrome`), and if the
// two answered it separately they could disagree about who clears the
// navigation band — leaving either a dead strip or a sliced button.
export const profileActionBarShows = (caption: React.ReactNode, actions: StripOption[]) =>
  !!caption || actions.length > 0

export function ProfileActionBar({ caption, actions }: {
  /** WHICH CIRCLE this person is standing in. A STRING is the popup title this
   *  block has always been ("my friends"); a NODE is a heading that says more
   *  than a name, and there is exactly one — a group's own head (`GroupHead`),
   *  which a person's page inside a group wears whole (user directive
   *  2026-07-31: the group's heading, not just its name). Absent on your own
   *  preview: the card is yours, there is nothing to name. */
  caption?: React.ReactNode
  /** What can be done about this person, as DATA rather than nodes (user
   *  directive 2026-07-31): the bar owns how an action looks — a glyph with one
   *  word under it — so a call site states what the actions ARE and cannot state
   *  a second appearance for them. An empty list is the normal case (a plain
   *  member looking at another plain member decides nothing about them). */
  actions: StripOption[]
}) {
  const bottomInset = useBottomInset()
  // WHILE THE BIO IS BEING EDITED, NOTHING ON THE PAGE IS LIVE (user directive
  // 2026-07-30): a tap ends the edit and does nothing else, and only a second
  // tap — with the editor closed — performs the action it landed on. The card
  // already answers for itself (`swallowTapWhileEditing`); this bar is the one
  // thing on a profile page that is NOT the card, so it answers the same way
  // rather than firing an add out from under an open editor. The keyboard is
  // the question asked, because on this page the only thing that can have
  // raised one is the bio.
  const editing = useKeyboardOpen()
  if (!profileActionBarShows(caption, actions)) return null
  return (
    <View style={[styles.profileBar, {
      // A title leads the block, so the air above it is the popup's own; with
      // nothing but the options the bar keeps its MD.
      paddingTop: caption ? SHEET_GAP.title : MD,
      paddingBottom: bottomGap(bottomInset, MD),
    }]}>
      {/* A bare name is the popup title this block states it as; a heading that
          is already a block (a group's head) paints itself. */}
      {typeof caption === 'string' ? <SheetTitle>{caption}</SheetTitle> : caption ?? null}
      {/* The popup's own gap above a set of actions, and only when there is a
          title to stand clear of: with none, the bar's own top air is the gap. */}
      {actions.length > 0 && (
        <OptionStrip options={actions} style={caption ? styles.profileBarStrip : undefined} />
      )}
      {/* The swallow: a lid over the whole bar while an edit is open, so the
          tap lands on ONE thing however many options are under it. */}
      {editing ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => Keyboard.dismiss()}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  )
}


const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: SURFACE,
  },
  hidden: {
    opacity: 0,
  },
  // The reel and what floats over it. A flow sibling ABOVE the strip, so the
  // strip's height comes off the photo rather than covering it.
  body: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 0,
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
  // The bar under the card (ProfileActionBar). Only the gutter, the ground and
  // the lift are here — the title's type is SheetTitle's, the options are
  // OptionStrip's, and the air is set inline from the popup's own tokens. The
  // lift is THE DOCK'S (user directive 2026-07-31): this bar and home's dock are
  // one object, so the band hovers off what it stands over by exactly the same
  // amount in both places. There is no rule along its top and there must never
  // be one.
  profileBar: { paddingHorizontal: MD, backgroundColor: SURFACE, boxShadow: DOCK_SHADOW },
  // The popup's gap between what a thing IS and what can be done about it, here
  // between the circle's name and the strip of options. LG, not the popup's own
  // XL over a button row: the heading above this strip is a BLOCK — a face, a
  // fact line and a name — so the widest gap in the app opened a hole in the
  // middle of the bar.
  profileBarStrip: { marginTop: LG },
  // Fixed top-START row holding the ONE heading tile. Chrome, not content — a
  // sibling of the scroll view, so it stays pinned while the profile scrolls
  // under it. The width is what lets a long name flexShrink and wrap instead of
  // overflowing; justifyContent keeps the tile against the START edge whatever
  // it wraps to.
  topStartFixed: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    padding: MD,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  // Wraps the name/age chip. flexShrink keeps the chip's shrink/wrap chain intact
  // through the extra View (a plain wrapper would otherwise hide the shrink hint
  // and let a long name overflow the row). It carries NO transformOrigin: this
  // chip is out of the tap-toggle and never zooms.
  identityChipWrap: {
    flexShrink: 1,
  },
  // The box the block emerges FROM: it clips, and its width is the animation
  // (see CardTrailing). Its height is the content's own, measured — a clipping
  // box has no height of its own to give an out-of-flow child.
  trailingClip: {
    overflow: 'hidden',
    flexShrink: 0,
  },
  // The content, hung OUT OF FLOW at the box's START edge so the box can be any
  // width without squeezing it: what a narrower box does to it is hide its end,
  // which is what "sliding out of the name" is.
  trailingInner: {
    position: 'absolute',
    top: 0,
    start: 0,
  },
  // The clock and the mark that opens the message, side by side in one press
  // target. XS, not the chip's own gap: these two are one statement.
  trailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
    flexShrink: 0,
  },
  // What rides the chip after its rule — the clock, or chat's one word. The
  // chip's own label SIZE, because it is a second fact on that tile and not a
  // readout, with the chip's one emphasis on top of it (the same WEIGHT.medium
  // `Chip bold` puts on a label). Tabular figures so the tile does not breathe as
  // the digits tick. Its ink is the chip's, handed in by the render slot.
  countdown: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  infoLeft: {
    flex: 1,
    flexDirection: 'column',
    // marginBottom is set inline (infoBottomLift): the breathing room is the
    // heart's clearance, so it is there only when the heart is. Deliberately on
    // this column and not on the shared overlay padding — the heart is anchored
    // to the card's bottom edge and must not move with the chips.
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
  // The box that carries the fact set's zoom. It holds ONE child now — the
  // merged fact tile (ChipStack) — so it states no gap: the facts are divided by
  // the tile's own hairline, not by photo showing between three tiles.
  chipsStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    // The anchor the tap-toggle's zoom collapses into: the corner the fact
    // column actually lives in. transformOrigin is PHYSICAL (there is no
    // `start`), so the horizontal half follows the app's reading direction the
    // same way every other RTL flip here does. The box hugs the chips
    // vertically, so `bottom` is the last chip's own baseline edge.
    transformOrigin: isRTL ? 'right bottom' : 'left bottom',
  },
  // The circle row's gesture host — a plain box around one row, so RNGH has a
  // native view to attach its tap to. It adds nothing to the row's own box.
  chipsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  aboutSection: {
    alignItems: 'center',
    marginVertical: MD,
  },
  // Bio as a big WHITE chip floated at the bottom of the second photo, inset on
  // every side (`start` here; `end` + `bottom` set inline so both insets can
  // clear the floating heart when there is one, and neither does when there is
  // not — the tile then ends at the same ordinary bottom gap as the chips). It is
  // the SAME white tile as every other on-photo chip and round button
  // (PHOTO_CHROME) just oversized — user directive 2026-07-28 — so it is the
  // same tile in EVERY respect and not just in its fill (user directive
  // 2026-07-30): the same RADIUS, the same gutter, the same padding box as the
  // chips beside it and the same LIFT_SHADOW every on-photo tile casts.
  //
  // That box is CHIP_BLOCK_PAD — the chip's gutter on all four sides (user
  // directive 2026-07-31). The tile is a PARAGRAPH in a wide white block, and so
  // are the fact rows stacked above it now, so both take the air the gutter
  // states rather than whatever a round chrome button has left over once a line
  // of label is in it. It is still the chips' own constant and not a re-typed
  // `MD`: the two tiles must move together, which is the whole reason the bio
  // stopped declaring its own padding in the first place.
  photoBioCard: {
    position: 'absolute',
    start: MD,
    backgroundColor: PHOTO_CHROME,
    borderRadius: RADIUS,
    padding: CHIP_BLOCK_PAD,
    ...LIFT_SHADOW,
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
