import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { View, StyleSheet, ActivityIndicator, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, type DimensionValue } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, withRepeat, withSequence, withDelay, cancelAnimation, Easing, runOnJS, LinearTransition } from 'react-native-reanimated'
import { Text } from '../src/components/AppText'
const AnimatedText = Animated.createAnimatedComponent(Text)
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import { invoke, markStartupComplete, onAuthRecovered, publicImageUrl, API_TIMEOUT_MS } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { nameFromTitle } from '../src/lib/profileTitle'
import { matchImageUrls } from '../src/lib/profileImages'
import { useUserStore, resolveLocationType, selectProfileBuilt, selectWatcherCount, selectInvisibleReason, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, genderize, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, getInitialNotificationGroupId, getInitialNotificationActorId, clearInitialNotification, openNotifSettings, dismissAllNotifications, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { Spinner } from '../src/components/Spinner'
import { INK, PAGE, SURFACE, WHITE, WHITE_SOFT, WHITE_MID, INK_WASH, INK_SUBTLE, SHADOW_BLACK } from '../src/colors'
import { SM, MD, LG, XL, RADII, STROKE, WEIGHT, TEXT, ICON, PULSE, OVERLAY, GLYPH_CIRCLE_RATIO, SEARCH_WATCHDOG_SLACK_MS, SHEET_GAP, bottomGap } from '../src/tokens'
import { useBottomInset } from '../src/hooks/useBottomInset'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BuildProfileGate } from '../src/components/BuildProfileGate'
import { useBrowseAllowance } from '../src/lib/browseGate'
import { BottomSheet, SheetTitle, SheetDesc, SheetActionPair, SHEET_TITLE, SHEET_DESC } from '../src/components/BottomSheet'
import { MatchCard } from '../src/components/MatchCard'
import { SharedCirclesPopup, useSharedCircles } from '../src/components/SharedListPopup'
import { flushPendingInvite, watchInvites, communitiesSummary, pendingApprovals, type CommunitiesTarget } from '../src/lib/communities'
import { RisingCard } from '../src/components/RisingCard'
import { OverlaySheet } from '../src/components/OverlaySheet'
import { HomeArt } from '../src/components/HomeArt'
import { HomeDock, type DockItem } from '../src/components/HomeDock'
import { CreditCost } from '../src/components/CreditCost'
import { CREDIT_COST, creditTotal, creditHeld, creditsForApprove } from '../src/lib/credits'
import { clearChatCache } from '../src/lib/chatCache'
import { claimInstallReferral } from '../src/lib/referral'
import { BuyExtraPopup } from '../src/components/BuyExtraPopup'
import { PullPane, usePullBehavior } from '../src/components/PullPane'
import { PreviewFieldPage, PreferencesPopup, AppSettingsPopup } from '../src/components/SettingsSurfaces'
import { CommunitiesPage } from '../src/components/CommunitiesPage'
import ChatPage from './chat'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'
import { useSelfAvatar, setSelfAvatarFromLocal, setSelfAvatarFromRemote } from '../src/lib/selfAvatar'
import { useChatHasUnread } from '../src/hooks/useChatHasUnread'
import { FIXED_BOX_SCALE } from '../src/fonts'
import { SEEN_FLAGS } from '../src/keys'
import { hasSeenFlag, markSeenFlag } from '../src/lib/seenFlags'
import { PauseIcon, HeartIcon, ChatIcon, MapPinIcon, BellIcon, WifiOffIcon, SignOutIcon, BlockIcon, InboxIcon, GlyphScale, CloseIcon, UserIcon, CameraIcon, ShieldIcon, GroupsIcon, SearchIcon, CreditIcon } from '../src/components/icons'
import type { CardAction, CardCountdown } from '../src/components/MatchCard'
import { AppStatusBar } from '../src/components/AppStatusBar'


// ── Avatar rings: static halo + radar pulse ───────────────────────────────

// The one action surface on home. Everything around it — the halo, the dotted
// ring, the glyph inside — derives from this number, so the whole centre grows
// with a single edit. Nudged up from 130 (user directive 2026-07-28) to give
// the page's only call to action a bit more presence; the lift below does the
// rest, and nothing here moves at rest.
const AVATAR_SIZE = 142
// Glyph inside that circle (play / pause / hamburger / spinner). Derived from
// the same ratio every round button uses, so the center action surface keeps
// the same padding ring as the chrome buttons instead of a hand-picked size.
const CENTER_GLYPH_SIZE = Math.round(AVATAR_SIZE * GLYPH_CIRCLE_RATIO)
const RADAR_RING_COUNT = 3
const RADAR_DURATION = 4200
const RADAR_STAGGER = RADAR_DURATION / RADAR_RING_COUNT
const RADAR_START_SCALE = 1.0
const RADAR_END_SCALE = 2.6
const RADAR_PEAK_OPACITY = 0.42

function RadarRing({ active, ringIndex }: { active: boolean; ringIndex: number }) {
  const progress = useSharedValue(1)

  useEffect(() => {
    cancelAnimation(progress)
    if (active) {
      progress.value = withDelay(
        ringIndex * RADAR_STAGGER,
        withRepeat(
          withSequence(
            withTiming(0, { duration: 0 }),
            withTiming(1, { duration: RADAR_DURATION, easing: Easing.out(Easing.cubic) }),
          ),
          -1,
          false,
        ),
      )
    } else {
      progress.value = withTiming(1)
    }
  }, [active])

  const style = useAnimatedStyle(() => {
    const t = progress.value
    // Ring is brightest right at the photo edge (t≈0) and dissolves
    // smoothly with a cubic ease-out as it sweeps outward — classic ripple.
    const out = 1 - t
    const fade = out * out * out
    return {
      opacity: RADAR_PEAK_OPACITY * fade,
      transform: [{ scale: RADAR_START_SCALE + (RADAR_END_SCALE - RADAR_START_SCALE) * t }],
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: STROKE.base,
        borderColor: INK,
      }, style]}
    />
  )
}
// (RadarRing borderColor set to WHITE below so the pulse reads on the
// deep-wine INK page — INK-on-INK was invisible.)

function RadarRings({ active }: { active: boolean }) {
  return (
    <>
      {Array.from({ length: RADAR_RING_COUNT }, (_, i) => (
        <RadarRing key={i} active={active} ringIndex={i} />
      ))}
    </>
  )
}

const HALO_SIZE = Math.round(AVATAR_SIZE * 1.55)
const DOTTED_RING_SIZE = Math.round(AVATAR_SIZE * 1.55)

// WHERE THE BIG CIRCLE SITS in the band between the topbar and the dock: dead
// CENTRE (user directive 2026-07-30). The page is then read as three bands of
// its own making — the headline centred in everything above the circle, the
// circle on the middle line, the art centred in everything below it — and each
// of the three is centred in ITS band rather than stacked with a gap, so nothing
// on this page measures a distance to anything else.
//
// One number, because four things have to agree about that line and any drift
// between them is visible: the circle is centred ON it, the headline band ends
// at it, the art band begins at it, and the pull-tutorial lands the descending
// card's edge on it.
//
// It is applied as a PERCENTAGE of the band, never as a computed dp: the band's
// height is a layout result, and reading it back into React would place the
// circle a frame late and re-render the page every time the band changed.
const CIRCLE_CENTER = 1 / 2
const pct = (f: number) => `${f * 100}%` as DimensionValue

function AvatarHaloRings() {
  return (
    <>
      <View pointerEvents="none" style={{
        position: 'absolute',
        width: HALO_SIZE,
        height: HALO_SIZE,
        borderRadius: HALO_SIZE / 2,
        // A faint wash of the ACTION hue, so the halo reads as the button's
        // own glow rather than as a grey disc parked behind it. Must stay a
        // low-alpha tint: an opaque ring competes with the button it frames.
        backgroundColor: INK_WASH,
      }} />
      <Svg
        pointerEvents="none"
        width={DOTTED_RING_SIZE}
        height={DOTTED_RING_SIZE}
        style={{ position: 'absolute' }}
      >
        <Circle
          cx={DOTTED_RING_SIZE / 2}
          cy={DOTTED_RING_SIZE / 2}
          r={DOTTED_RING_SIZE / 2 - 2}
          stroke={INK}
          strokeWidth={1.5}
          strokeDasharray="2 5"
          fill="none"
          opacity={0.45}
        />
      </Svg>
    </>
  )
}

// Geometry for the pull-to-skip hint label.
const SKIP_HINT_HEIGHT = 58
const SKIP_HINT_FONT = 26
// The headline's letter tracking — this screen's heading type.
const SKIP_HINT_TRACKING = 2
// The headline's symmetric side gutter (user directive 2026-07-30). The SVG is
// sized to (window − 2 × HPAD), so this is the one number that decides where a
// line may end on either side.
//
// It used to be read against the shell's floating hamburger, whose column the
// text was not allowed to run into. That button is gone (its menu is the dock at
// the foot of the page now) and the top of the screen belongs to nothing, so XL
// is simply the gutter the headline reads best at: wide enough to frame it,
// narrow enough to leave a usable line width.
//
// It was MD * 2 while the label shrank to fit — wide side margins cost nothing
// when the font is free to shrink — then MD once the size was fixed, since every
// pixel of pad is a pixel the wrap can't use.
const SKIP_HINT_HPAD = XL
// Vertical advance for each wrapped line beyond the first. With
// SKIP_HINT_HEIGHT it is what the label's own SVG box grows by per wrapped
// line — the box hugs the lines it actually drew (see HeadlineArea).
const SKIP_HINT_LINE_H = 30

// Estimated rest-state pixel width per character at semibold + the 2px
// letterSpacing the label draws with. Slightly over-estimates, so wrapping
// decisions err toward breaking early rather than clipping.
const skipHintCharW = (font: number) => font * 0.58 + 2

// Headline pools: each i18n block split into lines (trimmed, blanks dropped,
// so adding/removing a sentence in i18n is the only edit needed).
//   READY_HEADLINES — shown in the headline slot above the centre button
//     while the home pane is in the ready state (no card).
//   SKIP_HEADLINES  — skip-feedback lines; one is parked in that same slot
//     behind whatever card is showing (a fresh one per card) and is revealed
//     when the user pulls the card away to skip (see headlineText +
//     skipHeadlineIdx).
const READY_HEADLINES = t('home.readyHeadlines').split('\n').map(s => s.trim()).filter(Boolean)
const SKIP_HEADLINES = t('home.skipHeadlines').split('\n').map(s => s.trim()).filter(Boolean)
// Returns a random index in [0, count) that differs from `prev` when possible,
// so a pool never repeats the line it just showed.
function pickHeadline(prev: number, count: number): number {
  if (count < 2) return 0
  let next = prev
  while (next === prev) next = Math.floor(Math.random() * count)
  return next
}

// A comma or period inside a headline is a written pause. At this size the
// layout says it better than the glyph does, so the break REPLACES the
// punctuation (it is dropped, not moved to the end of the first line) — and
// it wins even over a string that would have fit on one line, since that is
// the shape the copy was written for. Guarded so it can't disfigure the long
// permission / gate notices that share this slot: the pause must land near
// the middle (MIN_BALANCE) and both halves must fit, else the plain
// width-driven path below takes over.
const HEADLINE_PAUSE = /[,.]/
const HEADLINE_MIN_BALANCE = 0.4

function splitAtPause(text: string): string[] | null {
  const mid = text.length / 2
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < text.length - 1; i++) {
    // Followed by a space ⇒ a real pause, not a decimal point or an
    // abbreviation dot sitting inside a word.
    if (!HEADLINE_PAUSE.test(text[i]) || text[i + 1] !== ' ') continue
    const d = Math.abs(i - mid)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  if (best === -1) return null
  const head = text.slice(0, best).trim()
  const tail = text.slice(best + 1).trim()
  if (!head || !tail) return null
  const balance = Math.min(head.length, tail.length) / Math.max(head.length, tail.length)
  return balance < HEADLINE_MIN_BALANCE ? null : [head, tail]
}

// Splits a string into two lines at the space closest to its character
// midpoint. Used for the two-line case, where a balanced break reads better
// than a greedy one that leaves a stub on the second line.
function splitAtMidSpace(text: string): string[] {
  const mid = text.length / 2
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      const d = Math.abs(i - mid)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
  }
  if (best === -1) return [text]
  // The forced line break already supplies the pause a comma at the split
  // point was carrying, so a trailing comma on the first line just dangles.
  return [text.slice(0, best).replace(/,\s*$/, ''), text.slice(best + 1)]
}

// Breaks `text` into the lines it needs to fit the padded width `w` AT ONE
// FIXED SIZE. The label used to step the font down instead, which made the
// long permission / gate strings render at ~16pt next to a 26pt skip
// headline — the same slot visibly changing size with its content. Now the
// size is constant and the line count varies.
function fitHeadline(text: string, w: number): string[] {
  const cw = skipHintCharW(SKIP_HINT_FONT)
  const fits = (s: string) => s.length * cw <= w

  // A written pause becomes the break, before length is even consulted.
  const paused = splitAtPause(text)
  if (paused && paused.every(fits)) return paused

  if (fits(text)) return [text]

  const balanced = splitAtMidSpace(text)
  if (balanced.length > 1 && balanced.every(fits)) return balanced

  // Greedy wrap for anything that needs three lines or more.
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (line && !fits(candidate)) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

// "לא עכשיו" label revealed behind the match card during a pull-to-skip
// gesture. The fill uses a tonal vertical gradient — fully opaque solid
// grays that shift from dark at the top to lighter at the bottom. Because
// both stops are 100% opaque, every letterform stays crisp at every point
// of its outline (the previous opacity-fade gradient was breaking the
// bottoms of letters into a ghosted look). The gradient still creates a
// subtle "printed into the page" depth without compromising legibility.
function SkipHintLabel({ text }: { text: string }) {
  const w = Dimensions.get('window').width - SKIP_HINT_HPAD * 2
  // One size for every string; length is absorbed by wrapping. A single word
  // too wide for the pad still falls back to textLength/lengthAdjust
  // glyph-compression below, since there is nowhere to break it.
  const lines = fitHeadline(text, w)
  const font = SKIP_HINT_FONT
  // SVG height grows downward only when wrapping engages. The bottom-line
  // baseline stays anchored at the original 1-line position (relative to
  // the SVG's bottom edge), so the parent fixed-height container can
  // bottom-align the SVG and keep the avatar below at a stable position.
  const h = SKIP_HINT_HEIGHT + (lines.length - 1) * SKIP_HINT_LINE_H
  const bottomBaseline = h - SKIP_HINT_HEIGHT * 0.28
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="skipHintFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity={1} />
          <Stop offset="1" stopColor={INK} stopOpacity={1} />
        </SvgLinearGradient>
      </Defs>
      {lines.map((line, i) => {
        const lineNaturalW = line.length * skipHintCharW(font)
        const fit = lineNaturalW > w
        const y = bottomBaseline - (lines.length - 1 - i) * SKIP_HINT_LINE_H
        return (
          <SvgText
            key={i}
            x={w / 2}
            y={y}
            fill="url(#skipHintFade)"
            fontSize={font}
            fontWeight={WEIGHT.medium}
            textAnchor="middle"
            letterSpacing={SKIP_HINT_TRACKING}
            textLength={fit ? w : undefined}
            lengthAdjust={fit ? 'spacingAndGlyphs' : undefined}
          >
            {line}
          </SvgText>
        )
      })}
    </Svg>
  )
}

// The gradient headline, in a box that is exactly as tall as the lines it drew.
//
// It used to reserve a FIXED three-line height, bottom-anchored, and that was
// load-bearing for a reason that no longer exists: the headline and the avatar
// shared one flow, so a constant height was the only thing keeping the avatar at
// the same screen position whatever the line count. The circle is centred on the
// page by itself now (permCenterGroup) and the headline is centred in its own
// band above it (permHeadlineBand) — a reserved height would simply centre the
// EMPTY RESERVATION instead of the text, putting a one-line headline low in the
// band and a three-line one high.
//
// The trade the directive makes: a headline's first line no longer lands on a
// fixed y. Swapping a one-line string for a two-line one now moves both lines,
// because what stays put is their centre.
function HeadlineArea({ text }: { text: string }) {
  return (
    <View style={headlineAreaStyle.area}>
      <SkipHintLabel text={text} />
    </View>
  )
}

const headlineAreaStyle = StyleSheet.create({
  area: {
    alignItems: 'center',
  },
})

// (There is no page-signature block any more. The drawing is centred in the band
// BELOW the circle now — see `permArtBand` — and the two things that used to
// stand under it there are both gone: the app's wordmark was deleted outright,
// and the dock is not part of page1 at all, it is a strip below it.)

// ── Message ────────────────────────────────────────────────────────────────
// Centered title + description block. Used as the main content surface for
// every per-state variant of this screen (HIDDEN, WATCHING, WAITING, etc.).

// (The chat menu's sheet carries no styles of its own: the gutter and the air
// above its first button are the popup's, and its two buttons are a
// <SheetActions flush> like every other popup's — see the sheet itself below.)

// ── Invite timer ──────────────────────────────────────────────────────────
// The visible countdown is NOT here any more (user directive 2026-07-30): it
// rides inside the name/age chip on the card itself — see CardCountdown in
// MatchCard.tsx, which owns both the tick (src/lib/countdown.ts) and the clock's
// place on screen. This screen only decides WHICH card has a deadline on it.

// True once `expiresAt` has passed. Unlike useSecsLeft this does NOT tick every
// second — it schedules a single timeout for the exact remaining interval and
// re-renders once at the boundary. Used for the silent watching-card expiry
// (no visible countdown, so per-second re-renders of this large component would
// be pure waste). Re-evaluates on mount too, so a card whose clock already
// lapsed while the app was backgrounded renders as expired on the very first
// paint — no flash, no wait for the hourly cron teardown or a network fetch.
function useLapsed(expiresAt: string | null | undefined): boolean {
  const target = expiresAt ? new Date(expiresAt).getTime() : 0
  const [lapsed, setLapsed] = useState(() => (target ? Date.now() >= target : false))
  useEffect(() => {
    if (!target) { setLapsed(false); return }
    if (Date.now() >= target) { setLapsed(true); return }
    setLapsed(false)
    const id = setTimeout(() => setLapsed(true), target - Date.now())
    return () => clearTimeout(id)
  }, [target])
  return lapsed
}

// ── StatusCard scaffold ──────────────────────────────────────────────────
// Visual scaffolding shared by InviteTimerCard (page1 invite timer), EventMessageCard
// (terminal locked-message states) and ViewersStatusCard (Viewers empty-state).
// All three render the same card surface with optional title, description, and
// a stack of full-width Buttons below — and NOTHING between the two (user
// directive 2026-07-30): the invitation countdown that used to stand there is on
// the card's name/age chip now, so what is left is the popup's own rhythm, a
// heading with its sentence and then SHEET_GAP.actions of air before what the
// user can do about it.

// Smooth layout transition for the card interior. When the description text
// or the button stack grows/shrinks, height changes animate in sync instead
// of snapping.
const STATUS_LAYOUT = LinearTransition

const statusCardStyles = StyleSheet.create({
  // The message card is INVERTED relative to the page it announces on: a light
  // surface carrying INK ink, with a purple action button. It used to be a
  // solid purple slab with white text, which made the whole screen purple and
  // left no room for the action to stand out.
  container: {
    // The scaffold's own ground, the PAGE tint. Every CARD use (page1 status
    // block, page2 invite topBlock) sits directly under a photo inside a
    // MatchCard, so a transparent gap here would show the backdrop as a stripe.
    backgroundColor: PAGE,
    paddingVertical: LG,
    paddingHorizontal: MD,
  },
  // Ground and FRAME off, for the one use that lives in a POPUP: a popup is
  // WHITE (user directive 2026-07-28) and paints its own ground, and its gutter,
  // its top air and its bottom gap are the sheet's — one set of values for every
  // popup in the app (BottomSheet.tsx). The scaffold's own LG/MD padding on top
  // of that is what made this popup sit at a different indent and a different
  // height from every other one.
  containerInPopup: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  // The body paragraph IS the popup's description (SHEET_DESC in
  // BottomSheet.tsx) — the same size, the same full-strength ink, the same
  // centring and, above all, the same gap under the heading, so this card reads
  // identically whether it is standing on a photo or inside the invite popup.
  // BODY size, not the heading's (user directive 2026-07-30): the card states one
  // thing as its heading and explains it underneath, so the explanation is the
  // app's ordinary paragraph step and the rank difference is carried by SIZE.
  // No fontWeight: rendered through AppText, so this resolves to the real
  // NotoSansHebrew_400Regular face, against the heading's Medium.
  description: {
    ...SHEET_DESC,
    includeFontPadding: false,
  },
  // The heading sits on its own line above the body (user directive
  // 2026-07-26), and it is THE popup title (SHEET_TITLE) — a status card's
  // heading and a dialog's are the same rank of text. Through AppText this picks
  // the real weighted Noto face, not a synthetic bold. The gap under it belongs
  // to the description above, not here: two margins would stack.
  heading: {
    ...SHEET_TITLE,
    includeFontPadding: false,
  },
})

// Shared heading+body text for every StatusCard variant (InviteTimerCard /
// EventMessageCard / ReplyingInviteCard). The bold heading gets its own line
// (real weighted Noto SemiBold face, not synthetic), a small gap, then the
// body paragraph below it (user directive 2026-07-26 — heading was previously
// an inline period-terminated lead-in on the same line as the body). A
// trailing PERIOD is stripped so the standalone heading never ends on one
// (CLAUDE.md "i18n text style") — `?` and `!` are left alone, they are the
// heading's own voice ("להזמין אותה לצ׳אט?").
function StatusCardText({ title, description }: { title: string; description: string }) {
  const head = title.trim().replace(/\.+$/, '')
  return (
    <>
      <AnimatedText layout={STATUS_LAYOUT} style={statusCardStyles.heading}>
        {head}
      </AnimatedText>
      <AnimatedText layout={STATUS_LAYOUT} style={statusCardStyles.description}>
        {description}
      </AnimatedText>
    </>
  )
}

// (`InviteTimerCard` and `EventMessageCard` stood here until 2026-08-01: the two
// status cards that were rendered at the TOP of the match card's scroll, each a
// title, a paragraph and one full-width button. Both are deleted. Their title is
// the line in the card's own strip, their button is the chip at the end of it,
// and their paragraphs are gone — for every one of those states the paragraph
// restated the title and then said in words what the chip now says as a verb
// ("אפשר להמשיך הלאה" → "המשך"). What is left of the scaffold below —
// `StatusCardText`, `statusCardStyles`, `statusButtonStyles` — belongs to
// `ReplyingInviteCard`, which survives for its POPUP use: the page1 send-invite
// prompt, which is a surface the app raises and not a state on a card.)

// ── The card's message, as a popup ────────────────────────────────────────
// (user directive 2026-08-01.) What `InviteTimerCard` and `EventMessageCard`
// used to paint at the TOP of the match card's scroll: a heading, its sentence,
// and the ONE thing to do about it. It is a popup body now — raised by the
// chevron beside the clock on the card's heading chip — because the message was
// never wrong, only its place was: at the top of a scroll it left the screen the
// moment the reader went down to the face.
function CardMessage({ title, description, label, icon, busy, onPress }: {
  title: string
  description: string
  label: string
  /** The mark on the button, when the button HAS one. "Back to the game" never
   *  does (user directive 2026-08-01): it is not an operation on anything, it is
   *  the way out of a card that is finished with, and a mark beside those three
   *  words only asks the reader what it means. */
  icon?: React.ReactNode
  busy?: boolean
  onPress: () => void
}) {
  return (
    <View style={[statusCardStyles.container, statusCardStyles.containerInPopup]}>
      <StatusCardText title={title} description={description} />
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <Button label={label} variant="primary" onPress={onPress} iconStart={icon} loading={busy} />
      </Animated.View>
    </View>
  )
}

// ── ReplyingInviteCard ───────────────────────────────────────────────────
// THE SEND-INVITE PROMPT, and only that since 2026-08-01: the popup the hero
// heart raises in the watching state, asking whether to invite the person on the
// card. Title, one paragraph, and an accept CTA carrying the CreditCost badge
// (gem × N) so what the press spends is legible at the moment of pressing.
//
// It used to be BOTH sides of an invitation — the incoming one was this same
// card standing at the top of the page2 profile, with a ghost decline beside the
// accept — and that side is now two chips in the card's own strip, so the
// `declineLabel` / `onDecline` pair went with it. What is left is a popup, which
// is what this shape is for: a surface the app RAISES to ask something, as
// against a state a card is simply IN.
//
// `inPopup` hands the card's BOTTOM to the sheet: a BottomSheet ends every popup
// on the one standard gap, so the scaffold's own paddingBottom would stack a
// second LG under the button.
function ReplyingInviteCard({
  title,
  description,
  acceptLabel,
  declineLabel,
  costCredits,
  affordable = true,
  onAccept,
  onDecline,
  onUnaffordable,
  busy,
  acceptLoading,
  inPopup,
}: {
  title: string
  description: string
  acceptLabel: string
  /** The ghost decline CTA. Omitted on the page1 send-prompt (user directive
   * 2026-07-25: no Skip button there — the card is dismissed by swiping the
   * sheet down, and a person is skipped by the page1 pull gesture instead). */
  declineLabel?: string
  /** Stars the accept action spends — shown as the in-button cost badge
   * (heart + N). Reads "0" on the free page1 invite prompt so the user
   * sees that inviting costs nothing. */
  costCredits: number
  /** False ⇒ the user can't afford the accept. When `onUnaffordable` is
   * also set, the accept button stays styled as a normal white CTA but its
   * press fires `onUnaffordable` (typically opens the buy-extra popup)
   * instead of `onAccept`. Without `onUnaffordable` the button falls back
   * to the legacy faded-disabled look + silent no-op. */
  affordable?: boolean
  onAccept: () => void
  /** Fired by the decline CTA. Omitted together with `declineLabel` on the
   * page1 send-prompt, which has no Skip button. */
  onDecline?: () => void
  /** Tapped when the user is unaffordable. Routes to the buy-extra popup
   * so the user has a one-tap recovery path. When unset, the button silently
   * dims and does nothing on press. */
  onUnaffordable?: () => void
  busy?: boolean
  acceptLoading?: boolean
  /** Drops the scaffold's PAGE ground so the popup's own white shows through
   * (user directive 2026-07-28: every popup is white). The one call site passes
   * it — the tinted form was the incoming-invitation card, which sat straight on
   * a photo and is now the strip's second row. */
  inPopup?: boolean
}) {
  const unaffordable = affordable === false
  const hasFallback = unaffordable && onUnaffordable != null
  // Disabled visually + functionally only when actually unactionable: busy,
  // or unaffordable WITHOUT a fallback path. With a fallback the button is
  // a clickable white CTA whose tap opens the buy-extra popup.
  const acceptDisabled = busy || (unaffordable && !hasFallback)
  const handleAccept = hasFallback ? onUnaffordable! : onAccept
  return (
    <View style={[
      statusCardStyles.container,
      inPopup && statusCardStyles.containerInPopup,
    ]}>
      <StatusCardText title={title} description={description} />
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <View style={statusButtonStyles.btnRow}>
          {declineLabel != null && onDecline != null && (
            <View style={statusButtonStyles.btnDecline}>
              <Button
                variant="secondary"
                label={declineLabel}
                onPress={onDecline}
                disabled={busy}
                silentDisabled
              />
            </View>
          )}
          <View style={statusButtonStyles.btnAccept}>
            {/* The invite keeps tone="positive" for intent, but since the app
                unified onto one purple (2026-07-25) it resolves to the same
                purple as every other button — no separate action hue anymore. */}
            <Button
              variant="primary"
              tone="positive"
              label={acceptLabel}
              iconStart={costCredits > 0 ? <CreditCost color={WHITE} bg={WHITE_SOFT} /> : undefined}
              onPress={handleAccept}
              disabled={acceptDisabled}
              loading={acceptLoading}
              // Keep the in-flight lockout silent (no gray flicker) exactly as
              // before; the legacy "can't afford and no fallback" path still
              // shows the faded look. With a fallback we never hit the
              // unaffordable-disabled branch.
              silentDisabled={!unaffordable && !acceptLoading}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

// The invite prompt's button block. It served three cards until 2026-08-01 and
// serves one now; what it still states is the popup's own rhythm.
const statusButtonStyles = StyleSheet.create({
  // The same block of actions a popup ends on (SheetActions in BottomSheet.tsx):
  // the widest gap in the surface stands between what was just said and what the
  // user can do about it. Declared here rather than composed because the card
  // animates its stack (`layout={STATUS_LAYOUT}`) — the VALUE is the shared one.
  stack: {
    marginTop: SHEET_GAP.actions,
    gap: SM,
  },
  // Two-button row inside the scaffold (the incoming invitation: decline
  // secondary + accept primary). The gap above the row comes from the enclosing
  // `stack`, so the row itself is layout-only.
  // declineCell:acceptCell = 1:2 keeps the accept CTA visually dominant.
  btnRow: {
    flexDirection: 'row',
    gap: SM,
  },
  btnDecline: { flex: 1 },
  btnAccept: { flex: 2 },
  stretch: { alignSelf: 'stretch' },
  footer: {
    paddingHorizontal: MD,
    paddingBottom: SM,
    gap: SM / 2,
  },
  footerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: SM,
  },
  footerExtended: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: WHITE,
    opacity: 0.85,
    includeFontPadding: false,
  },
  footerTime: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: WHITE,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  footerBarTrack: {
    height: 4,
    backgroundColor: WHITE_MID,
    borderRadius: RADII.xs,
    overflow: 'hidden',
  },
  footerBarFill: {
    height: 4,
    backgroundColor: SURFACE,
  },
})

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { top: topInset } = useSafeAreaInsets()
  // How far the dock's glyphs stand above the screen edge. The device inset
  // ABSORBS the design gap (bottomGap), and the inset itself comes from
  // useBottomInset — never the raw safe-area value, which an IME session can
  // report as 0 and drop bottom chrome into the navigation bar.
  const dockBottom = bottomGap(useBottomInset(), LG)
  const { profile } = useUserStore()
  const router = useRouter()
  // A browse-only user (account created, profile not yet built) reaches home and
  // watches others freely, but may not SEND an invitation until they finish. The
  // watching-card send button opens this popup instead; the server enforces the
  // same rule (profileComplete). One marker, shared with the menu CTA.
  const profileBuilt = selectProfileBuilt(profile)
  const [buildProfileOpen, setBuildProfileOpen] = useState(false)
  // …AND HE MAY WATCH TWO PEOPLE BEFORE THAT (user directive 2026-07-31). The
  // browse allowance (lib/browseGate.ts) counts the faces this account has been
  // shown while it has no profile; once it is SPENT the third candidate does not
  // rise at all and home's one action surface becomes the way to the photos.
  // Three places read it and nothing else does: the play button (there is none),
  // the centre notice (which becomes the gate), and the two paths a fresh
  // candidate could arrive by — the skip's commit and the promote effect.
  const browse = useBrowseAllowance(profileBuilt)
  // Read from the pull's commit, which must not change identity because a face
  // was counted — assigned during render, like overlaysRef.
  const browseSpentRef = useRef(false)
  browseSpentRef.current = browse.spent
  // ── Single-screen shell ─────────────────────────────────────────────────
  // The app is ONE screen: page1 (home). Everything else rises over it as a
  // full-screen OverlaySheet and is dismissed by swiping down — the same
  // gesture, from the same machinery, as page1's pull-to-skip.
  //
  // Two kinds of overlay, deliberately modelled differently:
  //
  //   STACKED (this state) — user-driven surfaces the user opens and closes:
  //     the profile preview and the Circles hub (both from the dock), and chat,
  //     which is opened from the card's chat button (or a push tap) and closed
  //     by the user; the conversation itself lives on regardless.
  //
  //   DERIVED (not in this state) — the incoming-invite / dead-invite card.
  //     Its lifetime belongs to the server, so it is computed from `relations`
  //     rather than pushed and popped (see `inviteOverlayOpen`). That is what
  //     makes it impossible for it to fall out of sync with the server, and it
  //     is why a push-cold-start into an invite needs no routing at all.
  //
  // Paint order is low → high: home < invite < chat < profile sheet.
  //
  // There is no 'menu' any more (user directive 2026-07-30): the drawer, the
  // page it carried and the button that opened it are all deleted, and what it
  // held is home's dock plus the two popups the dock raises.
  type Overlay = 'chat' | 'profile' | 'communities'
  const [overlays, setOverlays] = useState<Overlay[]>([])
  // Assigned during render, NOT in an effect: the BackHandler is registered
  // once with [] deps and reads this ref, so it must never lag a render.
  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays
  const chatOpen = overlays.includes('chat')
  const profileSheetOpen = overlays.includes('profile')
  // Circles hub. Its own internal view stack is popped first by hardware-back
  // via the ref below.
  const communitiesSheetOpen = overlays.includes('communities')

  const openOverlay = useCallback((kind: Overlay) => {
    tap()
    setOverlays(prev => (prev.includes(kind) ? prev : [...prev, kind]))
  }, [])
  const closeOverlay = useCallback((kind: Overlay) => {
    tap()
    setOverlays(prev => prev.filter(o => o !== kind))
  }, [])
  const closeTopOverlay = useCallback(() => {
    tap()
    setOverlays(prev => prev.slice(0, -1))
  }, [])
  // If the app was launched from a killed state by tapping a push, open the
  // matching overlay up front so the user lands on it instead of seeing a
  // flash of home first. Cleared after first read so it doesn't replay on
  // remount.
  // Tap-routing rule (matches CLAUDE.md "Push notifications" section):
  //   chat codes  → the chat overlay
  //   page2 codes → nothing to route: the invite overlay is DERIVED, so it is
  //                 already up the moment the store hydrates
  //   page1 codes → home, i.e. no overlay
  const PAGE2_CODES = new Set(['invite-in', 'extended', 'expired-in', 'cancelled-in'])
  const CHAT_CODES = new Set(['chat', 'match'])
  // Group-lifecycle pushes carry the group_id and open THAT group: group_join on
  // its manage page (where the join request waits), group_approved on its member
  // sheet (the approved requester is a plain member, not staff). The sheet
  // resolves which of the two from the caller's own membership. group_owner is
  // the succession push: the previous owner deleted their account and the group
  // is now this user's, so the tap lands on it as staff.
  const GROUP_CODES = new Set(['group_join', 'group_approved', 'group_pending', 'group_owner'])
  // Friend-lifecycle pushes open the friends list — where an incoming request's
  // approve/decline lives, and where a new friend shows up.
  const FRIEND_CODES = new Set(['friend_request', 'friend_accept', 'friend_link'])
  // A push about a PERSON lands on that person's page, with the buttons that
  // page owns (user directive 2026-07-27): a join request opens the requester's
  // profile with approve/decline, a new friend opens their page in My Friends.
  // The 48h queue nudge opens the queue. Everything else keeps its old landing.
  const communitiesTargetFor = useCallback(
    (type: string, groupId?: string | null, actorId?: string | null): CommunitiesTarget | null => {
      if (type === 'group_join' && groupId && actorId) return { kind: 'request', groupId, userId: actorId }
      if (type === 'group_pending' && groupId) return { kind: 'queue', groupId }
      if (GROUP_CODES.has(type) && groupId) return { kind: 'group', groupId }
      if (type === 'friend_link' && actorId) return { kind: 'friend', userId: actorId }
      if (FRIEND_CODES.has(type)) return { kind: 'friends' }
      return null
    },
    // GROUP_CODES / FRIEND_CODES are module-level constants in this scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // The launch notification is read DURING RENDER, its ids included: the effect
  // below clears it, and effects run in declaration order, so reading the ids
  // later resolved to nothing and a targeted deep-link opened the bare hub.
  type InitialNotif = { overlay: Overlay; target: CommunitiesTarget | null }
  const initialNotif = useMemo<InitialNotif | null>(() => {
    const type = getInitialNotificationType()
    if (!type) return null
    if (CHAT_CODES.has(type)) return { overlay: 'chat', target: null }
    if (GROUP_CODES.has(type) || FRIEND_CODES.has(type)) {
      return {
        overlay: 'communities',
        target: communitiesTargetFor(type, getInitialNotificationGroupId(), getInitialNotificationActorId()),
      }
    }
    return null
  }, [])
  useEffect(() => {
    if (initialNotif !== null) clearInitialNotification()
  }, [])
  // First-render only: routing for the notification that LAUNCHED the app — a
  // chat/match push opens the chat, a group/friend deep-link opens Communities
  // on its target. An active chat on its own does NOT open the sheet any more
  // (user directive 2026-07-28, reverses the 2026-07-19 decision): this effect
  // runs on every home MOUNT, not only a cold start, so returning from
  // onboarding or any guard re-route raised a chat the user had deliberately
  // swiped closed. Opening the app now always lands on home; the card's chat
  // button is the way in. state→chat transitions during the session are owned
  // by the chat-transition effect below.
  useEffect(() => {
    if (initialNotif?.overlay === 'chat') {
      setOverlays(['chat'])
    } else if (initialNotif?.overlay === 'communities') {
      if (initialNotif.target) setCommunitiesTarget(initialNotif.target)
      setOverlays(['communities'])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Unread message count reported by ChatPage — drives the alert pulse on the
  // card's open-chat button while the chat overlay is closed.
  const [chatUnread, setChatUnread] = useState(0)
  // Persistent "new messages" marker for the card's open-chat button. Unlike
  // `chatUnread` (only live while ChatPage is mounted, i.e. the sheet is open),
  // this works while the chat is CLOSED — exactly when the dot is needed. See
  // useChatHasUnread.
  const chatHasUnread = useChatHasUnread(chatOpen)
  // The queue on the dock's Circles entry: someone is waiting on an answer of
  // mine (a join request on a group I manage, or an incoming friend request),
  // and the dock is the only way to it. Read off the denormalized
  // relations.communities summary the settings row already counts from — one
  // source, so the marker and the row it leads to can never disagree.
  //
  // A COUNT, not a boolean (user directive 2026-07-30): people waiting is a
  // QUANTITY, and the dock says a quantity with a chip rather than a dot — see
  // the dock block below.
  const pendingCount = pendingApprovals(communitiesSummary(profile))
  // ── "You haven't met your circles yet" ──────────────────────────────────
  // A brand-new user meets the app as a stream of faces and has no way to learn
  // that WHO he is shown depends on his circles. The app used to say that by
  // FORCE: after the third profile he watched, the Communities hub was thrown
  // over the card he was looking at with a popup explaining itself. That is
  // deleted (user directive 2026-07-30) — nothing takes the screen away from a
  // user to teach him something. The DOCK says it instead, in the app's own
  // vocabulary for "there is something for you behind here": the notification
  // dot on Circles, which is spent by the door OPENING. He taps Circles, the hub
  // is there, the dot is gone; after that only a real queue (someone waiting on
  // my approval) can light it again — which is the badge's other half below.
  //
  // Starts `true` so a returning user never gets a frame of dot before the disk
  // answers; only an unset flag turns it on.
  const [circlesSeen, setCirclesSeen] = useState(true)
  useEffect(() => {
    void (async () => {
      if (!(await hasSeenFlag(SEEN_FLAGS.circlesSeen))) setCirclesSeen(false)
    })()
  }, [])
  // Spent by the hub actually OPENING, not by the tap that asked for it: the tap
  // is one of four routes in (the dock, a push, an invite link, a cold start's
  // initial notification) and one of them is refused outright — a user with no
  // profile yet gets the members-only gate and never sees the page, so his dot
  // must stay. One effect covers all four, and no route can forget to.
  //
  // **`profileBuilt` is part of the condition, not decoration.** Not every route
  // in runs the gate: the cold-start notification effect sets the overlay stack
  // DIRECTLY (`setOverlays(['communities'])`), and on a cold start `profile` is
  // still null when it does, so the hub is briefly "open" before the guard effect
  // below sees the loaded profile, closes it and raises the members-only popup.
  // Marking on `circlesOpen` alone therefore burned the flag for a user who never
  // saw the page — and, being persisted, it burned it forever: he finished his
  // profile and the dot never came. Requiring entitlement here makes the flag mean
  // exactly what its name says, "has been INSIDE Circles", on every route in.
  const circlesOpen = overlays.includes('communities')
  useEffect(() => {
    if (!circlesOpen || !profileBuilt) return
    setCirclesSeen(true)
    void markSeenFlag(SEEN_FLAGS.circlesSeen)
  }, [circlesOpen, profileBuilt])
  // Whether the chat partner is currently online — reported by ChatPage via
  // its presence channel. Drives the presence dot in the chat sheet's header.
  const [partnerOnline, setPartnerOnline] = useState(false)
  // Dismiss any open keyboard whenever the overlay stack changes so it never
  // lingers visually over a surface that doesn't own the focused input.
  useEffect(() => { requestAnimationFrame(() => Keyboard.dismiss()) }, [overlays.length])

  // Measured height of the page1 pane (the area the
  // match card fills). Handed to MatchCard as `cardHeight` so the hero photo
  // is correctly sized on its first render — the card then rises as one solid
  // block instead of measuring-itself-then-revealing partway up the slide.
  const [paneHeight, setPaneHeight] = useState(0)
  // The profile sheet stacks ON TOP of the menu it was opened from, so
  // closing it returns to the menu rather than all the way home.
  const openProfileSheet = useCallback(() => openOverlay('profile'), [openOverlay])
  const closeProfileSheet = useCallback(() => closeOverlay('profile'), [closeOverlay])
  const openCommunities = useCallback(() => openOverlay('communities'), [openOverlay])
  const closeCommunities = useCallback(() => closeOverlay('communities'), [closeOverlay])
  // Where a notification tap (or a redeemed invite link) wants the Communities
  // sheet to land: a person's page, a queue, a group, or the friends list. The
  // sheet seeds its whole page stack from it and then calls onTargetConsumed.
  const [communitiesTarget, setCommunitiesTarget] = useState<CommunitiesTarget | null>(null)
  // Cleared on the open→closed TRANSITION only. Not "whenever it is closed":
  // the effects that route a cold-start push set the target and open the sheet
  // in the same pass, so this one still sees `closed` on mount and would wipe
  // the target it was launched with.
  const communitiesWasOpen = useRef(false)
  useEffect(() => {
    if (communitiesWasOpen.current && !communitiesSheetOpen) setCommunitiesTarget(null)
    communitiesWasOpen.current = communitiesSheetOpen
  }, [communitiesSheetOpen])
  // The hub owns an internal view stack; hardware-back pops that first and only
  // asks the shell to close the sheet once it is back at its hub (returns false).
  const communitiesBackRef = useRef<() => boolean>(() => false)

  // chatAvailable: state is 'chat'
  const chatAvailable = profile?.state === 'chat'
  const [chatJustStarted, setChatJustStarted] = useState(false)
  // Last known chat partner, assigned DURING render (like overlaysRef): the
  // store nulls `match` in the same update that drops `state` out of 'chat',
  // so the leaving-chat effect would otherwise have no id left to clear the
  // conversation's local cache with.
  const chatPartnerRef = useRef('')
  if (profile?.relations?.match?.user_id) chatPartnerRef.current = profile.relations.match.user_id

  // ── Geo-availability gate ───────────────────────────────────────────────
  // The server writes relations.availability from the admin-defined areas:
  // 'unavailable' (outside every enabled area) or 'not_yet' (inside one that
  // has not opened yet, with starts_at). While gated, the home pane shows a
  // single fixed message in the rotating-headline slot, the find button is
  // suppressed, and the side tab is removed so page2/chat is unreachable.
  // Absent / 'available' → normal behaviour (also the no-areas-configured
  // case, so this is fully backward compatible).
  //
  // Scoped to the idle world: an active chat is never gated (a user who
  // matched before being geo-gated keeps their conversation — tearing it
  // down would be destructive, and the gate UI is the discovery screen).
  const availability = (profile?.relations as { availability?: { state?: string; starts_at?: string; reason?: 'group' | 'push' } } | undefined)?.availability
  const availStartsAt = availability?.starts_at ? Date.parse(availability.starts_at) : 0
  // 'not_yet' lifts itself the moment its start time passes; tick locally so
  // the gate clears without waiting for the next server round-trip (the next
  // /app/focus or /app/start reconfirms server-side anyway).
  const [, setGateTick] = useState(0)
  useEffect(() => {
    if (availability?.state !== 'not_yet' || !availStartsAt) return
    const ms = availStartsAt - Date.now()
    if (ms <= 0) return
    // setTimeout caps at int32 ms; clamp and let the re-render reschedule.
    const timer = setTimeout(() => setGateTick(v => v + 1), Math.min(ms + 500, 0x7fffffff))
    return () => clearTimeout(timer)
  }, [availability?.state, availStartsAt])
  const geoGated = !chatAvailable && (
    availability?.state === 'unavailable' ||
    (availability?.state === 'not_yet' && (!availStartsAt || Date.now() < availStartsAt))
  )
  // The launch moment ({date} in home.geoGate.notYet), formatted short as
  // DD/MM HH:MM from the area's starts_at. Kept short on purpose: the gate
  // text shares the rotating-headline slot (SkipHintLabel), which is tuned
  // for brief phrases — a long date string overflows/clips there.
  const gateWhenStr = (() => {
    if (!availStartsAt) return ''
    const d = new Date(availStartsAt)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
  })()


  // ── Notification tap handler ────────────────────────────────────────────
  // Chat codes open the chat overlay. page2 codes need no routing: the invite
  // overlay is derived from `relations`, so it is already up. Everything else
  // means "look at home", which is the empty stack.
  // Both values are read through refs assigned during render, because
  // `overlaysGated` depends on isPermMode, which is derived much further down.
  const openOverlayRef = useRef(openOverlay)
  openOverlayRef.current = openOverlay
  // Communities are members-only, exactly as on the menu row that opens the hub:
  // a browse-only account (profile not built) may not enter, because every
  // surface in there shows the user to other people. The rule has to hold on the
  // ROUTED entries too — a new user who installed through a friend's invite link
  // is sent straight to the hub by watchInvites with no profile yet. Decided off
  // a ref because the routers below are registered once with [] deps; while
  // `profile` is still null nothing is decided (a cold start knows nothing yet)
  // and the guard effect underneath catches it the moment the profile lands.
  const [commGateOpen, setCommGateOpen] = useState(false)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const routeToCommunities = useCallback(() => {
    // The refused branch taps too. The dock's keys carry no haptic of their own
    // (their openers fire it), and the faded Circles key reaches ONLY this
    // branch — without it, the one key in the strip that is dimmed would also be
    // the only one that feels dead under the finger, which reads as broken
    // rather than as closed.
    if (profileRef.current && !selectProfileBuilt(profileRef.current)) { tap(); setCommGateOpen(true); return }
    openOverlayRef.current('communities')
  }, [])
  useEffect(() => {
    if (!profile || profileBuilt || !overlays.includes('communities')) return
    closeCommunities()
    setCommGateOpen(true)
  }, [profile, profileBuilt, overlays, closeCommunities])
  const overlaysGatedRef = useRef(false)
  useEffect(() => {
    return addNotificationTapListener((type, groupId, actorId) => {
      if (GROUP_CODES.has(type)) {
        // Every group code deep-links to the group it names; the menu family is
        // never gated, so Communities is always reachable.
        const t = communitiesTargetFor(type, groupId, actorId)
        if (t) setCommunitiesTarget(t)
        routeToCommunities()
      } else if (FRIEND_CODES.has(type)) {
        setCommunitiesTarget(communitiesTargetFor(type, groupId, actorId) ?? { kind: 'friends' })
        routeToCommunities()
      } else if (CHAT_CODES.has(type)) {
        if (!overlaysGatedRef.current) openOverlayRef.current('chat')
      } else if (!PAGE2_CODES.has(type)) {
        setOverlays([])
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Invite deep links ───────────────────────────────────────────────────
  // A tapped group/friend invite link is parked by the root URL listener and
  // redeemed as soon as a session exists (lib/communities). Home is the first
  // screen that only exists for a signed-in user, so it flushes anything still
  // parked (a link opened before sign-in) and shows the outcome: the Communities
  // hub for a joined group, its friends list for a new friend, so the tap
  // visibly did something instead of just landing on home. Watching covers both
  // orders — a cold start redeems before this mount (the outcome is held for the
  // watcher), an in-session tap long after it. The menu family is never gated,
  // so this is always reachable.
  useEffect(() => {
    const stop = watchInvites(outcome => {
      if (outcome.kind === 'friend') setCommunitiesTarget({ kind: 'friends' })
      routeToCommunities()
    })
    void flushPendingInvite()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (`openShellSubPage` is gone with the menu page that called it: the dock
  // opens the profile sheet and the Circles hub directly, so there is no
  // sub-page config to route.)

  // ── The dock: home's four entries ───────────────────────────────────────
  // Everything the menu page held, stated on the page itself (user directive
  // 2026-07-30) — profile, circles, preferences, more, in that order. Two of them
  // are SURFACES the app already had (the profile preview and the Communities
  // hub, both stacked sheets), and the other two are the menu's two CARDS of
  // settings rows, lifted into popups verbatim (see PreferencesPopup /
  // AppSettingsPopup in src/components/SettingsSurfaces.tsx). Nothing is
  // re-implemented here: this list is only which glyph and which word open which
  // of the four.
  //
  // **Circles carries the queue** — an open request in Circles is said on the
  // entry that leads to it (user directive 2026-07-30). It reads the same count
  // the shell's hamburger used to, which is why deleting that button lost
  // nothing: the queue it counted (join requests on a group I manage + incoming
  // friend requests) has always lived inside Circles.
  //
  // It says it with the NUMBER, not a dot (user directive 2026-07-30): people
  // are waiting, and how many of them is the fact. A queue is what the dot used
  // to mean, so the number stands exactly where it stood and takes precedence
  // over it (see HomeDock's `count`).
  //
  // It carries a SECOND reason, and only until it is answered once: a user who
  // has never opened Circles is told there is something here to find (see
  // `circlesSeen`) — the whole of what the forced onboarding nudge used to do.
  // That one stays a DOT: there is nothing to count about a page never opened.
  //
  // **The entry has three states, in this order, and they are one story** (user
  // directive 2026-07-30):
  //   1. no profile yet → the key is FADED (`dimmed`), glyph and word together,
  //      and carries NO marker at all. Circles is members-only, so it would
  //      point at a door the gate will refuse; the dot this user needs is the
  //      one on the PROFILE entry, which is the door that unlocks this one. The
  //      key stays pressable and taps into the members-only popup
  //      (`routeToCommunities` → `commGateOpen`), which explains the closed door
  //      and offers onboarding.
  //   2. profile built, never opened Circles → full strength, WITH the dot. Not
  //      counted, not delayed: it is there from the moment the profile exists.
  //   3. opened once → clean, until a real queue lights it again (`pendingCount`,
  //      as the purple chip).
  //
  // `routeToCommunities` is the one place the members-only rule is enforced,
  // shared with the push and invite-link routers, so the fade is only ever a
  // picture of a decision made there — never a second copy of it.
  //
  // **A QUANTITY is a number; a dot is only for what cannot be counted** (user
  // directive 2026-07-30). Three of the four entries open on a quantity — the
  // requests waiting in Circles, the people watching me, the credits I hold —
  // and each states it beside its glyph, exactly where the dot stands. The dot
  // survives for the two facts that have no number: onboarding unfinished, and
  // Circles never opened.
  //
  // **The number is bare ink: no tile, no fill, no shadow** (user directive
  // 2026-07-30, after all three wore the app's `Chip` for an afternoon — the
  // very tile each of these numbers rides on the ROW its popup opens). A tile in
  // that corner reads as a second object stuck to a 24dp mark, and it took the
  // strip's own colour question with it (which fill on which ground). The ink
  // says the whole thing, and the purple/white distinction the tiles needed is
  // simply gone. See `HomeDock`'s `count`.
  //
  // Each still follows the rule of the row it leads to, including when it is
  // absent: the watcher count only while I am actually visible AND someone is
  // there (a hidden or unbuilt user is watched by nobody, and 0 watchers is not
  // a fact worth painting), the credits count always, because a wallet always
  // has an amount — zero included, which is the number that matters most.
  const watcherCount = selectWatcherCount(profile)
  const invisibleReason = selectInvisibleReason(profile)
  // Affordability: total spendable = balance + extra. Charging deducts
  // balance first, but the user can spend any heart they have. The
  // balance/extra split is displayed in settings, not here.
  const starsBalance = creditTotal(profile)
  // The other half of the wallet: the credit standing in a deposit against an
  // invitation of my own. It rides the dock's credits key as a "+N" beside the
  // balance (user directive 2026-08-01), and it is what an ACCEPT may be paid
  // out of when the balance cannot cover it — see creditsForApprove.
  const heldCredits = creditHeld(profile)
  const approveFunds = creditsForApprove(profile)
  const [prefsPopupOpen, setPrefsPopupOpen] = useState(false)
  const [appSettingsPopupOpen, setAppSettingsPopupOpen] = useState(false)
  const dockItems = useMemo<DockItem[]>(() => [
    {
      key: 'profile',
      label: t('home.dock.profile'),
      icon: <UserIcon color={INK} size={ICON.xxl} />,
      // An UNFINISHED account opens ONBOARDING, not the preview (user directive
      // 2026-07-30), and it lands on the one step that is still missing: the
      // photos. That resume is onboarding's own (`initialStep`, which reads the
      // profile — fewer than MIN_PHOTOS photos → the photo step), so this
      // passes no step and nothing here can disagree with it. There is only one
      // resume point since 2026-07-31, when two photos became the whole
      // definition of a built profile and the bio stopped being required.
      // A preview of a profile that does not exist yet is a blank card with
      // nothing to do on it; the door has to be the flow that fills it.
      onPress: profileBuilt
        ? openProfileSheet
        : () => { tap(); router.push('/onboarding') },
      // Onboarding not finished (under two photos → the server treats this
      // account as "browse only"). Same dot the Circles entry wears for a
      // pending queue — one marker, so the entry that fixes the problem is the
      // one that says so.
      badge: !profileBuilt,
    },
    {
      key: 'circles',
      label: t('communities.menuRow'),
      icon: <GroupsIcon color={INK} size={ICON.xxl} />,
      onPress: routeToCommunities,
      // BOTH reasons hang off entitlement, not just the first-visit one: an
      // unbuilt account can still be sent a friend request, and a marker over a
      // faded key would point at a door the gate refuses — the one thing this
      // rule says must not happen. While dimmed the key carries nothing at all,
      // whatever is queued behind it; it comes back the moment the profile does,
      // with the queue intact.
      //
      // The queue is a number and the first visit is a dot, and the number wins
      // when both are true: it says everything the dot says and how many besides.
      count: profileBuilt && pendingCount > 0 ? pendingCount : undefined,
      badge: profileBuilt && !circlesSeen,
      dimmed: !profileBuilt,
    },
    {
      key: 'preferences',
      label: t('home.dock.preferences'),
      // The magnifying glass (user directive 2026-07-30, replacing the sliders
      // that stood here): what these preferences decide is WHO the app goes
      // looking for, and that is the mark every app uses for looking. The age
      // rows keep their sliders INSIDE — a row states its own field, the key
      // states what the whole set is for.
      icon: <SearchIcon color={INK} size={ICON.xxl} />,
      // The live watcher count, under the same condition the visibility row
      // inside this popup states it by, so the two are one statement of one fact.
      count: !invisibleReason && watcherCount > 0 ? watcherCount : undefined,
      onPress: () => { tap(); setPrefsPopupOpen(true) },
    },
    {
      key: 'settings',
      // "More", not "Settings" (user directive 2026-07-30): what it opens is the
      // wallet first and then the account, support and the site — a drawer of
      // everything else, not a preferences screen. The glyph follows the label
      // to the thing at the head of that list, the CREDITS mark.
      label: t('home.dock.more'),
      icon: <CreditIcon color={INK} size={ICON.xxl} />,
      // The wallet is the head of what this opens and the glyph already says so;
      // the number says how much is in it — always shown, exactly as the credits
      // row shows it, zero included.
      count: starsBalance,
      // And the deposit beside it, at the glyph's other top corner, as a "+N"
      // (user directive 2026-08-01). It is the same wallet: a credit that has
      // left the balance but not the user, so the balance alone reads as less
      // money than he has — most sharply at the one moment it matters, a user
      // whose only credit is riding an invitation he is waiting on. No deposit,
      // nothing painted; a "+0" is not a fact.
      held: heldCredits > 0 ? heldCredits : undefined,
      onPress: () => { tap(); setAppSettingsPopupOpen(true) },
    },
  ], [openProfileSheet, routeToCommunities, pendingCount, profileBuilt, circlesSeen, router, watcherCount, invisibleReason, starsBalance, heldCredits])



  // Android hardware back. Priority, top of the stack downward:
  //   1. the topmost stacked overlay (profile sheet → Circles → chat) pops
  //   2. the derived invite overlay: pending declines (through its confirm),
  //      dead is swallowed so back can't leave a card the server still owns
  //   3. nothing left → false, i.e. leave the app
  // A step used to stand between 1 and 2 — the card in front of the user took
  // back UP to its own message when that message had been scrolled off the top
  // of the profile. There is no message up there any more (2026-08-01): what it
  // said is a line in the card's strip, which never leaves the screen, so there
  // is nothing for back to return to and back is simply back.
  // Assigned during render (below) because step 2 needs values declared after
  // this effect; the effect itself must stay mounted once.
  const inviteBackRef = useRef<(() => boolean) | null>(null)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const stack = overlaysRef.current
      if (stack.length > 0) {
        const top = stack[stack.length - 1]
        // The hub pops its own internal view first; only when it's back at the
        // hub (ref returns false) do we close the whole sheet.
        if (top === 'communities' && communitiesBackRef.current()) { /* handled internally */ }
        else closeTopOverlay()
        return true
      }
      return inviteBackRef.current?.() ?? false
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watching cards carry a server-stamped page1.expires_at (1h from the draw).
  // The client honours it LOCALLY: a lapsed watching card is treated as no card
  // (null state + null match below), so it never renders — even on the first
  // paint after returning from background, with no dependency on the hourly
  // cron teardown or a fetch. Only 'watching' has this clock; 'waiting' keeps
  // its own invite countdown. A watching row with no expires_at (old server
  // rows, pre-stamp) yields null here and never lapses until it is re-drawn.
  const rawState = profile?.state ?? null
  const watchingExpiresAt = rawState === 'watching' ? (profile?.relations?.page1?.expires_at ?? null) : null
  const watchingLapsed = useLapsed(watchingExpiresAt)
  const state = watchingLapsed ? null : rawState
  const page2Raw = profile?.relations?.page2
  const page2InviteObj: Page2Invite | null = page2Raw && !Array.isArray(page2Raw) ? page2Raw as Page2Invite : null
  // AN INVITATION'S OWN CLOCK IS WHAT ENDS IT, ON THE CLIENT TOO — the same
  // rule the watching card above is torn down by, and for the same reason:
  // nothing that has reached 00:00 on screen may still be carrying a live
  // button. The lapse does ask the server to settle (handleInviteLapsed →
  // /app/focus → app_expire_self), but the client cannot LEARN the answer from
  // that call: a plain `invoke` response has its relations stripped
  // (userStore.applyServerUser), because page2 is only ever written by the
  // OTHER user's RPCs and is therefore Realtime-owned. So the settled card
  // arrives over the socket alone — and when that event is late, dropped, or
  // the socket is asleep, the invitation sat at 00:00 with "Open chat" still
  // live and pressing it answered `"no_incoming"` (reported 2026-07-30 on one
  // emulator while the other, whose event did land, had flipped).
  const page2ServerPending = page2InviteObj?.state === 'pending' ? page2InviteObj : null
  const page2InviteLapsed = useLapsed(page2ServerPending?.expires_at)
  const page2PendingInvite = page2InviteLapsed ? null : page2ServerPending
  // Nothing is invented here: an invitation that runs out of time dies exactly
  // one way, so the card drawn from the local clock is the card the server is
  // writing at that same moment (_expire_invite_pair → page2 locked/'expire' →
  // the store's `missed` synthesis). The Realtime event, whenever it lands,
  // replaces this with an identical one — and the dead card it draws is what
  // takes the clock off the chip and puts the X there (page2Ended below).
  const page2LapsedInvite = useMemo(
    () => (page2ServerPending && page2InviteLapsed
      ? { ...page2ServerPending, state: 'missed' as const, message: 'expire' }
      : null),
    [page2ServerPending, page2InviteLapsed],
  )
  const page2DeadInvite = (page2InviteObj?.state === 'missed' || page2InviteObj?.state === 'fail')
    ? page2InviteObj
    : page2LapsedInvite
  const rawPage1State = profile?.relations?.page1?.state
  const page1Profile = (profile?.relations?.page1 as { profile?: { user_id?: string } } | undefined)?.profile
  // Broadcast ("show me to people" / app_add) was RETIRED from the client on
  // 2026-07-19 with the single-screen redesign: the user no longer sees who is
  // watching them, so paying a heart to be added to strangers' lists had no
  // surface left to pay off on. The server RPCs (app_add / app_cancel_add) and
  // relations.last_add_at still exist and are untouched — nothing calls them.
  const isMale = profile?.is_male ?? null

  // One-shot flag for the incoming-invite card's discovery animation. The
  // companion `page2Alerting` pulse is gone with the tab it blinked: the
  // invitation now announces itself by raising its own overlay.
  const [page2Discovery, setPage2Discovery] = useState(false)
  const [chatUnreadAlerting, setChatUnreadAlerting] = useState(false)
  const prevChatUnreadRef = useRef(0)
  const page2InviteUserId = page2PendingInvite?.user_id ?? null
  const prevPage2InviteUserIdRef = useRef<string | null | undefined>(undefined)


  // Desc block animation: 1 = normal, 0 = zoomed-in + faded (during server request).
  // Animates to 0 on button press; animates back to 1 after server responds.

  // ── Notification permission flow ────────────────────────────────────────
  // Default to 'undetermined' so the in-app prompt is visible from first
  // paint — never gate on a `null` "still-checking" state, since any failure
  // of the native query (Expo Go limits, dev-client linking issue, hot
  // reload glitch) used to leave the state stuck at null and the popup
  // would never appear. The async getter resolves to the real status and
  // overwrites this default within a render or two.
  const [notifPerm, setNotifPerm] = useState<NotifPermission>('undetermined')
  const notifCheckedRef = useRef(false)

  useEffect(() => {
    if (notifCheckedRef.current) return
    notifCheckedRef.current = true
    getNotifPermission().then(setNotifPerm)
  }, [])

  // When notif permission is granted, eagerly fetch the push token so it's
  // ready for the app/start call once location is also granted.
  const pushTokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (notifPerm !== 'granted') return
    ensurePushToken()
      .then(token => { pushTokenRef.current = token })
      .catch(() => {})
  }, [notifPerm])

  // ── Permission request handler ──────────────────────────────────────────
  // Same 'undetermined' default as notifPerm — see the comment above.
  const [locPerm, setLocPerm] = useState<LocPermission>('undetermined')
  const [permBusy, setPermBusy] = useState(false)
  // When the user picks a manual address in settings, data.location_custom
  // flips true on the server. While true: skip the GPS permission overlay,
  // skip the initial GPS fetch on /app/start, and stop the periodic
  // /app/location pushes. The popup in settings owns every location write
  // for these users (and may still flip back to device mode at any time).
  const customLoc = profile?.location_custom === true

  const handlePermissionRequest = async () => {
    if (permBusy) return
    setPermBusy(true)
    try {
      if (notifPerm !== 'granted') {
        const result = await requestNotifPermission()
        setPermBusy(false)
        if (result === 'granted') {
          // Fetch locPerm before setting notifPerm so both land in the same
          // React render batch — avoids a window where notifPerm='granted' and
          // locPerm=null simultaneously, which would make isPermMode=false and
          // hide the location permission card before it ever appears.
          const lp = await getLocPermission()
          setNotifPerm(result)
          setLocPerm(lp)
        } else {
          setNotifPerm(result)
          if (result === 'denied') openNotifSettings()
        }
        return
      }
      const result = await requestLocPermission()
      setLocPerm(result)
      if (result === 'denied') openLocPermSettings()
      if (result === 'services-off') {
        try {
          await enableLocationServices()
          const updated = await requestLocPermission()
          setLocPerm(updated)
        } catch {
          openLocationSettings()
        }
      }
    } finally {
      setPermBusy(false)
    }
  }

  // While the user hasn't granted permission, the notification card overlay
  // takes over the home pane content.
  const showNotifOverlay = notifPerm !== 'granted'

  useEffect(() => {
    if (notifPerm !== 'granted') return
    if (customLoc) return
    getLocPermission().then(setLocPerm)
  }, [notifPerm, customLoc])

  // No location permission (and not a custom-location user, whose `location`
  // is a deliberate manual point) → null the server location so the user
  // truly leaves everyone's candidate pool (others() excludes null-location).
  // Debounced to the lost→regained transition so it fires once, not per tick.
  const locNulledRef = useRef(false)
  useEffect(() => {
    if (customLoc) { locNulledRef.current = false; return }
    if (locPerm && locPerm !== 'granted') {
      if (!locNulledRef.current) {
        locNulledRef.current = true
        invoke('app/location', { location: null }).catch(() => {})
      }
    } else if (locPerm === 'granted') {
      locNulledRef.current = false
    }
  }, [locPerm, customLoc])

  // ── Startup completion ────────────────────────────────────────────────
  // Both permissions granted → send app/start + try to get location.
  const lastFocusRef = useRef(0)
  const startupSentRef = useRef(false)
  // Last notification-permission value we've reported to the server. Lets the
  // change-debounced reporter (reportNotifPerm) keep the foreground poll
  // network-free in steady state.
  const lastReportedPermRef = useRef<NotifPermission | null>(null)
  const [locFailed, setLocFailed] = useState(false)
  const [locBusy, setLocBusy] = useState(false)
  const [locFetching, setLocFetching] = useState(false)
  // True from the moment we kick off app/start until its HTTP response
  // resolves. Combined with locFetching, this gates the "Start now" button
  // so the user can't fire a manual app/find while the startup auto-find
  // is still running server-side or the locating animation is on screen.
  const [startupInflight, setStartupInflight] = useState(false)
  // Same idea for app/focus (sent on background→active transitions). The
  // server may auto-find while we wait for the response, so we want the
  // searching UI on the empty pane while it's in flight.
  const [focusInflight, setFocusInflight] = useState(false)
  // Flips true once app/start has completed (success or failure). Until then
  // we're still in the boot sequence (waiting for permissions to resolve, GPS
  // fix, or the server response), so the "ready to find" headline + Start
  // button must stay hidden / disabled.
  const [startupCompleted, setStartupCompleted] = useState(false)
  // Bumped when auth recovers after a request was skipped for want of a token
  // (see onAuthRecovered below). A dep of the startup effect, so the boot volley
  // runs again from the top.
  const [authRecovery, setAuthRecovery] = useState(0)
  const locFetchStartRef = useRef(0)
  const LOC_FETCH_MIN_MS = 1500
  const startLocFetch = () => { locFetchStartRef.current = Date.now(); setLocFetching(true) }
  const stopLocFetch = () => {
    const elapsed = Date.now() - locFetchStartRef.current
    const delay = Math.max(0, LOC_FETCH_MIN_MS - elapsed)
    if (delay === 0) { setLocFetching(false); return }
    setTimeout(() => setLocFetching(false), delay)
  }
  useEffect(() => {
    if (notifPerm !== 'granted') return
    // Custom-location users bypass GPS permission entirely — their location
    // was already written from the settings popup. Device-mode users still
    // need locPerm=granted before app/start runs (so the GPS fetch below has
    // a chance to succeed).
    if (!customLoc && locPerm !== 'granted') return
    if (startupSentRef.current) return
    startupSentRef.current = true
    ;(async () => {
      // Get location + push token in parallel, then send app/start. Skip
      // the GPS fetch entirely in custom-location mode; the server already
      // has the manual lat/lng on file from the picker.
      if (!customLoc) startLocFetch()
      const [location, token] = await Promise.all([
        customLoc
          ? Promise.resolve(null as { lat: number; lng: number } | null)
          : getLocation().finally(stopLocFetch),
        pushTokenRef.current
          ? Promise.resolve(pushTokenRef.current)
          : ensurePushToken().catch(() => null),
      ])
      // Only include push_token if it changed from what the server has.
      const pushChanged = token && token !== profile?.data?.push_token?.token
      markStartupComplete()
      setStartupInflight(true)
      // /app/start carries notif_perm itself, so seed the reporter's ref to
      // avoid a redundant /app/notif right after boot.
      lastReportedPermRef.current = notifPerm
      invoke('app/start', {
        ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
        ...(pushChanged ? { push_token: { type: 'expo', token } } : {}),
        // Notification-presence signal: a user who can't be notified is gated
        // unavailable server-side (the app requires presence). startup only
        // runs when granted, but report it explicitly anyway so the server
        // records reachability and clears any stale dead-token mark.
        notif_perm: notifPerm,
        os: Platform.OS,
        lang,
      })
        .catch(() => {})
        .finally(() => {
          setStartupInflight(false)
          setStartupCompleted(true)
        })
      // Referral attribution, once per install. Silent and fire-and-forget:
      // the invitee never learns this ran, and the inviter's credit lands via
      // Realtime + push. Deliberately AFTER app/start so it can never delay
      // the first paint, and self-healing if it runs late (app_referral_attach
      // settles a completed profile on the spot).
      claimInstallReferral()
      if (!location && !customLoc) setLocFailed(true)
    })()
  }, [notifPerm, locPerm, customLoc, authRecovery])

  // A launch whose session could not be refreshed in time sends nothing (api.ts
  // fails those calls quietly rather than signing the user out, which is what
  // used to happen), and the volley above is fired ONCE per mount — so without
  // this the server would never learn the user is here: no availability, no
  // auto-find, no presence. When auth comes back, replay it from the top. The
  // sequence is safe to run twice: `app/start` is a full state statement rather
  // than an increment, and claimInstallReferral is guarded per install and
  // idempotent server-side.
  useEffect(() => onAuthRecovered(() => {
    startupSentRef.current = false
    lastFocusRef.current = 0
    setAuthRecovery(n => n + 1)
  }), [])

  const handleLocRetry = async () => {
    if (locBusy) return
    setLocBusy(true)
    startLocFetch()
    try {
      const location = await getLocation()
      if (location) {
        setLocFailed(false)
        invoke('app/location', { location: { latitude: location.lat, longitude: location.lng } }).catch(() => {})
      }
    } finally {
      setLocBusy(false)
      stopLocFetch()
    }
  }

  const showLocOverlay = locPerm !== 'granted' && !customLoc

  // ── Internet reachability ─────────────────────────────────────────────
  // Tracks device-level connectivity so we can surface a "no internet"
  // popup styled like the location/notification permission ones. The
  // initial value is null until we get the first reading; only once it
  // resolves to false do we show the overlay (avoids a startup flash).
  const [netReachable, setNetReachable] = useState<boolean | null>(null)
  const [netBusy, setNetBusy] = useState(false)
  // OR-of-trues: treat as reachable when EITHER signal is positively true.
  // `isInternetReachable` is a slower OS-level reachability check that can
  // stick at `false` for a while after connectivity returns (or fail to flip
  // back on certain devices/networks), so a strict priority chain
  // (`isInternetReachable ?? isConnected`) left the overlay stuck on long
  // after wifi/data was back. Only when both report explicit `false`, or
  // `isConnected` is explicit false alone, do we treat as offline. An
  // unknown signal (null) is never treated as offline, so we don't flash
  // the overlay before the first real reading.
  const computeReachable = (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => {
    if (s.isInternetReachable === true || s.isConnected === true) return true
    if (s.isConnected === false) return false
    return true
  }
  useEffect(() => {
    let mounted = true
    Network.getNetworkStateAsync()
      .then(s => { if (mounted) setNetReachable(computeReachable(s)) })
      .catch(() => { if (mounted) setNetReachable(true) })
    const sub = Network.addNetworkStateListener(s => {
      setNetReachable(computeReachable(s))
    })
    return () => { mounted = false; sub.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const handleNetRetry = async () => {
    if (netBusy) return
    setNetBusy(true)
    try {
      const s = await Network.getNetworkStateAsync()
      setNetReachable(computeReachable(s))
    } catch {
    } finally {
      setNetBusy(false)
    }
  }
  const showNoInternetOverlay = netReachable === false
  // Poll while offline. The OS listener can miss the false→true transition
  // (sticky `isInternetReachable`, lost subscription, certain captive-portal
  // unwinds), which left the overlay frozen after connectivity returned.
  // A 3s poll while the overlay is up is cheap (a single async call) and
  // self-cancels the moment the overlay dismisses.
  useEffect(() => {
    if (!showNoInternetOverlay) return
    const id = setInterval(() => {
      Network.getNetworkStateAsync()
        .then(s => setNetReachable(computeReachable(s)))
        .catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNoInternetOverlay])

  // A blocking center-notice will be shown (missing notif/location/internet
  // permission, or the server availability gate). This is exactly when
  // centerNotice (computed below) is non-null: geoGated || isPermMode, with
  // isPermMode's isNetMode guards subsumed into showNoInternetOverlay here.
  // Per spec: when such a notice applies AND page1 is NOT waiting-for-invite
  // and NOT chat, the profile/card is removed and the notice takes the
  // center. waiting/chat are preserved (the user has a live interaction).
  const blockingNotice = geoGated
    || showNotifOverlay
    || (state !== 'chat' && (showLocOverlay || locFailed || showNoInternetOverlay))
  const noticeOverridesCard = blockingNotice && state !== 'waiting' && state !== 'chat'

  // Unified card mode — derived synchronously. The home pane is laid out
  // with both the empty/no-match content and the match-card content always
  // mounted; visibility is driven by `paneOpacity` below, so transient state
  // transitions can't unmount the match card. When a blocking notice
  // overrides the card we report `null` (the existing "empty pane" path):
  // showHiddenPlaceholder flips true → the empty pane (with the notice)
  // becomes interactive and PullPane goes non-interactive, no bespoke hack.
  const displayedCardMode = noticeOverridesCard ? null : state

  // Report OS notification permission to the server the instant it changes,
  // via the lean /app/notif endpoint (persists relations.push + recomputes
  // availability only — no auto-find / snapshot work). Change-debounced
  // against lastReportedPermRef so the foreground poll and the app-active
  // handler are network-free whenever nothing actually changed. This is what
  // keeps the server's notification-presence gate as close to realtime as a
  // mobile OS allows (no OS event exists for permission changes).
  const reportNotifPerm = useCallback((perm: NotifPermission) => {
    if (perm === lastReportedPermRef.current) return
    lastReportedPermRef.current = perm
    invoke('app/notif', { notif_perm: perm }).catch(() => {})
  }, [])

  // ── Re-check permissions when app returns to foreground ────────────────
  // Covers the user changing app permissions in device settings, etc.
  // Fires on every background→active transition.
  useEffect(() => {
    dismissAllNotifications()
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return
      dismissAllNotifications()
      const np = await getNotifPermission()
      setNotifPerm(np)
      // Returning from OS Settings is THE moment permission changes — report
      // it immediately, un-throttled (the /app/focus below is throttled 30s).
      reportNotifPerm(np)
      // Re-check location using the fresh notif result, not a stale closure value.
      // Skip when the user opted into custom-location mode — we don't read GPS
      // perm in that flow.
      const customNow = useUserStore.getState().profile?.location_custom === true
      if (np === 'granted' && !customNow) getLocPermission().then(setLocPerm)
      // Send app/focus with last known location (only after initial startup completed, max once per 30s).
      // Custom-location users don't attach a location — the server already has
      // their manual lat/lng on file.
      if (startupSentRef.current && Date.now() - lastFocusRef.current > 30_000) {
        lastFocusRef.current = Date.now()
        const location = customNow ? null : await getLastKnownLocation()
        setFocusInflight(true)
        // Report the freshly-read OS notification permission. This is the
        // signal that catches "granted at startup, revoked later in OS
        // settings": the server marks relations.push.perm and gates the user
        // unavailable until they re-enable (the app requires presence).
        invoke('app/focus', {
          ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
          notif_perm: np,
        })
          .catch(() => {})
          .finally(() => setFocusInflight(false))
      }
    })
    return () => sub.remove()
  }, [])

  // ── Poll location services while notif phase is done ──────────────────
  // Toggling GPS from the Android quick-settings panel doesn't put the app
  // into background, so AppState 'active' never fires. Poll every 2s so
  // the overlay appears/disappears without requiring the user to leave the app.
  // hasServicesEnabledAsync is a fast local call — negligible battery cost.
  // Skipped while in custom-location mode: GPS perm is irrelevant there and
  // the overlay is suppressed anyway, so the poll is pure waste.
  useEffect(() => {
    if (notifPerm !== 'granted' || customLoc) return
    // PERF: this fires every 2s for the entire session in the common case
    // (device-location mode, permission granted). `Home` is a very large
    // component, so an unconditional setLocPerm here re-ran its whole render
    // every 2s forever — background work that visibly contended with the
    // pager / TabStrip / card animations. The permission almost never
    // changes between ticks, so feed the value through a functional updater
    // that returns the SAME reference when unchanged: React then skips the
    // re-render entirely (state-bail-out). A real change still renders once
    // and the services overlay updates exactly as before.
    const id = setInterval(() => {
      getLocPermission().then(p => setLocPerm(prev => (prev === p ? prev : p)))
    }, 2000)
    return () => clearInterval(id)
  }, [notifPerm, customLoc])

  // ── Poll notification permission while foreground ─────────────────────
  // The OS emits no "permission changed" event. AppState 'active' covers the
  // return-from-Settings case, but not an in-app revoke (Android shade
  // long-press toggles notifications without backgrounding the app) or any
  // gap left by the 30s /app/focus throttle. Poll every 3s (a cheap local
  // getPermissionsAsync, same cost class as the 2s location-services poll
  // above) and report the instant it changes, so the server's presence gate
  // is updated within ~3s of any change. reportNotifPerm is change-debounced
  // ⇒ steady state is zero network and zero re-render (state bail-out).
  useEffect(() => {
    if (!startupCompleted) return
    const id = setInterval(() => {
      getNotifPermission().then(p => {
        setNotifPerm(prev => (prev === p ? prev : p))
        reportNotifPerm(p)
      })
    }, 3000)
    return () => clearInterval(id)
  }, [startupCompleted, reportNotifPerm])

  // ── Continuous location tracking ──────────────────────────────────────
  // After startup completes, watch for significant movement and push
  // updates to the server so distance calculations stay fresh.
  // A 60s interval guarantees at least one update per minute even when
  // the user is standing still (watchLocation only fires on movement).
  // Custom-location users opt out entirely: their location is whatever
  // they picked manually, GPS movement should not overwrite it.
  useEffect(() => {
    if (!startupSentRef.current || locPerm !== 'granted' || customLoc) return
    let cancelled = false
    // Immediately acquire + broadcast a fresh fix whenever tracking
    // (re)starts, most importantly right after the user switches from a
    // custom address back to device mode. Without this the server keeps the
    // stale custom location until the 60s interval ticks or the user
    // physically moves 100m, so a re-scan in between still surfaces results
    // from the old (custom) location.
    getLocation().then(coords => {
      if (!cancelled && coords) {
        invoke('app/location', { location: { latitude: coords.lat, longitude: coords.lng } }).catch(() => {})
      }
    })
    let sub: { remove(): void } | null = null
    watchLocation((coords) => {
      invoke('app/location', { location: { latitude: coords.lat, longitude: coords.lng } }).catch(() => {})
    }).then(s => { sub = s }).catch(() => {})
    const id = setInterval(() => {
      getLastKnownLocation().then(coords => {
        if (coords) invoke('app/location', { location: { latitude: coords.lat, longitude: coords.lng } }).catch(() => {})
      })
    }, 60_000)
    return () => { cancelled = true; sub?.remove(); clearInterval(id) }
  }, [locPerm, locFailed, customLoc])

  // A fresh match raises the chat overlay; the chat ending drops it. Nothing
  // else needs anchoring any more: a resolved invite closes its own overlay
  // by derivation, and the menu is never yanked out from under the user (they
  // are intentionally in there, and settings actions can change state).
  //
  // "Fresh" means the transition happened while home was WATCHING a settled
  // state, not while the boot answer was still landing. Boot routing runs off
  // the disk snapshot (hydrate sets `fetched`, index.tsx navigates on it), so
  // home routinely mounts on a stale `state` and the first fetch reconciles it
  // a beat later — with `prev !== 'chat'` alone, an ordinary relaunch into an
  // existing chat read as a brand-new match and raised the sheet on launch,
  // which is exactly what the user directive of 2026-07-28 banned (see the
  // launch-notification effect above). `serverSynced` flips false→true in the
  // same render as that reconciliation, so it is the one signal that tells the
  // two apart. Only the OPEN is suppressed: a cached 'chat' the server says is
  // over must still close the sheet and drop the transcript.
  const serverSynced = useUserStore(s => s.serverSynced)
  const prevStateRef = useRef(state)
  const prevServerSyncedRef = useRef(serverSynced)
  useEffect(() => {
    const justSynced = !prevServerSyncedRef.current && serverSynced
    prevServerSyncedRef.current = serverSynced
    if (prevStateRef.current !== state) {
      const prev = prevStateRef.current
      prevStateRef.current = state
      const enteringChat = state === 'chat' && prev !== 'chat' && !justSynced
      const leavingChat = state !== 'chat' && prev === 'chat'

      if (enteringChat) {
        setChatJustStarted(true)
        openOverlay('chat')
      } else if (leavingChat) {
        Keyboard.dismiss()
        setChatUnread(0)
        setOverlays(prev2 => prev2.filter(o => o !== 'chat'))
        // The conversation is over: its local transcript can never be shown
        // again, so drop it instead of leaving one dead cache per past partner
        // on the device. The server keeps the rows — a pair that matches again
        // just re-fetches.
        clearChatCache(chatPartnerRef.current)
      }
    }
    // `serverSynced` is a dep in its own right: when the boot answer changes
    // nothing, the flip must still be consumed here, or the NEXT (genuine)
    // transition would read as the reconciliation and be swallowed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, serverSynced])

  useEffect(() => {
    const prev = prevPage2InviteUserIdRef.current
    prevPage2InviteUserIdRef.current = page2InviteUserId
    // Initial mount with an already-live invite (app re-open / hot reload):
    // no discovery animation, the card was already present on the last run.
    if (prev === undefined) return
    // Clear discovery flag if invite went away (cancelled / approved / etc).
    if (prev !== null && page2InviteUserId === null) {
      setPage2Discovery(false)
    }
    // Fresh incoming invite — fire discovery animation when the card mounts.
    if (prev === null && page2InviteUserId !== null) {
      setPage2Discovery(true)
    }
  }, [page2InviteUserId])

  // Opening the chat clears its unread pulse.
  useEffect(() => {
    if (chatOpen && chatUnreadAlerting) setChatUnreadAlerting(false)
  }, [chatOpen, chatUnreadAlerting])

  useEffect(() => {
    const prev = prevChatUnreadRef.current
    prevChatUnreadRef.current = chatUnread
    if (prev === 0 && chatUnread > 0 && !overlaysRef.current.includes('chat')) {
      setChatUnreadAlerting(true)
      const timer = setTimeout(() => setChatUnreadAlerting(false), PULSE.timeoutMs)
      return () => { clearTimeout(timer); setChatUnreadAlerting(false) }
    }
  }, [chatUnread])

  // Button stays disabled from click until the server round-trip resolves.
  // `pendingKey` identifies which button initiated the in-flight action so
  // only that one shows the disabled visual — all other buttons stay
  // visually normal but non-interactive via `silentDisabled`.
  const [busy, setBusy] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  // ignoreLoading + busy stay true on the skip button from tap until the
  // realtime update settles displayedMatch (either to a new match or null,
  // both cleared in the sync effect). The .catch path is the only synchronous
  // escape (errors mean no realtime update will arrive to clear the state).
  const [ignoreLoading, setIgnoreLoadingState] = useState(false)
  const ignoreLoadingRef = useRef(false)
  const setIgnoreLoading = (v: boolean) => { ignoreLoadingRef.current = v; setIgnoreLoadingState(v) }

  // Single-card model: the match card lives as one Animated.View keyed by
  // match.user_id. When the source match changes, React unmounts the old key
  // and mounts the new one — Reanimated's SlideOutDown / SlideInDown layout
  // animations drive the slide-down/slide-up transitions natively.
  // Photo card + buttons are siblings inside the same Animated.View, so they
  // translate together (both for the layout animation and for the pull
  // gesture below). No transA/transB / slot bookkeeping required.
  // Gated by watchingLapsed for the same reason as `state` above: a lapsed
  // watching card must drop its match so the promote effect clears
  // displayedMatch and the card slides out to the play button.
  const remoteMatch = (watchingLapsed ? null : profile?.relations?.match) ?? null
  const [displayedMatch, setDisplayedMatch] = useState<Profile | null>(remoteMatch)

  // Match currently being preloaded into a hidden MatchCard. Once that
  // hidden card reports onReady (all photos painted), it gets promoted to
  // displayedMatch and the visible Animated.View slides in.
  const [preloadingMatch, setPreloadingMatch] = useState<Profile | null>(null)
  // Mirror of preloadingMatch for use in stable callbacks (onPreloadReady) that
  // can't depend on the state directly — reading the ref keeps the callback
  // identity stable AND avoids passing an updater into setState. Updater
  // callbacks run during React's render phase, and writing to a Reanimated
  // shared value from there trips strict mode ("Writing to `value` during
  // component render"). Reading the ref + calling setState with a plain value
  // keeps the shared-value writes outside render.
  const preloadingMatchRef = useRef<Profile | null>(null)
  useEffect(() => { preloadingMatchRef.current = preloadingMatch }, [preloadingMatch])
  // skipAbortedRef: set true the instant the center pause button is tapped
  // mid-skip — it makes every skip-promote path (the remote→displayed sync
  // effect, startPreload, onPreloadReady) a no-op so a candidate the server
  // already found never surfaces once the user chose to pause. Reset at the
  // start of the next find/ignore. inflightSkipRef holds the in-flight
  // app/find|app/ignore request so the pause can be chained AFTER it (server
  // then commits app_pause last and page1 ends `locked`, not watching).
  const skipAbortedRef = useRef(false)
  const inflightSkipRef = useRef<Promise<unknown> | null>(null)
  // True only while app/pause (from the skip pause button) is in flight —
  // drives that button's spinner. Separate from `busy` (already true for the
  // whole skip, so it can't gate the pause button's own spinner).
  const [pausing, setPausing] = useState(false)
  // True from the moment runFind/runIgnore is initiated until the new card
  // (if any) has finished its slide-in animation, OR until the empty pane
  // settles after the slide-out (when no new card arrives). Drives the
  // scanning UI (radar + locating text) so the user sees a coherent
  // "Scanning..." state through the entire transition. The pull gesture
  // itself does NOT set this — only the post-release server call does, so
  // mid-pull there's no scanning UI flicker.
  const [searching, setSearching] = useState(false)
  // Sub-phase of `searching`: true once the server has answered with a
  // candidate and we're now disk-prefetching + painting all of that
  // profile's photos into the hidden preloader, false during the initial
  // "no candidate yet" scan. Splits the single scanning headline into two
  // copies — "Scanning..." while the round-trip is in flight, "Loading
  // profile data" while the (already-resolved) candidate's images load —
  // so the wait between server-answer and slide-up reads as progress, not a
  // stalled scan. Always a strict subset of `searching`; the headline gates
  // on `searching && loadingProfile`.
  const [loadingProfile, setLoadingProfile] = useState(false)
  // Tracks the slide-out window: true from setDisplayedMatch(null) for ~400ms
  // (slightly more than SlideOutDown's 380ms duration). Used to keep the
  // empty-pane text hidden while the old card is still visually exiting,
  // even after `state` has already flipped to null/free.
  const [cardExiting, setCardExiting] = useState(false)
  const prevDisplayedIdRef = useRef<string | null>(displayedMatch?.user_id ?? null)
  useEffect(() => {
    const prev = prevDisplayedIdRef.current
    const curr = displayedMatch?.user_id ?? null
    prevDisplayedIdRef.current = curr
    if (prev && !curr) {
      setCardExiting(true)
      const timer = setTimeout(() => setCardExiting(false), 400)
      return () => clearTimeout(timer)
    }
  }, [displayedMatch?.user_id])

  // Search watchdog. `searching` is normally cleared by the remote→displayed
  // sync effect (or onPreloadReady) once Realtime confirms the find result.
  // If that confirmation never arrives — a dropped Realtime relations event,
  // or a server path that returns without changing state — the radar/locating
  // UI would spin forever (the exact symptom of the page2-pending find bug).
  // This is the safety net: a find can't legitimately take longer than the
  // request ceiling plus Realtime/slide-in slack, so if `searching` is still
  // true past that bound, force it off so the pane re-resolves to ready /
  // no-one-nearby instead of hanging. Re-armed each time `searching` flips on.
  //
  // Recovery, beyond clearing `searching`: if the request actually landed
  // server-side (page1 already changed) but the response/Realtime never
  // propagated, the local store stays stale and the home pane sticks on
  // PAUSE + "Not now" tab + skip headline forever (page1Profile truthy,
  // displayedMatch null, skipPhase 'hold'). Force a fresh fetch (bypasses
  // the last_seen ordering guard), ease the skip animation back to idle
  // if it stayed in 'hold', and clear the optimistic skip flags so the
  // user can press play again instead of being stranded.
  useEffect(() => {
    if (!searching) return
    const timer = setTimeout(
      () => {
        setSearching(false)
        setLoadingProfile(false)
        const uid = useUserStore.getState().profile?.user_id
        if (uid) void useUserStore.getState().fetch(uid)
        if (skipPhaseRef.current === 'hold') {
          setSkipPhase('anim')
          skipSlide.value = withTiming(0, undefined, (fin) => {
            'worklet'
            if (fin) runOnJS(setSkipPhase)('idle')
          })
        }
        if (ignoreLoadingRef.current) {
          setIgnoreLoading(false)
          setBusy(false)
          setPendingKey(null)
        }
      },
      API_TIMEOUT_MS + SEARCH_WATCHDOG_SLACK_MS,
    )
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching])

  // Skip the entering animation only when the session started with a card
  // already in page1 (app-load instant appearance). If the session started
  // empty, the first card to arrive (and every subsequent one) animates with
  // SlideInDown.
  const matchHasMountedRef = useRef(!remoteMatch)
  // Whether the page1 watch card has risen at least once since the user last
  // pressed play. The center circle presents as a PAUSE button only after a
  // card has been revealed: a play press keeps the PLAY icon through the
  // find/loading window (no card on screen yet) and flips to pause only as
  // the card starts rising. A skip leaves it true (a card was already shown);
  // runFind resets it on a fresh play press (user request 2026-05-22).
  const [watchCardShown, setWatchCardShown] = useState(!!remoteMatch)
  useEffect(() => {
    if (displayedMatch) {
      matchHasMountedRef.current = true
      setWatchCardShown(true)
    }
  }, [displayedMatch?.user_id])

  // ── Home-tab name-slide (skip choreography) ──────────────────────────────
  // During a skip the Home tab's word slides in three beats, driven by ONE
  // shared value `skipSlide` ∈ [0,2] fed to the tab as `nameSlide`:
  //   0 → 1  the candidate's name slides DOWN out while "לא עכשיו" enters
  //          from the TOP — tracked 1:1 with the pull, complete at the commit
  //          point (clamp(pullY / commitDistance, 0, 1)).
  //   1      held at "לא עכשיו" while the card rides off-screen.
  //   1 → 2  the next name rises from BELOW and pushes "לא עכשיו" up and out,
  //          started in step with the new card's RisingCard slide-up.
  // `skipPhase` gates which beat owns the value: 'pull' lets the reaction
  // below mirror the drag; 'hold'/'anim' run their own withTiming and the
  // reaction stands off (so the post-commit pullY ride-off + reset never move
  // the word). The reaction mirrors the drag in 'idle' too, purely so the
  // very first frame of a pull is already tracked (no catch-up jump) — in
  // 'idle' the tab shows the same name at slide 0 and 2, so the value there
  // is visually moot.
  // NOTE: the word-filmstrip this drove (the Home tab's name sliding out to
  // "לא עכשיו" and back) went with the TabStrip on 2026-07-19, so nothing
  // renders `skipSlide` any more. It is kept because its withTiming completion
  // callbacks are what advance the phase machine below — it is now a clock for
  // the skip choreography rather than a visual. The React state that mirrored
  // the phase / outgoing name existed only for the tab and is gone; the ref +
  // shared value do all the work.
  const skipSlide = useSharedValue(0)
  const skipPhaseSV = useSharedValue(0) // 0 idle · 1 pull · 2 hold · 3 anim
  const skipPhaseRef = useRef<'idle' | 'pull' | 'hold' | 'anim'>('idle')
  // Index into SKIP_HEADLINES — re-rolled whenever a new card is shown (see
  // the effect by page1Pull), so each card carries its own random skip line
  // in the headline slot behind it, revealed when that card is pulled away.
  const [skipHeadlineIdx, setSkipHeadlineIdx] = useState(() => pickHeadline(-1, SKIP_HEADLINES.length))
  const setSkipPhase = useCallback((p: 'idle' | 'pull' | 'hold' | 'anim') => {
    skipPhaseRef.current = p
    skipPhaseSV.value = p === 'idle' ? 0 : p === 'pull' ? 1 : p === 'hold' ? 2 : 3
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The pull depth (in `pullY` units) that lands the descending card's top
  // edge on the pause-icon centre — consumed by the first-time skip tutorial.
  // Measured from the home pane's height (see the empty-pane onLayout).
  const tutorialPeekV = useSharedValue(0)

  // ── Pull-to-skip (page1) ─────────────────────────────────────────────
  // The whole pull behaviour — gesture, 1:1 resistance, half-screen commit,
  // the ride-off-screen animation, AND the first-time tutorial choreography
  // + once-ever trigger — lives in usePullBehavior. runIgnore is the commit
  // action (also fired by the skip-hint dialog) so it's declared here.
  const runIgnore = useCallback(() => {
    if (busy || ignoreLoading) return
    tap()
    // A SKIP WITH THE ALLOWANCE SPENT ASKS FOR NOTHING NEXT. app/ignore is
    // "restrict this person and find me another", and the other half of it is
    // what must not happen here: app_find would draw a stranger AND push them a
    // 'candidate' notification for a watch this client is about to release. So
    // the card is put away with app/pause instead — page1 goes `locked`, which
    // detaches me from that person's viewer list and is the one state the
    // server's auto-find leaves alone. No restriction is written either, which
    // is right: the app took the game away, the user did not reject anyone.
    const stopping = browseSpentRef.current
    // A gesture skip arrives here already in 'pull'; a button skip arrives in
    // 'idle', so restart the choreography clock from 0. Either way it settles
    // at 1 while the card rides off.
    if (skipPhaseRef.current === 'idle') {
      skipSlide.value = 0
    }
    setSkipPhase('hold')
    skipSlide.value = withTiming(1)
    setBusy(true)
    setPendingKey('watching-reject')
    setIgnoreLoading(true)
    // Nothing is being scanned for when nothing is being asked for, so the
    // radar stays down and the pane comes up on the gate instead.
    if (!stopping) setSearching(true)
    // Fresh scan starts in the "no candidate yet" phase, not the
    // image-loading one (matters if a previous skip's loadingProfile
    // hadn't cleared yet).
    setLoadingProfile(false)
    // A fresh skip clears any pause-abort latched by a previous one.
    skipAbortedRef.current = false
    // Optimistic exit: clearing displayedMatch unmounts the keyed
    // Animated.View, which plays SlideOutDown. The pull transform (pullY) is
    // preserved during the layout exit, so a release at any pulled position
    // continues smoothly off-screen. Realtime delivers the next match (or
    // null) and the sync effect clears the loading state.
    setDisplayedMatch(null)
    // Keep the request so a pause tapped mid-skip can be chained after it.
    const ignorePromise = invoke(stopping ? 'app/pause' : 'app/ignore', {})
    inflightSkipRef.current = ignorePromise
    ignorePromise.catch(err => {
      console.error(err)
      setBusy(false)
      setPendingKey(null)
      setIgnoreLoading(false)
      setSearching(false)
      setLoadingProfile(false)
      // Recovery: the request was lost or timed out; the optimistic
      // displayedMatch=null + skipPhase='hold' state leaves the home pane
      // stuck on PAUSE + "Not now" until something else moves it. Resync
      // the user from the server so the sync effect re-runs against fresh
      // page1, and ease the skip animation back to idle if it remained in
      // 'hold' (no candidate to rise into).
      const uid = useUserStore.getState().profile?.user_id
      if (uid) void useUserStore.getState().fetch(uid)
      if (skipPhaseRef.current === 'hold') {
        setSkipPhase('anim')
        skipSlide.value = withTiming(0, undefined, (fin) => {
          'worklet'
          if (fin) runOnJS(setSkipPhase)('idle')
        })
      }
    })
  }, [busy, ignoreLoading])
  // ── WHAT A PULL DOES, PER STATE ────────────────────────────────────────────
  // (user directive 2026-08-01.) The card is draggable in EVERY state it is on
  // screen in, not only while watching — a surface the app puts in front of you
  // is put away the same way wherever it came from. What differs is what the
  // release does, and it splits in two:
  //
  //  · The states that ASK first — waiting on an invitation I sent, and a chat —
  //    raise their popup and the card springs home ('snapBack'). Both of those
  //    are decisions with a consequence for somebody else, and both already have
  //    a named dialog behind a chip in the strip; the drag is a second way to
  //    the same question, never a silent answer to it.
  //  · The states that simply END — watching (skip) and a card that is already
  //    over (continue) — ride off ('slideOff') and fire, with no popup at all:
  //    there is nothing to confirm about moving on.
  //
  // The handler is reached through a ref assigned during render, because half of
  // what it calls is declared further down this component; the ref keeps the
  // gesture's `onCommit` identity stable, so nothing rebuilds the pan per render.
  const endedForPull = state === 'missed' || state === 'fail'
  const pullAsks = state === 'waiting' || state === 'chat'
  const pullCommitRef = useRef<() => void>(() => {})
  const onPullCommit = useCallback(() => { pullCommitRef.current() }, [])
  const page1Pull = usePullBehavior({
    activation: 'scrollPan',
    enabled: state === 'watching' || pullAsks || endedForPull,
    onCommit: onPullCommit,
    commit: pullAsks ? 'snapBack' : 'slideOff',
    tutorial: {
      // Once-ever, and only on a settled watching card with no overlay
      // eating the surface the demo animates on.
      ready: state === 'watching' && !!displayedMatch
        && !showNotifOverlay && !showLocOverlay && !locFailed && !showNoInternetOverlay,
      seenFlag: SEEN_FLAGS.homeDemo,
      peek: tutorialPeekV,
    },
  })
  // MatchCard's PullScrollView is the same instance across profile changes;
  // the pull gesture samples scrollAtTop at gesture start. PullScrollView
  // only refreshes it from native onScroll, so without this reset it sticks
  // at `false` (previous card's scrolled-down position) and the first swipe
  // on the new card is routed to scroll-only until the user nudges it.
  useEffect(() => {
    if (displayedMatch) {
      page1Pull.setScrollAtTop(true)
      // Fresh random skip line for this card — it sits in the headline slot
      // behind the card and is revealed, already full, when the card is
      // pulled away to skip.
      setSkipHeadlineIdx(prev => pickHeadline(prev, SKIP_HEADLINES.length))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedMatch?.user_id])

  // Mirror the pull into the name-slide while the finger owns it (phase
  // 'pull'; also 'idle' so the very first frame of a pull is already tracked
  // — no catch-up jump). 'hold'/'anim' run their own withTiming, so the
  // reaction stands off then (the post-commit pullY ride-off + reset must not
  // move the word).
  const page1CommitDistance = page1Pull.commitDistance
  useAnimatedReaction(
    () => page1Pull.pullY.value,
    (py) => {
      'worklet'
      if (skipPhaseSV.value > 1) return
      skipSlide.value = Math.min(1, Math.max(0, py / page1CommitDistance))
    },
    [page1CommitDistance],
  )
  // Pull lifecycle for the name-slide. Engage 'pull' (freezing the outgoing
  // name) when a pull begins; on release WITHOUT a commit (runIgnore would
  // have advanced the phase to 'hold') ease the word back to the current name
  // in step with the card's snap-back, then return to idle.
  const page1Pulling = page1Pull.pulling
  useEffect(() => {
    if (page1Pulling) {
      if (skipPhaseRef.current === 'idle') {
        setSkipPhase('pull')
      }
    } else if (skipPhaseRef.current === 'pull') {
      setSkipPhase('anim')
      skipSlide.value = withTiming(0, undefined, (fin) => {
        'worklet'
        if (fin) runOnJS(setSkipPhase)('idle')
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page1Pulling])
  // Beat 3 of the name-slide: the next name rises from below and pushes
  // "לא עכשיו" up and out (skipSlide 1 → 2), started in step with the new
  // card's slide-up. No-op unless a skip is holding at "לא עכשיו"; called
  // from every skip-resolution path (new card, no-candidate, abort).
  const startNameRise = useCallback(() => {
    if (skipPhaseRef.current !== 'hold') return
    setSkipPhase('anim')
    skipSlide.value = withTiming(2, undefined, (fin) => {
      'worklet'
      if (fin) runOnJS(setSkipPhase)('idle')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync remote → displayed. The card only rises (mounts with SlideInDown)
  // after its photos have been prefetched, so the user never sees a placeholder
  // sweep up the screen. The "searching for people" text on the empty pane
  // stays up across the whole transition (old card sliding out + new card
  // sliding in), so it never momentarily flickers to "no one nearby" between
  // cards. Only after the slide-up settles (or after the slide-out completes
  // and the remote is genuinely null) does the empty-pane text swap.
  const initialSyncRef = useRef(true)
  useEffect(() => {
    if (initialSyncRef.current) {
      initialSyncRef.current = false
      return
    }
    // Paused mid-skip: ignore a candidate the server found after the abort.
    // The chained app/pause brings page1 to `locked` shortly; the !remoteMatch
    // branch below then resolves the UI to the paused state and clears the flag.
    if (skipAbortedRef.current && remoteMatch) return
    let cancelled = false
    let searchingTimer: ReturnType<typeof setTimeout> | null = null
    const clearLoading = () => {
      if (cancelled) return
      if (ignoreLoadingRef.current) {
        setIgnoreLoading(false)
        setBusy(false)
        setPendingKey(null)
      }
    }
    // THE THIRD FACE DOES NOT RISE. A candidate the browse allowance no longer
    // covers is never promoted — and it is RELEASED rather than merely hidden,
    // because a watch nobody is looking at is a lie on the other person's row
    // (they carry me in their viewer list for a card that is not on screen).
    // app/pause is the one release that leaves page1 `locked`, which is also
    // what stops the server's auto-find from seeding another on the next
    // start/focus: this path is the safety net for that auto-find, since the
    // skip below never asks for a next candidate once the allowance is spent.
    // Gated on `watching` — the allowance is about faces watched, and a chat or
    // an invitation is not something to take away (an unbuilt account can reach
    // neither, so this is belt and braces).
    if (remoteMatch && rawPage1State === 'watching' && !browse.allows(remoteMatch.user_id)) {
      invoke('app/pause', {}).catch(() => {})
      setLoadingProfile(false)
      setSearching(false)
      clearLoading()
      return () => { cancelled = true }
    }
    if (!remoteMatch) {
      skipAbortedRef.current = false
      setDisplayedMatch(null)
      setPreloadingMatch(null)
      setLoadingProfile(false)
      page1Pull.reset()
      // Skip found nobody — resolve the name-slide to the (now "Once") label.
      startNameRise()
      searchingTimer = setTimeout(() => {
        if (!cancelled) setSearching(false)
      }, 420)
      clearLoading()
      return () => {
        cancelled = true
        if (searchingTimer) clearTimeout(searchingTimer)
      }
    }
    // Same user already on screen — this run was triggered by a state-only
    // change (e.g. watching→waiting after invite). Skipping the preload is
    // not just an optimization: setPreloadingMatch(B) when displayedMatch is
    // already B leaves preloadingMatch lingering (the hidden preloader's
    // mount condition is `user_id !== displayedMatch.user_id`, so it never
    // mounts to fire onReady and clear itself). Then any later optimistic
    // setDisplayedMatch(null) — e.g. runCancel — flips that condition true,
    // the hidden card mounts, onReady fires off cache instantly, and
    // onPreloadReady re-promotes B. The card slides back in, then realtime
    // clears it: the visible "down→up→down" on cancel.
    if (displayedMatch && displayedMatch.user_id === remoteMatch.user_id) {
      setLoadingProfile(false)
      startNameRise()
      clearLoading()
      return () => { cancelled = true }
    }
    // A match just started — swap the card NOW, without the preload hold.
    // The hold below exists for skip: keep the current candidate on screen
    // while the next one's photos warm the disk cache. Applying it to a chat
    // would leave the person the user was merely *watching* on the home pane
    // while the chat sheet rises over them, so approving YAEL's invitation
    // briefly shows someone else's face behind (and before) the conversation.
    // The partner's photos load into a card the chat sheet is covering anyway.
    if (rawPage1State === 'chat') {
      setLoadingProfile(false)
      preloadingMatchRef.current = null
      setPreloadingMatch(null)
      setDisplayedMatch(remoteMatch)
      page1Pull.reset()
      startNameRise()
      setSearching(false)
      clearLoading()
      return () => { cancelled = true }
    }
    // Same exact URLs MatchCard requests (raw filename, no encodeURI) so the
    // prefetch shares expo-image's disk-cache key — single source of truth in
    // matchImageUrls.
    const urls = matchImageUrls(remoteMatch)
    const startPreload = () => {
      // skipAbortedRef: the user paused mid-skip — never mount the preloader
      // for a candidate that must not surface (the Image.prefetch promise
      // below can resolve after the abort).
      if (cancelled || skipAbortedRef.current) return
      // Mount the hidden MatchCard. The card slides up only after that
      // hidden instance reports onReady (all photos painted from cache).
      setPreloadingMatch(remoteMatch)
    }
    if (urls.length === 0) {
      // No photos to wait for — promote immediately. No image-loading wait,
      // so the "Loading profile data" copy never applies here.
      setLoadingProfile(false)
      setDisplayedMatch(remoteMatch)
      page1Pull.reset()
      // New card mounts now (no photos to wait on) — rise the name with it.
      startNameRise()
      searchingTimer = setTimeout(() => {
        if (!cancelled) setSearching(false)
      }, 460)
      clearLoading()
    } else {
      // Server has answered with a candidate; from here until the hidden
      // preloader reports every photo painted we're loading this profile's
      // images — swap the scanning headline to "Loading profile data".
      setLoadingProfile(true)
      // Disk-cache the photos first; once cached, mount the hidden preloader.
      Image.prefetch(urls).then(startPreload, startPreload)
    }
    return () => {
      cancelled = true
      if (searchingTimer) clearTimeout(searchingTimer)
    }
  }, [remoteMatch?.user_id, rawPage1State])

  // When the remote profile snapshot fields change (e.g. last_seen refresh)
  // but it's still the same user, propagate the new fields without remounting.
  useEffect(() => {
    if (remoteMatch && displayedMatch && remoteMatch.user_id === displayedMatch.user_id) {
      setDisplayedMatch(remoteMatch)
    }
  }, [remoteMatch])

  // The allowance is spent on a face that actually ROSE, never on one the server
  // merely drew: a candidate released unseen (the guard above) or aborted
  // mid-skip cost the user no look at all. `watch` is idempotent per person, so
  // the same card read again after a relaunch — page1 keeps its occupant — is
  // the same view and spends nothing.
  useEffect(() => {
    if (state !== 'watching' || !displayedMatch) return
    browse.watch(displayedMatch.user_id)
  }, [displayedMatch?.user_id, state])

  // Hidden preloader fires onReady once all photos have rendered. That's the
  // signal to promote the match into the visible slot — at that point the
  // photos are decoded and the upcoming SlideInDown shows a complete card.
  // The userId guard rejects a stale onReady from a previous preload whose
  // MatchCard is still tearing down: we only promote when the user the
  // callback was bound to still matches the current preloadingMatch.
  const onPreloadReady = useCallback((readyUserId: string) => {
    // Paused mid-skip — never promote (defensive; runPauseFromSkip also nulls
    // preloadingMatchRef, so `current` is usually already null here).
    if (skipAbortedRef.current) return
    const current = preloadingMatchRef.current
    if (!current || current.user_id !== readyUserId) return
    // Reset the pull transform first — pull-to-skip leaves pullY at screenH
    // (the outer wrapper translated off-screen). Mounting the new card while
    // the outer wrapper is still translated means SlideInDown plays inside
    // an off-screen container, invisible to the user. requestAnimationFrame
    // gives the UI thread a chance to apply pullY=0 before React mounts the
    // new keyed Animated.View.
    page1Pull.reset()
    preloadingMatchRef.current = null
    setPreloadingMatch(null)
    // Keep `loadingProfile` (and `searching`) ON through the SlideInDown:
    // the headline sits behind the rising card, so the copy must stay
    // "Loading profile data" the whole way up rather than flipping back to
    // "Scanning..." for the tail. Both clear together once the card has
    // risen and covered the headline (480ms > the slide-up duration).
    requestAnimationFrame(() => {
      setDisplayedMatch(current)
      // Rise the next name in step with the card's RisingCard slide-up.
      startNameRise()
    })
    setTimeout(() => { setSearching(false); setLoadingProfile(false) }, 480)
    if (ignoreLoadingRef.current) {
      setIgnoreLoading(false)
      setBusy(false)
      setPendingKey(null)
    }
  }, [page1Pull.reset, startNameRise])

  const showHiddenPlaceholder = !!profile && displayedCardMode === null
  // Both home-pane sections (empty placeholder and match card) are always
  // mounted. The empty pane sits behind the match pane and is exposed
  // automatically when slots translate off-screen (no opacity cross-fade
  // needed). HomeCard renders with transparentInner so the empty UI shows
  // through the gap between cards.
  const firstPhoto = profile?.images?.[0]
  const firstProfileImage = firstPhoto?.normal
  const profileAvatarUrl = firstProfileImage && profile
    ? publicImageUrl(profile.user_id, 'normal', firstProfileImage)
    : null
  // The home center circle no longer renders the user's own avatar (it is
  // the pause button during a skip — see the page1Profile branch in render).
  // selfAvatar is still tracked so the persistent on-disk copy other screens
  // read stays in sync with the user's first photo (sync effect below).
  const selfAvatar = useSelfAvatar()

  useEffect(() => {
    if (profileAvatarUrl) Image.prefetch([profileAvatarUrl], 'memory-disk')
  }, [profileAvatarUrl])

  // Keep the persistent self-avatar copy in sync with the user's first photo.
  // Prefers the in-flight upload's local URI when available so post-onboarding
  // users skip the network round-trip entirely; otherwise downloads from
  // storage so subsequent cold starts render from disk.
  const userId = profile?.user_id
  useEffect(() => {
    if (!firstProfileImage || !userId) return
    if (selfAvatar?.filename === firstProfileImage) return
    const localUri = localPhotoUriCache.get(firstProfileImage)
    if (localUri) {
      setSelfAvatarFromLocal(firstProfileImage, localUri).catch(() => {})
    } else {
      setSelfAvatarFromRemote(firstProfileImage, userId).catch(() => {})
    }
  }, [firstProfileImage, userId, selfAvatar?.filename])

  // The chat partner's name (stripped of the trailing ", age"). Titles the
  // chat sheet and fills {name} in the invite-confirm copy.
  const matchName = nameFromTitle(profile?.relations?.match?.title)
  const matchIsMale = profile?.relations?.match?.is_male
  const inviteConfirmDesc = tgg('home.inviteConfirmDesc' as any, isMale, matchIsMale)

  // The match card surfaces both for live interaction states and for
  // terminal/ended states (missed/fail). The ended states show the same match
  // + a single dismiss button that clears the record on the server.
  const isEndedState = state === 'missed' || state === 'fail'
  const isMatchCardOpen =
    state === 'watching' || state === 'waiting' || state === 'chat' ||
    isEndedState
  // ── Match-state actions ────────────────────────────────────────────────
  // The pinned bottom slot swaps in per-state buttons when the match card
  // is open, replacing the visibility toggle. Destructive actions route
  // through a ConfirmDialog first.
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  // Which board's message is up, if any — see "what the heading chip's mark
  // opens". One piece of state for both cards: only ever one of them is the card
  // in front of the user.
  const [messageOpen, setMessageOpen] = useState<'page1' | 'page2' | 'approve' | null>(null)
  // What the message popup should do once it is out of the way. A popup that
  // raises ANOTHER popup has to chain through `onClosed` — iOS silently refuses
  // to present a second Modal while the first is still up — and this is the same
  // ref-and-chain the invite prompt already uses for its two follow-ups.
  const messageIntentRef = useRef<null | 'cancel' | 'buy'>(null)
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)
  // Out-of-hearts auto-hide flow: the settings visibility row surfaces a "buy
  // extra hearts" prompt instead of "go visible" when balance + extra is 0
  // (the server would re-hide immediately otherwise). Tapping opens this
  // picker (3 / 10 / 50 options).
  const [buyExtraOpen, setBuyExtraOpen] = useState(false)
  // Index into READY_HEADLINES; re-rolled on each entry to the ready state
  // by the effect next to headlineText. Lazy init so the first appearance is
  // already random rather than always the first sentence.
  const [readyHeadlineIdx, setReadyHeadlineIdx] = useState(() => pickHeadline(-1, READY_HEADLINES.length))
  // Ending the chat: ONE popup, and it is the whole question (user directive
  // 2026-08-02). A title, the sentence saying what ending a chat does, and the
  // two answers — leaving, and leaving with a block — each of which FIRES on the
  // tap. It was a bare row of those same two buttons where each one raised a
  // SECOND popup asking the same thing again, so pressing "End chat" showed the
  // words "End chat" twice and had to be answered twice. Nothing chains through
  // `onClosed` any more either: the intent ref that existed only to hand a Modal
  // over to another Modal is gone with both ConfirmDialogs.
  // Report is NOT here — it moved to a dedicated flag button on every match
  // card (see reportTargetId / MatchCard.onReport below) so a user can report
  // an inappropriate photo/bio before ever entering chat.
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const closeChatMenu = useCallback(() => setChatMenuOpen(false), [])
  // User id to report, set by the flag button on ANY match card (page1
  // watching/waiting/chat/ended + page2 pending/dead-invite). One shared
  // report confirm is driven off this — the surface is detected server-side,
  // so the only thing the client needs is which user. Replaces the old
  // chat-only `chatConfirmAction === 'report'` path.
  const [reportTargetId, setReportTargetId] = useState<string | null>(null)
  // Free-text note the user can optionally add to a report. Reset each time
  // a report is opened (openReport) and after submit/cancel.
  const [reportNote, setReportNote] = useState('')
  const openReport = useCallback((userId: string) => {
    tap()
    setReportNote('')
    setReportTargetId(userId)
  }, [tap])
  // Shared-circles popup: opened by tapping the on-photo circle chip on any
  // match card, and it holds EVERYTHING the pair shares — every mutual friend
  // and every shared group in one list (user directive 2026-07-29). The chip is
  // wired the same way wherever a card is rendered, so the fetching and the
  // popup's own state live in the one hook the Communities sheet uses too
  // (components/SharedListPopup.tsx → useSharedCircles).
  //
  // A tapped person opens the Communities sheet OVER this popup, so the sheet
  // being open is exactly "the popup is covered": it hides under that page and
  // comes back the moment the sheet closes, by whatever route it closed (user
  // directive 2026-07-30). It used to close outright, which cost the user the
  // chip again to get back to a list they had only stepped away from.
  const circles = useSharedCircles(communitiesSheetOpen)

  const runAction = (
    endpoint: string,
    key: string,
    onDone?: () => void,
    body?: Record<string, unknown>,
  ) => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey(key)
    const done = () => { setBusy(false); setPendingKey(null); onDone?.() }
    invoke(endpoint, body ?? {})
      .then(done)
      .catch(err => { console.error(err); done() })
  }

  const invitedPage1 = profile?.relations?.page1 as { expires_at?: string; invited_at?: string; extended?: boolean; message?: string } | undefined
  const inviteExpiresAt = invitedPage1?.expires_at

  // The LINE a terminal card's strip states, keyed by the raw v3 server
  // `message` (page1.message / page2.message), not the legacy `event` shim —
  // which keeps the lookup orthogonal to userStore's missed/fail synthesis.
  // page1 texts vary by the other user's gender (he/she); page2 texts vary by
  // both (other user's verb + user's "available/answered" adjective).
  //
  // The TITLE and nothing else (user directive 2026-08-01): each of these states
  // had a paragraph under it as well, and each paragraph restated its title and
  // then said in words what the chip beside the line now says as a verb. The
  // `.desc` half of this key set is deleted.
  const page1Message = isEndedState ? invitedPage1?.message : undefined
  const page1MessageTitle = page1Message ? tg(`home.locked.page1.${page1Message}.title` as never, matchIsMale) : ''
  const page1MessageDesc = page1Message ? tg(`home.locked.page1.${page1Message}.desc` as never, matchIsMale) : ''
  const page2Message = page2DeadInvite?.message
  const page2OtherMale = page2DeadInvite?.is_male ?? null
  const page2MessageTitle = page2Message ? tgg(`home.locked.page2.${page2Message}.title` as never, isMale, page2OtherMale) : ''
  const page2MessageDesc = page2Message ? tgg(`home.locked.page2.${page2Message}.desc` as never, isMale, page2OtherMale) : ''

  // A find tapped before the app finished booting / refocusing is held here
  // until startup settles, instead of being swallowed by a `disabled` button.
  // See `requestFind` + its draining effect below.
  const [findQueued, setFindQueued] = useState(false)

  // Mirrors runIgnore: sets searching=true so the empty pane keeps showing
  // the locating text across the whole round-trip + slide-in. Without this,
  // state flips to 'watching' the moment realtime arrives and the empty pane
  // briefly renders "no one nearby" until the match card finishes sliding up.
  const runFind = useCallback(() => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey('hidden-find')
    setSearching(true)
    // Find always starts in the "no candidate yet" scan phase.
    setLoadingProfile(false)
    // Fresh play press: keep the center circle showing PLAY until the new
    // card rises (watchCardShown flips back true once displayedMatch is set).
    setWatchCardShown(false)
    // A fresh find clears any pause-abort latched by a previous skip.
    skipAbortedRef.current = false
    // Keep the request so a pause tapped mid-skip can be chained after it.
    const findPromise = invoke('app/find', {})
    inflightSkipRef.current = findPromise
    findPromise
      .then(() => {
        setBusy(false)
        setPendingKey(null)
      })
      .catch(err => {
        console.error(err)
        setBusy(false)
        setPendingKey(null)
        setSearching(false)
        setLoadingProfile(false)
        // Recovery from a dropped invoke (matches runIgnore's .catch path):
        // refetch the user so the sync effect re-runs against fresh page1.
        const uid = useUserStore.getState().profile?.user_id
        if (uid) void useUserStore.getState().fetch(uid)
      })
  }, [busy])

  // The center pause button shown during a skip (page1Profile branch in
  // render). Pressing it must STOP the search and never surface a new
  // profile — even one the server already found (the "Loading profile data"
  // state). (1) Abort the skip pipeline client-side: skipAbortedRef no-ops
  // every promote path (the remote→displayed sync effect, startPreload,
  // onPreloadReady) and the radar / preloader / loading copy are torn down.
  // (2) Fire app/pause chained AFTER any in-flight app/find|app/ignore so the
  // server commits app_pause LAST and page1 ends `locked`, not watching.
  // busy/ignoreLoading/pendingKey are left set so the pull-to-skip gesture
  // stays blocked until the pause lands (cleared then by the sync effect /
  // runFind's .then). No confirm dialog — the user asked for an immediate
  // stop, and pause is recoverable from the center play button.
  const runPauseFromSkip = useCallback(() => {
    if (pausing) return
    tap()
    skipAbortedRef.current = true
    preloadingMatchRef.current = null
    setPreloadingMatch(null)
    setDisplayedMatch(null)
    setSearching(false)
    setLoadingProfile(false)
    setPausing(true)
    const after = inflightSkipRef.current ?? Promise.resolve()
    after
      .catch(() => {})
      .then(() => invoke('app/pause', {}))
      // Release the skip-abort latch once the pause has settled. app/pause is
      // a trusted self-transition (api.ts), so on success page1 is already
      // 'locked' here and clearing the latch is redundant-but-safe. On
      // failure it is the safety net that guarantees the latch can never
      // outlive the pause — a stuck latch + a stale page1 'watching' would
      // otherwise deadlock the remote->displayed sync effect forever.
      .then(() => { skipAbortedRef.current = false; setPausing(false) })
      .catch(err => { console.error(err); skipAbortedRef.current = false; setPausing(false) })
  }, [pausing])

  // Optimistic exit: clear displayedMatch synchronously so the card slides
  // out carrying its last-rendered props (timer + cancel button intact),
  // avoiding the 1-frame in-between render where state is null but the card
  // is still mounted. Unlike runIgnore (which fans out to a new candidate via
  // the sync effect's clearLoading path), cancel has no follow-up search —
  // so we clear busy/pendingKey directly off the invoke promise. Don't set
  // `searching=true`: there's no candidate fetch in flight, so the radar UI
  // would be misleading and its 420ms self-clear inside the sync effect was
  // producing the visible flicker on the empty pane after the slide-out.
  const runCancel = useCallback(() => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey('cancel-confirm')
    setCancelConfirmOpen(false)
    setDisplayedMatch(null)
    invoke('app/cancel', {})
      .then(() => {
        setBusy(false)
        setPendingKey(null)
      })
      .catch(err => {
        console.error(err)
        setBusy(false)
        setPendingKey(null)
      })
  }, [busy])

  // ── Declining a pending invitation ───────────────────────────────────────
  // The ONE route: the status card's own Skip button, through this confirm
  // (decline is irreversible). Nothing else on the screen reaches it.
  const openRefuseConfirm = useCallback(() => {
    tap()
    setRefuseConfirmOpen(true)
  }, [])
  // A PENDING INVITATION IS NOT SWIPEABLE (user directive 2026-07-30). The
  // sheet is handed swipeToClose={!page2PendingInvite}, so while the question
  // is open the card does not move under the finger at all.
  //
  // Third position on this, and the reasoning is worth keeping: it was
  // unswipeable originally (`enabled:false`), then made swipeable on 2026-07-19
  // with the single-screen redesign, on the ground that swipe-down-to-close is
  // the one dismissal gesture every surface shares and a card that alone
  // refused it read as broken. What that missed is that this card is not a
  // surface the user OPENED — it is the app asking him something, and the two
  // answers are both named buttons on it. The dismiss gesture had nothing of
  // its own to do here, so it became a second, silent Skip.
  //
  // The DEAD card (missed/fail) is the opposite case and keeps the swipe: it
  // asks nothing, so riding it off is exactly its Continue button (app/free2).

  // Watching-state invite prompt lives in a popup raised by the hero heart,
  // NOT inside the MatchCard scroll (user directive 2026-07-25 — moved off the
  // card entirely). Tapping the heart opens this BottomSheet; the card carries
  // no footer block any more. The body is the shared ReplyingInviteCard info
  // component (same scaffold/spacings as the page2 side): the title rides as a
  // bold lead-in into the body, so a single tap on the primary button sends
  // the invite.
  const [invitePopupOpen, setInvitePopupOpen] = useState(false)
  const openInvitePopup = useCallback(() => { tap(); setInvitePopupOpen(true) }, [])
  // What to run once the popup has fully slid out. Set before closing so the
  // follow-up (open the build-profile gate or the buy-extra picker) fires only
  // AFTER this Modal is gone — two Modals presenting at once on the same stack
  // silently drops the second.
  const invitePopupIntentRef = useRef<null | 'build' | 'buy'>(null)
  // Only meaningful while watching with the card up. Sending flips the state to
  // 'waiting' over Realtime, which drops `visible` and slides the popup away on
  // its own — no keep-alive timer needed the way the inline footer once was.
  const invitePopupVisible = invitePopupOpen && state === 'watching' && isMatchCardOpen
  // ...but the flag itself is STICKY: every exit that isn't a dismiss (sending
  // the invite, the card lapsing, a skip) only drops the gate around it, so
  // `invitePopupOpen` stayed true and the popup re-raised ITSELF the next time
  // a candidate landed in `watching` — the user pressed play, a profile came
  // up, and the invite sheet appeared with no heart tap (bug, 2026-07-28).
  // Clear it the moment it stops being showable, so the heart is the only way
  // in.
  useEffect(() => {
    if (invitePopupOpen && !invitePopupVisible) setInvitePopupOpen(false)
  }, [invitePopupOpen, invitePopupVisible])

  // ── Invitation lapse ─────────────────────────────────────────────────────
  // The clock reaching 00:00 is the only local signal that an invitation died —
  // nothing else on the client changes until the server says so. The per-minute
  // app_expire_sweep gets there eventually, but up to 60s later: long enough to
  // leave the user staring at a dead card whose cancel button, if tapped, used
  // to forfeit their held heart. So the moment it lapses, ask the server to
  // settle it. /app/focus runs app_expire_self, and the real locked/expire
  // state comes back over Realtime — which is what swaps the card. Nothing is
  // faked locally, so a failed call just falls back to the cron.
  //
  // Fires once per invitation (useSecsLeft guarantees it) and the server
  // re-checks expires_at under the row lock, so a fast device clock can never
  // close a still-live invite. Shared by both directions: the outgoing
  // InviteTimerCard and the incoming ReplyingInviteCard below.
  const handleInviteLapsed = useCallback(() => {
    invoke('app/focus', { notif_perm: notifPerm }).catch(() => {})
  }, [notifPerm])

  // THE INCOMING INVITATION, IN THE CARD'S OWN STRIP (user directive
  // 2026-08-01). It was a status card at the top of the page2 card — a title, a
  // paragraph and two buttons — and it is one line and two chips now: the quiet
  // answer first and the purple one last, which is the app's rule wherever two
  // actions stand together. The cost badge stays ON the accept chip, which is
  // the reason a strip's chips are a size up (CHIP_HEIGHT_MD): what this press
  // spends must be legible at the moment of pressing.
  //
  // Being unaffordable does not dim it — the press routes to the buy popup
  // instead, exactly as the card's button did. The DEPOSIT counts here and
  // nowhere else (see creditsForApprove): the server pays an accept out of it
  // when the wallet cannot, so measuring against balance + extra alone sent the
  // one user this was written for — someone waiting on an invitation of his own,
  // with his only credit riding it — to a buy popup instead of to the chat.
  // (built below, beside page1's, where the ended-state predicates are)

  // Hero-photo overlay button on the page1 MatchCard:
  //   - watching → heart only. Tapping it now opens the invite popup
  //     (openInvitePopup); the old scroll-to-inline-footer behaviour is gone
  //     with the footer. Pause is NOT on the card any more (2026-05-22, user
  //     request) — the only game-mode pause control is the home pane's center.
  //   - chat     → OPEN CHAT. This used to be the end-chat X; that moved into
  //     the chat sheet's 3-dot menu on 2026-07-19, because ending the
  //     conversation belongs with the conversation, and the home card needs an
  //     affordance to get back INTO it now that there is no chat tab.
  //   - else (waiting, ended) → no button at all. The relevant action for
  //     those states lives elsewhere (timer's cancel, message-block's
  //     continue), so a heart on the hero would just be noise.
  const page1CardActions: CardAction[] | undefined =
    state === 'chat'
      ? [{
          key: 'open-chat',
          icon: <ChatIcon color={INK} size={ICON.huge} />,
          onPress: () => openOverlay('chat'),
          badge: chatHasUnread,
        }]
      : state === 'watching'
        ? [
            {
              key: 'like',
              icon: <HeartIcon color={INK} stroke={INK} size={ICON.huge} />,
              // The heart no longer scrolls to an inline invite footer; it
              // raises the invite popup (footer moved off the card).
              onPress: openInvitePopup,
            },
          ]
        : []

  const isNetMode = !showNotifOverlay && !showLocOverlay && !locFailed && showNoInternetOverlay

  // (permConfirmLabel / permIcon / permDesc were removed with the permission
  // ConfirmDialog popup — the inline centerNotice below owns the icon/text
  // now; permTitle is still the notice's text for the permission states.)
  const permOnConfirm = locFailed
    ? handleLocRetry
    : isNetMode
      ? handleNetRetry
      : handlePermissionRequest
  const permBusyState = locFailed ? locBusy : isNetMode ? netBusy : permBusy


  // v3: synth state is null for both `free` (find ran, no candidate) and `locked`
  // without message (brand-new user, or post-clear). Only the latter is "ready to
  // find" — when state is `free` we surface the no-one-nearby + Search Preferences UI.
  // Never offer the find/play button while geo-gated — the server returns no
  // candidates for a gated user anyway, so the button would be a dead end.
  // …and never once the browse allowance is spent: the play button IS the
  // request for a candidate, so a spent allowance has no play button. What
  // stands in its place is the gate below.
  const isReadyToFind = !geoGated && !browse.spent && state === null && rawPage1State !== 'free'
  const isPermMode = showNotifOverlay || (state !== 'chat' && (showLocOverlay || locFailed || isNetMode))

  // While gated — by the server availability gate OR a missing device
  // permission — the chat and invite overlays are unreachable. The MENU is
  // deliberately never gated: the user must still be able to open settings and
  // change their location while they wait for the gate to lift.
  const overlaysGated = geoGated || isPermMode
  overlaysGatedRef.current = overlaysGated
  // If the gate turns on while chat is open, close it so a gated surface can't
  // stay on screen. The menu / profile sheet are left alone by design.
  useEffect(() => {
    if (overlaysGated) setOverlays(prev => prev.filter(o => o !== 'chat'))
  }, [overlaysGated])

  // ── Queued find ──────────────────────────────────────────────────────────
  // The play button must register the very FIRST tap, even while the app is
  // still booting (app/start in flight, no GPS fix yet) or refocusing
  // (app/focus in flight). Previously the button was `disabled` through that
  // whole window, so the tap landed on a dead Pressable and was silently
  // swallowed — the reported "first tap doesn't always work". Now the tap is
  // never dropped: if a find can't run yet it is QUEUED (button shows a
  // spinner) and auto-runs the instant startup settles.
  const findReady = startupCompleted && !startupInflight && !focusInflight && !locFetching
  const requestFind = useCallback(() => {
    if (busy || searching || findQueued) return  // a find is already running/queued
    if (findReady) { runFind(); return }          // ready → fire immediately
    tap()                                         // not ready → acknowledge the tap + queue
    setFindQueued(true)
  }, [busy, searching, findQueued, findReady, runFind])
  useEffect(() => {
    if (!findQueued) return
    // No longer ready-to-find (a candidate auto-arrived, or the gate
    // flipped) → the queued find is moot, drop it.
    if (!isReadyToFind) { setFindQueued(false); return }
    if (findReady && !busy && !searching) {
      setFindQueued(false)
      runFind()
    }
  }, [findQueued, isReadyToFind, findReady, busy, searching, runFind])

  // Permission notice headline: a SINGLE explanatory line per kind, telling
  // the user WHY the access is required. Notif is gendered (תפספס / תפספסי);
  // location is gender-neutral. locFailed (GPS fix failed despite permission)
  // and noInternet keep their own dedicated titles since the cause is different.
  const permTitle = showNotifOverlay
    ? tg('home.notifAccessRequired', isMale)
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationUnavailableTitle') : t('home.locationAccessRequired'))
      : locFailed
        ? t('home.locationUnavailableTitle')
        : t('home.noInternetTitle')

  // Single source of truth for the home-pane center "notice": the short
  // headline text + the round center button's icon + its action, unified
  // across every blocked state (missing notif/location/internet permission,
  // or the server gate: not-in-any-group → request-to-join / waiting, or
  // no-notifications/geo). Replaces the old ~5 ConfirmDialog popups: the
  // existing permCenterGroup (text + the round Pressable that normally
  // renders play/avatar/hamburger) becomes the action surface. Priority
  // matches the old isPermMode precedence (permission first — you must fix
  // it regardless), then the server availability gate. null = normal home.
  // For the geo/group gated branches the center icon is the user's OWN profile
  // photo and a tap opens the profile-preview sheet — the only useful action
  // left in a "you can't play right now" state is review/edit your profile.
  // Falls back to the InboxIcon ONLY if the user has no avatar resolved yet
  // (fresh install before the first photo finishes downloading).
  const gateAvatarUri = selfAvatar?.uri ?? profileAvatarUrl ?? null
  const centerNotice: { text: string; icon: ReactNode; onPress?: () => void; busy?: boolean; disabled?: boolean; avatarUri?: string | null } | null =
    isPermMode
      ? {
          text: permTitle,
          icon: showNotifOverlay
            ? <BellIcon color={WHITE} size={64} />
            : (showLocOverlay || locFailed)
              ? <MapPinIcon color={WHITE} size={64} />
              : <WifiOffIcon color={WHITE} size={64} />,
          onPress: permOnConfirm,
          busy: permBusyState,
        }
      : geoGated
        ? (availability?.reason === 'push'
            // notif perm IS granted but the server still push-gates (dead
            // Expo token): nudge the user to re-enable / reopen. Same copy
            // as the device-side notif overlay so the headline reads
            // identically whether the gate comes from device perm or a dead
            // server-side token. Stays a bell icon — the call to action is
            // re-enable notifications, not view your profile.
            ? { text: tg('home.notifAccessRequired', isMale), icon: <BellIcon color={WHITE} size={64} />, onPress: handlePermissionRequest, busy: permBusy }
            : availability?.state === 'not_yet'
              // Scheduled-future area: still a geo state, treat it like the
              // other geo-gated branches — show the user's avatar, tap opens
              // the profile sheet. (Was an inert InboxIcon before.)
              ? { text: t('home.geoGate.notYet').replace('{date}', gateWhenStr), icon: <InboxIcon color={WHITE} size={64} />, avatarUri: gateAvatarUri, onPress: openProfileSheet }
              // Any other unavailable state (geo / membership in disabled-only
              // groups) — render the user's own avatar; tap opens the profile
              // preview sheet so they can review/edit their profile while they
              // wait for the gate to lift. Static InboxIcon is the fallback
              // for a fresh install where the avatar hasn't been resolved yet.
              : { text: t('home.geoGate.unavailable'), icon: <InboxIcon color={WHITE} size={64} />, avatarUri: gateAvatarUri, onPress: openProfileSheet })
        // The browse allowance, spent (lib/browseGate.ts). LAST of the three:
        // a missing permission and the server's own gate are things the user
        // must fix before anything works at all, and this one is a door he can
        // walk through whenever he likes. It is also the one notice that does
        // NOT take the card away (see blockingNotice, which is deliberately not
        // told about it): the person on screen is one of the two he is allowed
        // to be watching, and the gate stands where the NEXT one would rise.
        // THE CIRCLE IS THE DOOR ITSELF, NOT A POPUP IN FRONT OF ONE (user
        // directive 2026-08-01). A tap goes straight to the photo step — the
        // same jump the dock's profile key makes for an unfinished account, so
        // the resume is onboarding's own `initialStep` and nothing here can
        // disagree with it. It used to raise the app's BuildProfileGate popup,
        // whose one button did exactly this: a surface saying "you need a
        // profile" over a pane whose headline already says it, with a button
        // for the only thing there is to do. What is actually missing is
        // PHOTOS, so the mark is the app's own CameraIcon rather than the
        // build-a-profile glyph — the circle wears what it opens.
        : browse.spent
          ? {
              text: t('home.browseGateTitle'),
              icon: <CameraIcon color={WHITE} size={CENTER_GLYPH_SIZE} />,
              onPress: () => { tap(); router.push('/onboarding') },
            }
          : null

  // ── Invitation countdowns ───────────────────────────────────────────────
  // A COUNTDOWN BELONGS TO THE PERSON, NOT TO THE MESSAGE ABOUT HIM (user
  // directive 2026-07-30). Both clocks used to be a big centred readout inside
  // the status card that announces the invitation — a block at the TOP of the
  // card's scroll, which the user scrolls past to see the face, taking the one
  // number with a deadline on it off the screen with it. They ride the card's
  // name/age chip now (MatchCard's `countdown`), which is pinned out of the
  // scroll, so the clock is wherever the person is.
  //
  // Each is derived HERE, beside the state that decides which status card the
  // topBlock is showing, so the card and the clock on it can never disagree:
  // outgoing (this user invited someone and is waiting) → InviteTimerCard;
  // incoming (someone invited this user) → ReplyingInviteCard.
  //
  // AND A CARD THAT IS OVER CARRIES NO CLOCK AT ALL (user directive
  // 2026-07-31): a deadline that has passed is not a number any more. What that
  // card says is said by the strip's LINE, which is the state's own title.
  const waitingExpiresAt = displayedCardMode === 'waiting' ? inviteExpiresAt ?? null : null
  const page1Ended = isEndedState && !!page1MessageTitle
  const page2Ended = !page2PendingInvite && !!page2MessageTitle
  const page1Back = () => runAction('app/clear1', 'ended-stop')
  const page2Back = () => runAction('app/free2', 'free2')
  // The lapse fires from the clock, so it travels with it: the moment the strip's
  // countdown hits zero it asks the server to settle the invitation.
  const page1Countdown: CardCountdown | undefined =
    displayedCardMode === 'waiting' && inviteExpiresAt
      ? { expiresAt: waitingExpiresAt, onLapsed: handleInviteLapsed }
      : undefined
  const page2Countdown: CardCountdown | undefined =
    page2PendingInvite
      ? { expiresAt: page2PendingInvite.expires_at, onLapsed: handleInviteLapsed }
      : undefined

  // ── WHAT THE HEADING CHIP'S MARK OPENS ─────────────────────────────────────
  // (user directive 2026-08-01.) The three status CARDS this app used to render
  // at the top of a profile's scroll are a POPUP now, raised by the chevron
  // beside the clock: the state's own title, its paragraph and its buttons, in
  // the surface the app already uses for everything it has to say. What made the
  // old arrangement wrong was never the words — it was that scrolling to the face
  // carried them off the screen, and that the strip which replaced them turned
  // the one surface meant to be a FACE into a board of furniture.
  //
  // `messageOpen` is which board's message is up, and the popup reads its
  // content from the same predicates the chip's clock does, so the mark and what
  // it opens can never disagree.
  const page1HasMessage = (displayedCardMode === 'waiting' && !!inviteExpiresAt) || page1Ended
  const page2HasMessage = !!page2PendingInvite || page2Ended
  const openPage1Message = useCallback(() => { tap(); setMessageOpen('page1') }, [])
  const openPage2Message = useCallback(() => { tap(); setMessageOpen('page2') }, [])
  // The round chat button's own popup. Same card, ONE answer: the user reached
  // for the chat, so this surface is the approval and nothing else (user
  // directive 2026-08-01, "certainly no skip button"). Refusing is what the
  // heading chip's message opens, and what the drag and hardware back ask.
  const openApprove = useCallback(() => { tap(); setMessageOpen('approve') }, [])
  // Chat is the state with no deadline and something to press: its word takes
  // the clock's own place on the chip (user directive 2026-08-01). Ending the
  // conversation has lived with whom it ends since 2026-07-26; only where on the
  // card has moved.
  const page1Trailing = displayedCardMode === 'chat'
    ? { label: t('chat.endChat'), onPress: () => { tap(); setChatMenuOpen(true) } }
    : undefined

  // AN INVITATION THAT ARRIVED IS ANSWERED THE WAY ONE IS SENT (user directive
  // 2026-08-01): the page2 card wears the watching card's layout — one round
  // action floating over the photo, raising a popup that states what the press
  // does and what it costs. The mark is the CHAT glyph, because a heart says
  // "this person" and what accepting actually gives is the conversation; it
  // carries NO credit gem, exactly as the heart on the sending side does not.
  // What the credit costs is the POPUP's to say, in words, which is where a
  // sender reads it too.
  //
  // It raises the very popup the heading chip's chevron does, so the two routes
  // ask one question. (For an hour that day the button accepted outright, with a
  // gem on its arc and a spinner in its glyph while the server had it; the same
  // day it was put back, because the two sides of an invitation must not be two
  // different flows.)
  const page2CardActions: CardAction[] = page2PendingInvite
    ? [{ key: 'accept', icon: <ChatIcon color={INK} size={ICON.huge} />, onPress: openApprove }]
    : []

  // Single headline text for the home pane — swaps value based on state.
  // Rendered through the same SkipHintLabel used during pull-to-skip, so
  // every empty/scanning/ready/skip message uses one gradient label at one
  // position with one styling. Each predicate is named once so the
  // "(re)entered the ready state" detection below reuses it instead of
  // duplicating the branch condition.
  const isLocatingHeadline = startupCompleted && (focusInflight || searching)
  // Strict subset of isLocatingHeadline: the server already answered with a
  // candidate and we're painting its photos into the hidden preloader. Same
  // slot, different copy ("Loading profile data" vs "Scanning...").
  const isLoadingProfileHeadline = startupCompleted && searching && loadingProfile
  const isEmptyHeadline = !showHiddenPlaceholder || cardExiting
  const showReadyHeadline = !isLocatingHeadline && !isEmptyHeadline && isReadyToFind
  // Roll a fresh random sentence each time the ready headline (re)appears:
  // the line is stable while shown but new on every entry. The roll lives in
  // an effect (not render) so render stays pure and the chosen line holds
  // across unrelated re-renders.
  const prevShowReadyHeadline = useRef(false)
  useEffect(() => {
    if (showReadyHeadline && !prevShowReadyHeadline.current) {
      setReadyHeadlineIdx(prev => pickHeadline(prev, READY_HEADLINES.length))
    }
    prevShowReadyHeadline.current = showReadyHeadline
  }, [showReadyHeadline])
  // The geo-gate message takes the rotating-headline slot and overrides every
  // other home-pane line (locating / ready / no-one-nearby). 'not_yet' and
  // 'unavailable' get distinct copy; the find button is already suppressed
  // (isReadyToFind === false) and the side tab removed (tabSpecs below).
  // `isEmptyHeadline` is the with-a-card state: the slot is behind the card,
  // so it carries this card's random skip line (SKIP_HEADLINES) — invisible
  // while the card covers it, revealed already-full the instant the card is
  // pulled away to skip.
  // The first-time tutorial peeks the card down to reveal this very slot, so
  // for its duration the slot names the gesture being demonstrated instead of
  // carrying this card's random skip line.
  const headlineText = page1Pull.tutorialPlaying
    ? t('home.skipTutorialHint')
    : centerNotice
    ? centerNotice.text
    : isLoadingProfileHeadline
      ? t('home.loadingProfile')
      : isLocatingHeadline
        ? t('home.locatingDesc')
        : isEmptyHeadline
          ? genderize(SKIP_HEADLINES[skipHeadlineIdx] ?? '', isMale)
          : showReadyHeadline
            ? genderize(READY_HEADLINES[readyHeadlineIdx] ?? '', isMale)
            : t('home.noOneNearbyTitle')

  // The invite overlay is DERIVED, not navigated to: its lifetime belongs to
  // the server, so it is simply "up" whenever page2 carries a card. That is
  // what makes it impossible to desync, and why an incoming invitation takes
  // visual priority over whoever the user is currently watching — it paints
  // above the page1 card, and it goes away only when the invitation resolves.
  const inviteOverlayOpen = !overlaysGated && !!(page2PendingInvite || page2DeadInvite)
  const inviteCardMatch = page2PendingInvite ?? page2DeadInvite
  // The sheet's onClose. Only the DEAD card can reach it now — a pending
  // invitation is not swipeable and wears no X (see openRefuseConfirm above) —
  // but it stays total on purpose: one sheet instance spans both states, so a
  // gesture begun on a card that expires under the finger must still land
  // somewhere sane rather than on a branch that does not exist.
  const closeInviteOverlay = useCallback(() => {
    if (page2PendingInvite) openRefuseConfirm()
    else runAction('app/free2', 'free2')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page2PendingInvite])
  // Back button, step 2 (see the BackHandler effect). Pending raises the decline
  // confirm — a NAMED, cancellable dialog, which is why back is left alone by
  // the no-swipe rule above: what that rule bans is putting the card away with
  // no answer, not answering it. Dead is swallowed so back can't dismiss a card
  // the server still owns.
  inviteBackRef.current = () => {
    if (!inviteOverlayOpen) return false
    if (page2PendingInvite) { openRefuseConfirm(); return true }
    return true
  }
  // (A step used to run BEFORE the branch above, taking back up to the card's
  // own message when the profile had been scrolled into. The message is in the
  // strip now and never off screen, so an invitation's Skip / Open are always in
  // front of the reader and back goes straight to the decline confirm.)

  // What a committed pull on the page1 card does — the handler behind
  // `onPullCommit`, assigned during render because most of what it calls is
  // declared below the hook. It is deliberately the SAME function each state's
  // chip in the strip carries: the drag and the word are two ways to one
  // decision, and they cannot come apart.
  pullCommitRef.current =
    displayedCardMode === 'waiting' ? () => { tap(); setCancelConfirmOpen(true) }
    : displayedCardMode === 'chat' ? () => { tap(); setChatMenuOpen(true) }
    : page1Ended ? page1Back
    : runIgnore

  // The Communities awareness nudge that used to live here — a watched-profile
  // counter that threw the hub + a popup over the card after the third face —
  // is DELETED (user directive 2026-07-30). Nothing takes the screen away from
  // the user to teach him something; the dock's Circles entry wears a dot until
  // he opens it himself (see `circlesSeen`), and that is the whole of it. Do not
  // reintroduce a counter, a one-shot popup, or an auto-raised hub here.

  // Never paint the shell without a profile. Every branch below reads through
  // `profile?.…`, so a null profile renders a bare INK screen: no card, no
  // play button, no chrome, and no way out. That is the reported
  // blank-screen-on-launch — a device holding a dead session read the profile
  // as null and parked here. Routing (index.tsx / the _layout guard) owns the
  // real destination; hold a spinner until it decides. Placed after every hook
  // so the hook order is unchanged.
  if (!profile) {
    return (
      <View style={[styles.backdrop, styles.bootFill]}>
        <AppStatusBar />
        <Spinner color={WHITE} />
      </View>
    )
  }

  return (
    <View style={styles.backdrop}>
      {/* Glyph colour only. The bar BACKGROUND can't be set under Android
          edge-to-edge (see AppStatusBar) — the paused "muted" tone comes from
          the page behind the band, not from a status-bar colour. */}
      <AppStatusBar style="light" />
      <View style={styles.shell}>
            {/* page1 — the only standalone screen. The shell-wide sideways pan
                that used to wrap this subtree went with the drawer it opened. */}
            <View style={{ flex: 1 }}>
              <View style={styles.root}>
                {/* page1's own box, and it stops at the dock (user directive
                    2026-07-30). The strip is a FLOW SIBLING under this, not a
                    layer over it, so the empty pane and the match card are laid
                    out in what is left above it and a card can never cover it.
                    `overflow:'hidden'` is the other half of that promise: a
                    pulled card rides off the bottom of THIS box, disappearing
                    INTO the strip's top edge instead of sliding across it. */}
                <View style={styles.page1}>
                  {/* Empty / no-match pane — always mounted underneath. The
                      match pane sits on top with a transparent inner card,
                      so when the match Animated.View slides off-screen the
                      empty pane is revealed (along with the searching UI
                      during a card transition). */}
                  <View
                    style={StyleSheet.absoluteFill}
                    // 'auto' also while watching so the centre circle behind
                    // the card is a live pause button the instant a skip
                    // slides the card off. During a RESTING watch the card on
                    // top intercepts every tap, so this never shadows it.
                    pointerEvents={showHiddenPlaceholder || state === 'watching' ? 'auto' : 'none'}
                    onLayout={e => {
                      // Pause-icon (centre circle) centre in the pane's own Y
                      // space is NOT read here any more — the circle is centred
                      // in the band between the topbar and the art, not in the
                      // pane, so the band's own onLayout is the only thing that
                      // knows where it landed (see permBand below).
                      const paneH = e.nativeEvent.layout.height
                      if (paneH > 0 && paneH !== paneHeight) setPaneHeight(paneH)
                    }}
                  >
                    {/* Empty pane — centers the headline+avatar group in the
                        available area using two flex:1 spacers above and
                        below. Equal spacers are the most reliable way to
                        vertically center a column of content in RN; relying
                        on justifyContent on the parent breaks here because
                        the parent is an absoluteFill (its flex children
                        sometimes shrink-collapse instead of filling on
                        certain devices). Text swaps with state (scanning /
                        ready-to-find / no-one-nearby / "לא עכשיו" during
                        pull). When a match card is on top, this whole pane
                        sits behind it; the card sliding down reveals the
                        centered group. */}
                    <View style={styles.permScreen}>
                      {/* THE BAND: from where the topbar ends down to the top of
                          the dock — i.e. the whole of page1. The circle is
                          centred in THIS (user directive 2026-07-30), and the
                          headline and the art are then each centred in the half
                          left above and below it. */}
                      <View
                        style={[styles.permBand, { marginTop: topInset }]}
                        pointerEvents="box-none"
                        onLayout={e => {
                          // The circle's centre in the pane's own Y space —
                          // exactly the pullY that lands a descending card's top
                          // edge on it. The same line the circle is drawn on,
                          // read off the band's own frame.
                          const { y, height } = e.nativeEvent.layout
                          tutorialPeekV.value = y + height * CIRCLE_CENTER
                        }}
                      >
                      {/* The headline is centred in what is left ABOVE the
                          circle — not in the band. */}
                      <View pointerEvents="none" style={styles.permHeadlineBand}>
                        <HeadlineArea text={headlineText} />
                      </View>
                      <View pointerEvents="box-none" style={styles.permCenterGroup}>
                        <View style={styles.permAvatarWrap}>
                          <AvatarHaloRings />
                          <RadarRings active={(startupCompleted && (focusInflight || searching)) || findQueued} />
                          <Pressable
                            onPress={() => {
                              if (centerNotice) {
                                if (!centerNotice.disabled && !centerNotice.busy) centerNotice.onPress?.()
                                return
                              }
                              if (isReadyToFind) {
                                // requestFind never no-ops: it fires now, or
                                // queues until startup settles, then runs (the
                                // radar rings cover the wait — no spinner).
                                requestFind()
                                return
                              }
                              if (page1Profile) {
                                // During a skip the card has slid off and this
                                // center circle is the pause button: stop the
                                // search and pause. runPauseFromSkip aborts the
                                // skip so a found profile never surfaces.
                                runPauseFromSkip()
                                return
                              }
                              // Nothing to find and nothing to pause: this is the
                              // no-one-nearby state, so the one useful thing the
                              // circle can do is open the SEARCH PREFERENCES —
                              // who, what ages, how far. That was always the
                              // intent (it used to open the whole menu drawer to
                              // get there); with the drawer gone it opens the
                              // popup itself, and wears that popup's own glyph.
                              tap()
                              setPrefsPopupOpen(true)
                            }}
                            // The play button is intentionally NOT disabled
                            // during the startup/focus window — requestFind
                            // owns that guarding (queue) so the first tap
                            // always registers.
                            disabled={centerNotice
                              ? (!!centerNotice.disabled || !!centerNotice.busy || !centerNotice.onPress)
                              : false}
                            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                          >
                            {/* Same contract as RoundButton: the circle is a
                                fixed dp, so its glyph must not follow the OS
                                font scale, and its size is the shared
                                glyph-to-circle ratio rather than a literal. */}
                            <GlyphScale cap={FIXED_BOX_SCALE}>
                            {centerNotice ? (
                              // When the gate is geo/group we render the user's
                              // OWN profile photo edge-to-edge inside the
                              // circle (no white background, no inner icon).
                              // Otherwise (perm/push/loading/notYet-without-avatar)
                              // fall back to the centered icon-on-white tile.
                              <View style={[styles.permAvatar, centerNotice.avatarUri && !centerNotice.busy ? null : styles.permGlyphCircle]}>
                                {centerNotice.busy
                                  ? <Spinner color={WHITE} size={CENTER_GLYPH_SIZE} />
                                  : centerNotice.avatarUri
                                    ? <Image source={{ uri: centerNotice.avatarUri }} style={styles.permAvatarImage} contentFit="cover" cachePolicy="memory-disk" />
                                    : centerNotice.icon}
                              </View>
                            ) : isReadyToFind || pausing || (page1Profile && !watchCardShown) ? (
                              // PLAY icon. Shown when ready to find, kept
                              // through the post-play find/loading window
                              // (page1Profile set but the card has not risen
                              // yet — watchCardShown still false) so the icon
                              // flips to pause only as the card starts rising,
                              // and shown the instant pause is tapped (pausing)
                              // so the button reads as play again immediately
                              // (user request 2026-05-22). Tapping needs no
                              // spinner — the radar-ring expansion (RadarRings,
                              // driven by searching/findQueued) is the cue.
                              <View style={[styles.permAvatar, styles.permPlayButton]}>
                                <Svg width={CENTER_GLYPH_SIZE} height={CENTER_GLYPH_SIZE} viewBox="0 0 24 24" fill={WHITE}>
                                  <Path d="M8 5v14l11-7z" />
                                </Svg>
                              </View>
                            ) : page1Profile ? (
                              // During a skip the card slides off and this
                              // center circle is revealed as the pause button
                              // (user request 2026-05-22). Tap → runPauseFromSkip.
                              <View style={[styles.permAvatar, styles.permPlayButton]}>
                                <PauseIcon color={WHITE} size={CENTER_GLYPH_SIZE} />
                              </View>
                            ) : (
                              // No candidate to show. The tap opens the search
                              // preferences, so the circle wears that popup's own
                              // mark — the same magnifying glass the dock's
                              // Preferences entry does, and it follows that entry
                              // whenever it changes. A heart here promised an
                              // action it never had, and a hamburger named a
                              // drawer that no longer exists.
                              <View style={[styles.permAvatar, styles.permGlyphCircle]}>
                                <SearchIcon color={WHITE} size={CENTER_GLYPH_SIZE} />
                              </View>
                            )}
                            </GlyphScale>
                          </Pressable>
                        </View>
                      </View>
                      {/* And the drawing is centred in what is left BELOW the
                          circle — the mirror of the headline band above it, so
                          the page reads as three bands with the one action on
                          the middle line. */}
                      <View pointerEvents="none" style={styles.permArtBand}>
                        <HomeArt />
                      </View>
                      </View>
                    </View>
                  </View>

                  {/* Pull-to-skip. PullPane frames the match card on its pull
                      transform; page1 supplies its PullContext (inner-scroll
                      coordination) and the hidden preloader as the
                      non-translated `extra` slot. The empty pane stays a
                      separate sibling behind this. */}
                  <PullPane
                    gesture={page1Pull.gesture}
                    pullY={page1Pull.pullY}
                    tutorialPlaying={page1Pull.tutorialPlaying}
                    pointerEvents={showHiddenPlaceholder ? 'none' : 'box-none'}
                    cardStyle={styles.matchCardWrap}
                    pullContext={page1Pull.pullCtx}
                    extra={preloadingMatch && preloadingMatch.user_id !== displayedMatch?.user_id ? (
                      <View style={styles.preloaderWrap} pointerEvents="none">
                        <View style={styles.matchPhoto}>
                          <MatchCard
                            match={preloadingMatch}
                            viewerLocationType={resolveLocationType(profile)}
                            bottomInset={0}
                            bottomChrome
                            cardHeight={paneHeight}
                            onReady={() => onPreloadReady(preloadingMatch.user_id)}
                          />
                        </View>
                      </View>
                    ) : null}
                  >
                    {displayedMatch && !noticeOverridesCard && (
                      /* RisingCard owns the slide-up / slide-down layout
                         animations; PullPane's wrapper owns the pull
                         transform, so the two never clobber each other. */
                      <RisingCard
                        key={displayedMatch.user_id}
                        animateEnter={matchHasMountedRef.current}
                        style={styles.matchCardWrap}
                      >
                        <View style={styles.matchPhoto}>
                          <MatchCard
                            match={displayedMatch}
                            viewerLocationType={resolveLocationType(profile)}
                            bottomInset={0}
                            // The dock is a flow sibling right under page1's box,
                            // so this card never reaches the screen edge and the
                            // band below belongs to the dock, not to it.
                            bottomChrome
                            cardHeight={paneHeight}
                            // While waiting on a sent invitation the inviter sees
                            // only the distance, never the last-seen time.
                            hideTime={displayedCardMode === 'waiting'}
                            actions={page1CardActions}
                            onReport={() => openReport(displayedMatch.user_id)}
                            onCircleTap={n => circles.open(displayedMatch.user_id, displayedMatch.is_male, n)}
                            chromeInset={topInset}
                            // The heading chip's trailing block: the clock, the
                            // mark that opens this state's message, and in chat
                            // the word that ends it.
                            countdown={page1Countdown}
                            onMessage={page1HasMessage ? openPage1Message : undefined}
                            trailingLabel={page1Ended ? t('home.cardEnded') : undefined}
                            trailingAction={page1Trailing}
                          />
                        </View>
                      </RisingCard>
                    )}
                  </PullPane>

                  {/* THE OTHER GAME CARD, IN THE SAME BOX AS THE FIRST (user
                      directive 2026-07-30). Both people the game puts in front of
                      me are a profile card on HOME: the one I am watching (page1,
                      above) and the one who invited me (page2, here). So the
                      second rises exactly where the first does — inside page1,
                      clipped at the dock's top edge — instead of taking the whole
                      screen. It used to be an overlay out in the shell, which is
                      why the same card read as two different surfaces depending on
                      which board it came from, and why the dock went away under one
                      of them but not the other. The dock is home's furniture: a
                      profile the game hands me is content ON home, not a surface I
                      opened over it, so it never covers the strip.

                      DERIVED from `relations`, so it takes priority over whoever
                      the user is currently watching: while it is up the page1 card
                      is behind it, and it leaves only when the invitation resolves.

                      A PENDING INVITATION IS ANSWERED, NOT PUT AWAY (user
                      directive 2026-07-30) — so while one is up this card has
                      neither of the two ways out a surface normally has:
                        chromeless    no close X. Nothing to "close": leaving is an
                                      ANSWER, and the status card already states
                                      both in words (Skip / Open chat). An X beside
                                      them was a second, unlabelled Skip.
                        swipeToClose  off, so the card does not move under the
                                      finger at all. It used to drag and spring
                                      back into the decline confirm (commit
                                      'confirm'), which made the app's one dismiss
                                      gesture a third route to the same decision —
                                      on the ONE card the user is being asked a
                                      question by. Do not restore either.
                      The DEAD card (missed/fail) keeps the swipe: it asks nothing,
                      so riding it off IS its Continue button (commit 'dismiss',
                      the default → onClose → app/free2). */}
                  <OverlaySheet
                    open={inviteOverlayOpen}
                    activation="scrollPan"
                    // A PENDING INVITATION IS DRAGGED, AND THE DRAG ASKS (user
                    // directive 2026-08-01): the card moves under the finger like
                    // every other surface in the app, and a committed pull
                    // springs it home and raises the decline confirm — a named,
                    // cancellable question, which is exactly what `onClose`
                    // already does for this card. It is never a silent Skip,
                    // which is what the no-swipe rule of 2026-07-30 was actually
                    // protecting against. The DEAD card asks nothing, so riding
                    // it off IS its Continue.
                    commit={page2PendingInvite ? 'confirm' : 'dismiss'}
                    onClose={closeInviteOverlay}
                    isTop={!chatOpen && !profileSheetOpen && !communitiesSheetOpen}
                    chromeless
                    zIndex={OVERLAY.z.invite}
                    cardStyle={styles.overlayCardBare}
                  >
                    {inviteCardMatch ? (
                      <MatchCard
                        key={`invite-${inviteCardMatch.user_id}`}
                        match={inviteCardMatch}
                        actions={page2CardActions}
                        onReport={() => openReport(inviteCardMatch.user_id)}
                        onCircleTap={n => circles.open(inviteCardMatch.user_id, inviteCardMatch.is_male, n)}
                        viewerLocationType={resolveLocationType(profile)}
                        bottomInset={0}
                        // Rendered inside page1's box like the card above, so the
                        // dock is under this one too.
                        bottomChrome
                        // The same height page1's own card is laid out against, so
                        // the two cards' photos are one size and neither can be
                        // measured against a box the other never had.
                        cardHeight={paneHeight}
                        onReady={page2Discovery ? () => setPage2Discovery(false) : undefined}
                        chromeInset={topInset}
                        countdown={page2Countdown}
                        onMessage={page2HasMessage ? openPage2Message : undefined}
                        trailingLabel={page2Ended ? t('home.cardEnded') : undefined}
                      />
                    ) : null}
                  </OverlaySheet>
                </View>

                {/* THE DOCK. Under page1, in the flow, so it is the one thing on
                    this screen a match card is never laid over — see the note on
                    `page1` above, and note that BOTH game cards are laid out in
                    that box now (the page2 invite included). The surfaces the user
                    OPENS — chat, the profile preview, Circles — still rise over
                    it; those are not the page. */}
                <HomeDock items={dockItems} bottom={dockBottom} />

                {/* THE CARD'S MESSAGE (user directive 2026-08-01), raised by the
                    chevron beside the clock on the heading chip. It is the
                    status CARD this app used to render at the top of the
                    profile's scroll, moved into the surface the app already uses
                    for everything it has to say: the same title, the same
                    paragraph, the same buttons.

                    The incoming invitation is `ReplyingInviteCard`, which is
                    that shape already and carries the accept's credit badge, so
                    what a press SPENDS is legible at the moment of pressing. The
                    other three are a title, a sentence and one button.

                    Every follow-up that opens ANOTHER Modal runs from
                    `onClosed`: the cancel confirm and the buy-extra picker are
                    both popups, and iOS refuses to present a second one while
                    the first is still up. */}
                <BottomSheet
                  visible={messageOpen !== null}
                  onDismiss={() => setMessageOpen(null)}
                  disableBackdropDismiss={busy}
                  onClosed={() => {
                    const intent = messageIntentRef.current
                    messageIntentRef.current = null
                    if (intent === 'cancel') setCancelConfirmOpen(true)
                    else if (intent === 'buy') { tap(); setBuyExtraOpen(true) }
                  }}
                >
                  {(messageOpen === 'page2' || messageOpen === 'approve') && page2PendingInvite ? (
                    <ReplyingInviteCard
                      title={tg('home.replyingTitle', page2PendingInvite.is_male)}
                      // Not gendered any more: the sentence says what approving
                      // DOES and what it COSTS, and neither half is about either
                      // person.
                      description={t('home.replyingDesc')}
                      acceptLabel={t('home.replyingAccept')}
                      // THE ROUND BUTTON'S ROUTE OFFERS ONE ANSWER ONLY (user
                      // directive 2026-08-01): the user reached for the chat, so
                      // that popup is the approval and what it costs — not a
                      // question with two sides, and "certainly no skip button".
                      // The heading chip's route is the card's MESSAGE and keeps
                      // the decline, which is also what the drag and hardware
                      // back raise.
                      declineLabel={messageOpen === 'page2' ? t('home.watchingReject') : undefined}
                      costCredits={CREDIT_COST.approve}
                      // The DEPOSIT counts here and nowhere else (see
                      // creditsForApprove): the server pays an accept out of it
                      // when the wallet cannot, so a card that measured this
                      // button against balance + extra alone sent the one user it
                      // was written for — someone waiting on an invitation of his
                      // own, with his only credit riding it — to a buy popup
                      // instead of to the chat.
                      affordable={approveFunds >= CREDIT_COST.approve}
                      onAccept={() => runAction('app/approve', 'replying-accept')}
                      onDecline={messageOpen === 'page2' ? () => { setMessageOpen(null); openRefuseConfirm() } : undefined}
                      onUnaffordable={() => { messageIntentRef.current = 'buy'; setMessageOpen(null) }}
                      busy={busy}
                      acceptLoading={busy && pendingKey === 'replying-accept'}
                      inPopup
                    />
                  ) : messageOpen === 'page1' && displayedCardMode === 'waiting' ? (
                    <CardMessage
                      title={tg('home.waitingTimerTitle', matchIsMale)}
                      description={tgg('home.waitingTimerDesc', isMale, matchIsMale)}
                      label={t('home.cancelWaitingBtn')}
                      icon={<CloseIcon color={WHITE} />}
                      // Cancelling forfeits the held credit, so it keeps its own
                      // named question — the popup states what is happening, the
                      // confirm asks whether to end it.
                      onPress={() => { messageIntentRef.current = 'cancel'; setMessageOpen(null) }}
                    />
                  ) : messageOpen === 'page1' ? (
                    <CardMessage
                      title={page1MessageTitle}
                      description={page1MessageDesc}
                      label={t('home.endedBack')}
                      busy={busy && pendingKey === 'ended-stop'}
                      onPress={() => { setMessageOpen(null); page1Back() }}
                    />
                  ) : messageOpen === 'page2' ? (
                    <CardMessage
                      title={page2MessageTitle}
                      description={page2MessageDesc}
                      label={t('home.endedBack')}
                      busy={busy && pendingKey === 'free2'}
                      onPress={() => { setMessageOpen(null); page2Back() }}
                    />
                  ) : null}
                </BottomSheet>

                {/* Invite prompt popup — raised by the hero heart in the
                    watching state (moved off the MatchCard footer 2026-07-25).
                    Same ReplyingInviteCard body as the page2 incoming side.
                    Follow-up actions that open ANOTHER Modal (build-profile
                    gate, buy-extra picker) or ride the card off (skip) run from
                    onClosed, after this sheet is gone, so no two Modals race. */}
                <BottomSheet
                  visible={invitePopupVisible}
                  onDismiss={() => setInvitePopupOpen(false)}
                  disableBackdropDismiss={busy}
                  onClosed={() => {
                    const intent = invitePopupIntentRef.current
                    invitePopupIntentRef.current = null
                    if (intent === 'build') { tap(); setBuildProfileOpen(true) }
                    else if (intent === 'buy') { tap(); setBuyExtraOpen(true) }
                  }}
                >
                  <ReplyingInviteCard
                    title={tgg('home.inviteConfirmTitle' as any, isMale, matchIsMale).replace(/\{name\}/g, matchName)}
                    description={inviteConfirmDesc.replace(/\{name\}/g, matchName)}
                    acceptLabel={t('home.inviteConfirmOk')}
                    // Sending an invite costs 1 heart, held server-side until the
                    // invite ends; the heart returns on every non-cancel exit,
                    // cancel forfeits it.
                    costCredits={CREDIT_COST.invite}
                    affordable={starsBalance >= CREDIT_COST.invite}
                    // A not-yet-built profile cannot send: close the popup and
                    // open the build-profile gate. Same rule the server enforces
                    // (profileComplete), so a bypass is rejected there too.
                    onAccept={() => {
                      if (!profileBuilt) { invitePopupIntentRef.current = 'build'; setInvitePopupOpen(false); return }
                      // Keep the popup up showing the accept spinner; Realtime
                      // flips state → 'waiting', which slides it away.
                      runAction('app/invite', 'invite-confirm')
                    }}
                    // Tap-while-unaffordable closes the popup and opens the
                    // buy-extra picker (chained through onClosed to avoid a
                    // double-Modal). The button stays a normal white CTA so the
                    // user reads it as actionable (user request 2026-06-01).
                    onUnaffordable={() => { invitePopupIntentRef.current = 'buy'; setInvitePopupOpen(false) }}
                    // No Skip button here (user directive 2026-07-25): the popup
                    // is dismissed by swiping the sheet down, and a person is
                    // skipped by the page1 pull gesture instead.
                    busy={busy}
                    acceptLoading={busy && pendingKey === 'invite-confirm'}
                    // This one lives in a BottomSheet, and a popup is white.
                    inPopup
                  />
                </BottomSheet>

                {/* Neither line is genderized any more: since both name the
                    PHOTOS instead of telling the user to go and build something
                    (2026-08-01), neither is in the imperative and neither
                    carries a {m|f} marker. */}
                <BuildProfileGate
                  visible={buildProfileOpen}
                  title={t('home.buildProfileTitle')}
                  description={t('home.buildProfileDesc')}
                  onClose={() => setBuildProfileOpen(false)}
                />

                {/* The browse allowance has NO popup (user directive
                    2026-08-01): the centre circle goes straight to the photo
                    step. See centerNotice. */}

                {/* The Communities members-only gate, raised by the dock's faded
                    circles key and by the routed entries above (push tap /
                    redeemed invite link). Same popup as the two other shut
                    doors, only the sentence differs: the one button is the photo
                    flow, so what says what is missing is also what fixes it.
                    Not genderized either, for the reason above. */}
                <BuildProfileGate
                  visible={commGateOpen}
                  title={t('communities.gateTitle')}
                  description={t('communities.gateDesc')}
                  onClose={() => setCommGateOpen(false)}
                />

                <ConfirmDialog
                  visible={cancelConfirmOpen}
                  title={t('home.cancelWaitingTitle')}
                  description={tgg('home.cancelWaitingDesc', isMale, matchIsMale)}
                  confirmLabel={t('home.cancelWaitingConfirm')}
                  confirmIconStart={<CloseIcon color={WHITE} />}
                  onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                  onConfirm={runCancel}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={refuseConfirmOpen}
                  title={t('home.refuseReplyTitle')}
                  description={tg('home.refuseReplyDesc', page2InviteObj?.is_male ?? null)}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  confirmIconStart={<CloseIcon color={WHITE} />}
                  onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                  onConfirm={() => runAction('app/decline', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
                  busy={busy}
                />

                {/* The permission ConfirmDialog popup was removed: the
                    missing-permission / gate UI now lives inline as the home
                    pane's centerNotice (HeadlineArea text + the round center
                    icon-as-action-button), and is mirrored on page2. See
                    `centerNotice` and `noticeOverridesCard`. */}

                {/* Ending the chat — opened by "End chat" on the card's heading
                    chip (2026-07-26; it used to live in the chat sheet header).
                    ONE popup, saying what it is and what ending a chat does, and
                    the two answers ACT (user directive 2026-08-02): each of these
                    used to hand over to a ConfirmDialog that asked the identical
                    question a second time, and a popup raised by a named action
                    has nothing further to ask — what it owes the user is what the
                    action DOES, which is what the title and the sentence are for.
                    So this is the ordinary popup now (title + desc + the app's
                    popup foot), not the `flush` row of nothing but buttons.
                    SheetActionPair, 2026-07-31: leaving is what the user came for,
                    so it is the purple and it ENDS the row; blocking is the
                    drastic, rarely-wanted one, so it is a bare mark on no ground
                    at all, passed on the way past. Report is a card-level
                    affordance, not here. */}
                <BottomSheet
                  visible={chatMenuOpen}
                  onDismiss={() => { if (!busy) closeChatMenu() }}
                  disableBackdropDismiss={busy}
                >
                  <SheetTitle>{t('home.leaveTitle')}</SheetTitle>
                  <SheetDesc>{t('home.leaveDesc')}</SheetDesc>
                  <SheetActionPair
                    options={[{
                      key: 'block',
                      label: t('chat.block'),
                      icon: <BlockIcon color={INK} size={ICON.xxl} />,
                      // In flight: a spinner in the glyph's own place, which is
                      // the strip's way of saying it everywhere. The LOCKOUT
                      // while the other answer is running is runAction's own
                      // `busy` guard and nothing else — `disabled` here would
                      // fade this option for the frames the leave takes, and a
                      // sibling greying out is a flicker, not information (the
                      // same reason the button beside it takes silentDisabled).
                      busy: busy && pendingKey === 'block',
                      onPress: () => runAction('app/block', 'block', closeChatMenu),
                    }]}
                    action={
                      <Button
                        label={t('chat.leave')}
                        iconStart={<SignOutIcon color={WHITE} />}
                        loading={busy && pendingKey === 'leave'}
                        disabled={busy}
                        silentDisabled={pendingKey !== 'leave'}
                        onPress={() => runAction('app/leave', 'leave', closeChatMenu)}
                      />
                    }
                  />
                </BottomSheet>
                {/* One shared report confirm for every match-card surface
                    (page1 + page2). The reported user id is whatever card's
                    flag was tapped; the server detects the relation surface
                    and tears it down + permanent-blocks the pair. */}
                <ConfirmDialog
                  visible={!!reportTargetId}
                  // Solid white shield at the sibling buttons' glyph size
                  // (ICON.md, like the block/sign-out/close confirm icons):
                  // an outline shield read lighter than the solid one just
                  // tapped on the card, and the xxl default overpowered the
                  // label beside it.
                  title={t('chat.reportTitle')}
                  noteInput={{
                    value: reportNote,
                    onChangeText: setReportNote,
                    placeholder: t('chat.reportPlaceholder'),
                  }}
                  confirmLabel={t('chat.reportConfirm')}
                  confirmIconStart={<ShieldIcon color={WHITE} fill={WHITE} />}
                  onCancel={() => { if (!busy) { setReportTargetId(null); setReportNote('') } }}
                  onConfirm={() => {
                    const pid = reportTargetId
                    const closeReport = () => { setReportTargetId(null); setReportNote('') }
                    if (!pid) { closeReport(); return }
                    const note = reportNote.trim()
                    runAction('app/report', 'report', closeReport, {
                      user_id: pid,
                      reason: 'profile',
                      note: note || undefined,
                    })
                  }}
                  busy={busy && pendingKey === 'report'}
                />

                {/* Everything we share, opened by tapping a card's circle chip.
                    Same single-instance pattern as the report dialog above: one
                    popup reused across every match card. A tapped group row
                    opens the app's one GroupSheet from inside the popup; a
                    tapped person opens THAT PERSON'S PAGE and nothing else
                    (user directive 2026-07-29) — no My-Friends roster under it,
                    since the row is one name on a card, not a way into the
                    friends list. The row's own item is handed over whole, so
                    the page opens painted with no lookup. Nothing closes the
                    popup here: the sheet rising over it is what hides it, and
                    the sheet going away is what brings it back. */}
                <SharedCirclesPopup
                  {...circles.props}
                  onSelectFriend={f => {
                    setCommunitiesTarget({ kind: 'person', friend: f })
                    openCommunities()
                  }}
                />

              </View>

              {/* The floating menu button is GONE (user directive 2026-07-30),
                  and so is the menu it opened. Everything it held is the dock at
                  the foot of the page, including the notification dot it used to
                  carry — which rides the Circles entry, the one that actually
                  leads to the queue it counts. Home's top-START corner belongs to
                  nothing: do not put a control back there. */}
            </View>

        {/* ── Overlays, painted low → high ────────────────────────────────
            Each is an OverlaySheet: rises from the bottom, closes on a
            swipe down (the same gesture as page1's pull-to-skip) or its X.
            These are the surfaces the user OPENS, which is why they are out
            here and take the whole screen. The page2 invite card is NOT one
            of them any more — it is a profile the GAME hands the user, so it
            rises inside page1 with the page1 card (user directive
            2026-07-30); see the OverlaySheet in the page1 box above. */}

        {/* Chat. dragFrom='header' is REQUIRED: the message list is an
            inverted FlatList, so "scroll is at the top" is meaningless and
            without this every drag in the list would be stolen by the
            dismiss pan. ChatPage refines that via the sheetBody it receives
            below: it reports "at top" only while the list has nothing to
            scroll into (empty / short chat), so a body swipe-down then closes
            the sheet too, not only the header. The 3-dot menu opens the
            leave/block sheet, which stays in this file with runAction — see
            the sheet below.

            Rendered for the WHOLE lifetime of the chat state (`chatAvailable`),
            not just while open, and `keepMounted` so closing the sheet PARKS
            ChatPage off-screen instead of unmounting it. That keeps its loaded
            history, realtime + presence channels and cached messages alive, so
            reopening is instant with no reload — a close/reopen no longer
            remounts the component. When the chat actually ends, `chatAvailable`
            flips false, this whole sheet leaves the tree, and ChatPage is torn
            down for real (channels removed, timers cleared). */}
        {chatAvailable ? (
        <OverlaySheet
          open={chatOpen}
          onClose={() => closeOverlay('chat')}
          dragFrom="header"
          isTop={!profileSheetOpen && !communitiesSheetOpen}
          keepMounted
          zIndex={OVERLAY.z.chat}
          // No title bar and, since 2026-07-31, NO CLOSE X either (user
          // directive): the partner's name already rides every bubble and the
          // "End Chat" chip lives on the home card behind this sheet
          // (2026-07-26), so the button over the messages said nothing the
          // conversation did not already say. The header ROW stays — with
          // `dragFrom="header"` it is this sheet's drag band, and dragging that
          // strip is how a chat scrolled to the middle of its history has always
          // been put away.
          floatingHeader
          showClose={false}
        >
          {(sheetBody) => (
          <ChatPage
            key={profile?.relations?.match?.user_id ?? 'no-match'}
            isActive={chatOpen && !profileSheetOpen && !communitiesSheetOpen}
            onUnreadChange={setChatUnread}
            onOnlineChange={setPartnerOnline}
            // No top inset at all: the message list starts at the very top edge
            // of the screen and scrolls UNDER the OS status bar and the floating
            // close X (user directive 2026-07-26). The list keeps its small
            // content padding so the oldest message still has a hair of breathing
            // room at the top.
            topInset={0}
            autoFocusInput={chatJustStarted}
            // Lets a body swipe-down dismiss the sheet when the message list
            // can't scroll the drag (empty/fits, or scrolled to the oldest end);
            // a mid-conversation drag keeps scrolling history. See ChatPage's
            // syncScrollability.
            sheetBody={sheetBody}
          />
          )}
        </OverlaySheet>
        ) : null}

        {/* (The MENU drawer stood here. It, the page it carried and the button
            that opened it are deleted — user directive 2026-07-30. Everything it
            held is home's dock and the two popups the dock raises, so nothing
            about the app is reachable only from a drawer any more.) */}

        {/* Profile preview, opened from the dock's first entry — swiping it down
            returns to home.
            CHROMELESS: NO close X (user directive 2026-07-31, the same day every
            Circles page lost its own). The body is a full-bleed card of my own
            photos, and the one mark over it — the heading tile's plus — is
            something to DO, not a way out; a dismiss floating beside it made the
            corner read as two unrelated marks. The swipe is how it leaves, as it
            already was for anyone who had ever put it away by dragging. */}
        <OverlaySheet
          open={profileSheetOpen}
          // Its body is a full-bleed MatchCard that owns a PullContext (via
          // PreviewFieldPage), exactly like the invite sheet — so it takes the
          // same 'scrollPan' activation. The default 'sheet' mode uses a
          // manualActivation Pan that consumes the raw touch stream and swallows
          // the taps on the card's own controls (that was the "the button doesn't
          // work" bug).
          activation="scrollPan"
          onClose={closeProfileSheet}
          chromeless
          zIndex={OVERLAY.z.subPage}
          cardStyle={styles.overlayCardBare}
        >
          {ctx => (
            <PreviewFieldPage
              clipBottom
              {...ctx}
            />
          )}
        </OverlaySheet>

        {/* Communities hub, stacked ON TOP of the menu it was opened from —
            swiping down closes it back to the menu. It owns an internal view
            stack (hub -> friends / a group / create / find); the header shows a
            back arrow while there's somewhere to go, and hardware-back pops that
            internal stack via communitiesBackRef before the sheet closes. */}
        <OverlaySheet
          open={communitiesSheetOpen}
          onClose={closeCommunities}
          chromeless
          zIndex={OVERLAY.z.subPage}
        >
          {ctx => (
            <CommunitiesPage
              onClose={closeCommunities}
              onRegisterBack={fn => { communitiesBackRef.current = fn }}
              target={communitiesTarget}
              onTargetConsumed={() => setCommunitiesTarget(null)}
              {...ctx}
            />
          )}
        </OverlaySheet>

        {/* The dock's two settings keys. Popups, not sheets: each is a short
            list of rows the user reads and closes, where the profile and
            Circles keys open surfaces you stay in. They render out here beside
            the shell's other popups rather than inside the dock, because the
            dock is a row of buttons and nothing else — it never owns what it
            opens. */}
        <PreferencesPopup
          visible={prefsPopupOpen}
          onDismiss={() => setPrefsPopupOpen(false)}
        />
        <AppSettingsPopup
          visible={appSettingsPopupOpen}
          onDismiss={() => setAppSettingsPopupOpen(false)}
        />

        <BuyExtraPopup
          visible={buyExtraOpen}
          onDismiss={() => setBuyExtraOpen(false)}
          // On home the sheet only ever opens from an unaffordable action
          // (onUnaffordable), so it always speaks as the paywall.
          outOfCredits
        />
      </View>
    </View>
  )
}
const styles = StyleSheet.create({
  // Outer, always-opaque backdrop behind the shell.
  backdrop: {
    flex: 1,
    backgroundColor: PAGE,
  },
  bootFill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: PAGE,
  },
  // The invite sheet's body is a full-bleed MatchCard that paints its own
  // background, so the sheet card underneath carries no fill or lift of its
  // own — otherwise its shadow would sit over the photo.
  overlayCardBare: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  root: {
    flex: 1,
    backgroundColor: PAGE,
  },
  // page1's box: everything above the dock. It CLIPS, which is what keeps a
  // pulled card off the strip — see the note at the call site.
  page1: {
    flex: 1,
    overflow: 'hidden',
  },

  // Hidden MatchCard used to drive expo-image's onLoad before promoting the
  // match into the visible slot. Same dimensions as the visible card so the
  // images decode at full size; opacity 0 keeps it invisible.
  preloaderWrap: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  // Outer Animated.View — fills the pane so the photo can flex to take all
  // remaining space above the buttons row.
  matchCardWrap: {
    flex: 1,
  },
  matchPhoto: {
    flex: 1,
    backgroundColor: PAGE,
    overflow: 'hidden',
  },
  // ── Permission screen (no card) ────────────────────────────────────────
  permScreen: {
    flex: 1,
  },
  // THE CIRCLE, standing on the band's MIDDLE line (user directive 2026-07-30).
  // `top` is that line as a share of the band and the negative `marginTop` is
  // half a ring, which is what puts the circle's CENTRE on it rather than its
  // top edge. Both are layout, so the button's touch target moves with it — a
  // transform would have shifted only the paint.
  //
  // A percentage rather than two flex spacers, so the ONE constant all three
  // bands read (CIRCLE_CENTER) is the only thing deciding the line: spacers split
  // the space AROUND the circle, which lands it half a ring off the moment the
  // fraction is anything but dead centre.
  permCenterGroup: {
    position: 'absolute',
    top: pct(CIRCLE_CENTER),
    start: 0,
    end: 0,
    marginTop: -DOTTED_RING_SIZE / 2,
    alignItems: 'center',
  },
  // The band the circle is centred in: from where the topbar ends down to the
  // top of the dock — the whole of page1, which is exactly what this pane is.
  //
  // Both edges are the layout's, not a measurement. The top is `marginTop:
  // topInset`, passed inline: the app draws edge-to-edge, so that IS where the
  // topbar ends. The bottom is the pane's own, and the pane stops at the dock
  // because the dock is a flow sibling BELOW page1 (see `page1` in this file).
  permBand: {
    flex: 1,
  },
  // The headline is centred in what is left ABOVE the circle, and the drawing in
  // what is left BELOW it — one band each, mirrored on the same middle line.
  // Their inner edge is the circle's own: the middle line, plus the
  // DOTTED_RING_SIZE / 2 that separates that line from the edge. The RING, not
  // the purple disc: the halo is part of the button the eye sees, and stopping at
  // the disc would run the text (or the drawing) into it.
  //
  // No gap constant anywhere in here. The distance from the headline to the
  // circle, and from the circle to the art, is whatever centring leaves — which
  // is the point of the directive: each is centred in a band, never stacked with
  // a spacer between them.
  permHeadlineBand: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: pct(1 - CIRCLE_CENTER),
    marginBottom: DOTTED_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permArtBand: {
    position: 'absolute',
    top: pct(CIRCLE_CENTER),
    start: 0,
    end: 0,
    bottom: 0,
    marginTop: DOTTED_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permAvatarWrap: {
    width: DOTTED_RING_SIZE,
    height: DOTTED_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: STROKE.base,
    borderColor: WHITE,
    backgroundColor: PAGE,
    // overflow:hidden forces Android (New Arch/Fabric) to clip to the true
    // rounded outline. Without it, borderRadius (=size/2) + borderWidth +
    // elevation makes the border-path tessellation chamfer the corners and
    // the circle renders as an octagon. Also clips the avatar Image variant
    // to the circle. Native elevation shadow is unaffected (drawn from the
    // view outline by the parent, not a clipped child).
    overflow: 'hidden',
    // Deeper than the chrome buttons' soft LIFT_SHADOW on purpose: this is the
    // one thing on the page that must read as pressable, and it earns that by
    // sitting HIGHER above the page than anything else, not by being bigger or
    // by moving (user directive 2026-07-28 — size and motion were both tried
    // and rejected; the lift is the whole of it).
    shadowColor: SHADOW_BLACK,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  // The centre action surface is a SOLID INK disc carrying a WHITE glyph —
  // the same arrangement as the primary Button, so the one big tap target on
  // home reads as the app's main action. Every variation of it (play, pause,
  // hamburger, spinner, and the gate notices) shares this fill, so the glyphs
  // inside are all WHITE.
  permPlayButton: {
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Edge-to-edge avatar inside permAvatar (which clips with overflow:'hidden'
  // to the rounded outline). Used by the gated centerNotice variants
  // (geo/group/not_yet) to show the user's own profile photo as the central
  // action surface. No background — the image covers the full circle.
  permAvatarImage: {
    width: '100%',
    height: '100%',
  },
  // The filled centre circle behind a GLYPH (rather than behind a face): the
  // notice circle with no avatar, and the no-candidate state's search mark. Named
  // for that role, not for whichever glyph is standing in it today.
  permGlyphCircle: {
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingActions: {
    gap: MD,
  },
})
