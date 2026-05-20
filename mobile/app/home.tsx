import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { View, StyleSheet, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, I18nManager, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, useAnimatedReaction, withTiming, withRepeat, withSequence, withDelay, cancelAnimation, Easing, runOnJS, LinearTransition, LayoutAnimationConfig, SlideInDown, FadeIn, FadeOut, FadeInUp, FadeOutUp, interpolate, interpolateColor, useEvent, useHandler, type SharedValue } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'

// PagerView wrapped for Reanimated so onPageScroll events can be handled in a
// worklet (UI thread) rather than crossing the JS bridge each frame. The JS
// callback path noticeably lags the swipe, leaving the TabStrip indicator
// behind the gesture.
const AnimatedPagerView = Animated.createAnimatedComponent(PagerView)

function usePagerScrollHandler(
  handlers: { onPageScroll: (e: { position: number; offset: number }) => void },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { context, doDependenciesDiffer } = useHandler(handlers as any)
  return useEvent(
    (event: unknown) => {
      'worklet'
      void context
      const e = event as { eventName: string; position: number; offset: number }
      const { onPageScroll } = handlers
      if (onPageScroll && e.eventName.endsWith('onPageScroll')) {
        onPageScroll(e)
      }
    },
    ['onPageScroll'],
    doDependenciesDiffer,
  ) as unknown as (e: { nativeEvent: { position: number; offset: number } }) => void
}
import { Text } from '../src/components/AppText'
const AnimatedText = Animated.createAnimatedComponent(Text)
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import { invoke, markStartupComplete, publicImageUrl, API_TIMEOUT_MS } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { nameFromTitle } from '../src/lib/profileTitle'
import { useUserStore, resolveLocationType, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, genderize, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, clearInitialNotification, openNotifSettings, dismissAllNotifications, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { BLACK, WHITE, WHITE_SOFT, WHITE_MID, WHITE_STRONG, PRIMARY, PRIMARY_BG, PRIMARY_LIGHT, BLACK_STRONG, BLACK_MID, PREMIUM, BLACK_SOFT, HEADER_PILL_SHADOW, POSITIVE, NEGATIVE, ILLUSTRATION_WASH, ILLUSTRATION_CLOUD, ILLUSTRATION_BODY, ILLUSTRATION_LINE, ILLUSTRATION_STRUCT, ILLUSTRATION_ACCENT } from '../src/colors'
import { XS, SM, MD, LG, XL, RADIUS, RADII, WEIGHT, TEXT, ICON, TAB, MOTION, SEARCH_WATCHDOG_SLACK_MS, PULL_COMMIT_FRACTION, SWIPE_DISMISS_VELOCITY, lh } from '../src/tokens'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BottomSheet } from '../src/components/BottomSheet'
import { MatchCard } from '../src/components/MatchCard'
import { RisingCard } from '../src/components/RisingCard'
import { TabStrip, type TabSpec } from '../src/components/TabStrip'
import { CreditCost } from '../src/components/CreditCost'
import { CREDIT_COST, creditBalance, starsText } from '../src/lib/credits'
import { PullScrollView, PullContext, type PullCtx } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SubPageConfig, PreviewFieldPage } from './settings'
import ChatPage from './chat'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'
import { useSelfAvatar, setSelfAvatarFromLocal, setSelfAvatarFromRemote } from '../src/lib/selfAvatar'
import { FONT_SCALE } from '../src/fonts'
import { SEEN_FLAGS } from '../src/keys'
import { hasSeenFlag, markSeenFlag } from '../src/lib/seenFlags'
import { HamburgerIcon, CloseBoldIcon, PauseIcon, MegaphoneIcon, EyeOffIcon, EyeOpenIcon, ChatIcon, ChevronDownIcon, MapPinIcon, BellIcon, WifiOffIcon, SignOutIcon, ShieldIcon, BlockIcon, StarIcon, MailIcon, InboxIcon } from '../src/components/icons'
import { exitBroadcastConfirm, hideProfileConfirm } from '../src/components/visibilityConfirms'
import { useGameMode } from '../src/hooks/useGameMode'
import type { CardAction, MatchCardHandle } from '../src/components/MatchCard'
import { AppStatusBar } from '../src/components/AppStatusBar'


// ── Avatar rings: static halo + radar pulse ───────────────────────────────

const AVATAR_SIZE = 130
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
        borderWidth: 2,
        borderColor: WHITE,
      }, style]}
    />
  )
}
// (RadarRing borderColor set to WHITE below so the pulse reads on the
// deep-wine PRIMARY page — PRIMARY-on-PRIMARY was invisible.)

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

function AvatarHaloRings() {
  return (
    <>
      <View pointerEvents="none" style={{
        position: 'absolute',
        width: HALO_SIZE,
        height: HALO_SIZE,
        borderRadius: HALO_SIZE / 2,
        backgroundColor: WHITE_SOFT,
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
          stroke={WHITE}
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
// Horizontal padding applied on each side of the label so text never
// reaches the screen edges. The SVG is sized to (window - 2 × HPAD).
const SKIP_HINT_HPAD = MD * 2
// Vertical advance for each wrapped line beyond the first. Combined with
// SKIP_HINT_HEIGHT, defines the fixed area that wraps the label so the
// avatar below stays at the same position whether the text is 1 line or 2.
const SKIP_HINT_LINE_H = 30
const SKIP_HINT_AREA_H = SKIP_HINT_HEIGHT + SKIP_HINT_LINE_H
// Estimated rest-state pixel width per character at SKIP_HINT_FONT extrabold,
// used to decide whether a string needs wrapping. Conservative enough that
// every string we ship today either fits as 1 line or wraps cleanly to 2.
const SKIP_HINT_PER_CHAR_W = SKIP_HINT_FONT * 0.65 + 2

// Ready-to-find headline pool: the i18n block split into lines (trimmed,
// blanks dropped, so adding/removing a sentence in i18n is the only edit
// needed). `pickReadyHeadline(prev)` returns a random index that differs
// from `prev` when possible, so re-entering the ready state never repeats
// the sentence it just showed.
const READY_HEADLINES = t('home.readyHeadlines').split('\n').map(s => s.trim()).filter(Boolean)
function pickReadyHeadline(prev: number): number {
  if (READY_HEADLINES.length < 2) return 0
  let next = prev
  while (next === prev) next = Math.floor(Math.random() * READY_HEADLINES.length)
  return next
}

// Splits a string into two lines at the space closest to its character
// midpoint. Empty array if there is no space — caller falls back to
// glyph-compression via textLength on a single line.
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

// "לא עכשיו" label revealed behind the match card during a pull-to-skip
// gesture. The fill uses a tonal vertical gradient — fully opaque solid
// grays that shift from dark at the top to lighter at the bottom. Because
// both stops are 100% opaque, every letterform stays crisp at every point
// of its outline (the previous opacity-fade gradient was breaking the
// bottoms of letters into a ghosted look). The gradient still creates a
// subtle "printed into the page" depth without compromising legibility.
function SkipHintLabel({ text }: { text: string }) {
  const w = Dimensions.get('window').width - SKIP_HINT_HPAD * 2
  // Strings whose estimated natural width exceeds the padded area get
  // wrapped to 2 lines at the space nearest the midpoint. If a wrapped
  // line is *still* too long for the pad, that single line falls back to
  // textLength/lengthAdjust glyph-compression.
  const naturalW = text.length * SKIP_HINT_PER_CHAR_W
  const lines = naturalW > w ? splitAtMidSpace(text) : [text]
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
          <Stop offset="0" stopColor={WHITE} stopOpacity={1} />
          <Stop offset="1" stopColor={WHITE_STRONG} stopOpacity={1} />
        </SvgLinearGradient>
      </Defs>
      {lines.map((line, i) => {
        const lineNaturalW = line.length * SKIP_HINT_PER_CHAR_W
        const fit = lineNaturalW > w
        const y = bottomBaseline - (lines.length - 1 - i) * SKIP_HINT_LINE_H
        return (
          <SvgText
            key={i}
            x={w / 2}
            y={y}
            fill="url(#skipHintFade)"
            fontSize={SKIP_HINT_FONT}
            fontWeight={WEIGHT.extrabold}
            textAnchor="middle"
            letterSpacing={2}
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

// Reserves a fixed 2-line height with top-aligned content around the
// gradient headline. The first line baseline sits at the same y inside
// the SVG regardless of line count (see SkipHintLabel), so anchoring the
// SVG to the top of this fixed-height area keeps the text's first line
// at the same screen position whether the headline is 1 or 2 lines.
// The avatar below stays at exactly the same screen position because the
// area itself is a constant height.
function HeadlineArea({ text }: { text: string }) {
  return (
    <View style={headlineAreaStyle.area}>
      <SkipHintLabel text={text} />
    </View>
  )
}

const headlineAreaStyle = StyleSheet.create({
  area: {
    height: SKIP_HINT_AREA_H,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
})

// ── PullPane ─────────────────────────────────────────────────────────────
//
// The single framed element shared by all three pull-to-dismiss surfaces:
// page1 (pull-to-skip), page2 (pull-to-decline) and the settings profile
// preview sheet (swipe-down-to-dismiss). It composes, in one place:
//   • the solid-PRIMARY "wake" that fills TabStrip → card-top, with a
//     "לא עכשיו" headline centred in the wake itself that scales 0 → full;
//   • the GestureDetector + a card wrapper that translates down by `pullY`;
//   • an optional PullContext.Provider (page1/page2 need it so the card's
//     inner scroll can coordinate with the pull; the sheet doesn't);
//   • an optional non-translated `extra` slot (page1's hidden preloader).
//
// Wake = a top-anchored block, sibling of (and behind) the card, whose
// HEIGHT is animated to the live `pullY`. The card translates down by the
// same `pullY`, so the wake's bottom edge is always exactly the card top —
// the PRIMARY band length is dynamic with the card-top position. The
// headline is centred IN that band (`justifyContent:'center'`); the wake's
// `overflow:'hidden'` keeps it from spilling above while the band is short,
// and its scale tracks pull depth (grows like the login "Once").
//
// Wake OPACITY is driven by `pulling`: visible while the finger is actively
// pulling, and it FADES OUT the moment the pull ends — whether the card
// snaps back or commits and slides off-screen. Without this fade the block
// stays full-height behind the departed card and covers the page underneath
// (Settings / empty pane). The fade is exactly what reveals that page on
// dismiss; the card's own SlideOutDown carries it down at the same time.
//
// The inner RisingCard passed as `children` keeps owning its SlideIn/SlideOut
// mount motion — the pull transform sits on a separate wrapper so the two
// never clobber the same useAnimatedStyle target.
function PullPane({
  gesture,
  pullY,
  pulling,
  topAnchor,
  style,
  pointerEvents,
  cardStyle,
  pullContext,
  wakeLabel,
  tutorialPlaying,
  behind,
  extra,
  // When true, PullPane does NOT translate `children` by pullY itself — the
  // consumer translates the card it wants to follow the finger (so a swap
  // can keep the incoming card at rest while the outgoing rode off). The
  // wake + gesture still use pullY. page1's local-deck FRONT passes this.
  cardStatic,
  children,
}: {
  gesture: GestureType
  pullY: SharedValue<number>
  pulling: boolean
  topAnchor?: SharedValue<number>
  style?: StyleProp<ViewStyle>
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only'
  cardStyle?: StyleProp<ViewStyle>
  pullContext?: PullCtx
  // Centred headline on the PRIMARY wake (page1/page2 pass "לא עכשיו"). The
  // profile sheet omits it — its wake is plain. No label → no text node.
  wakeLabel?: string
  // When the first-time tutorial is playing, lock input so the user can't
  // fight the choreography (page1 only; others never pass it).
  tutorialPlaying?: boolean
  // Static layer rendered BENEATH the wake and the pull-translated card (NOT
  // pull-translated): the next stack card, pre-mounted at rest. The top card
  // pulls off over the black wake exactly as before; once the wake clears
  // this card is already in place (no rise). page1 only.
  behind?: React.ReactNode
  extra?: React.ReactNode
  cardStatic?: boolean
  children?: React.ReactNode
}) {
  const outerTopStyle = useAnimatedStyle(() => ({
    top: topAnchor ? topAnchor.value : 0,
  }))
  const cardTranslate = useAnimatedStyle(() => ({
    transform: [{ translateY: pullY.value }],
  }))
  // Fade the wake in while pulling, out the instant the pull ends — so on
  // dismiss it doesn't linger over the page revealed behind the card.
  const wakeScreenH = Dimensions.get('window').height
  const commitDist = wakeScreenH * PULL_COMMIT_FRACTION
  // The wake is a FIXED full-screen PRIMARY panel pinned behind the card —
  // NOT a per-frame-resized band. Animating `height` to `pullY` every drag
  // frame forces a Yoga layout pass per frame on this deep tree, which is
  // the mid-drag stutter (building-native-ui: "avoid animating layout
  // properties (width, height) — prefer transforms"). The opaque card is
  // translated down by `pullY` and occludes everything below its top, so
  // only the top `pullY` strip of the full-screen panel is ever visible —
  // exactly the old "band" look — with ZERO per-frame layout.
  //
  // Opacity is ONE position curve over the WHOLE descent, keyed purely on
  // pullY (no time fade, no commit-vs-pull split — user choice "the whole
  // descent together"). The user-specified keyframes over pullY/screenH are
  // [0, ¼, ½, 1] → [100%, 100%, 0%, 0%]: full through the first quarter of
  // the card's travel, fading 100→0 over the second quarter, then 0 for the
  // back half while the card finishes leaving. pullY also drives the card
  // translate, so panel + headline fade exactly in step with the descent.
  //
  // The `pullY ≤ 0 → 0` guard is load-bearing, not cosmetic: in the idle /
  // empty state (no card to occlude it, or slidOut latched after a skip that
  // found nobody and pullY reset to 0) the full-screen panel must be fully
  // transparent or it blacks out the whole empty pane (the reported "no one
  // around → blank screen"). With a card present, pullY leaves 0 the instant
  // the drag starts and the card occludes the thin top strip, so the 0→full
  // step is imperceptible — it reads as "full from the start of the drag".
  // Height IS the live drag (original band model, restored): the wake's
  // bottom edge is exactly the card top (the card translates down by the
  // same pullY), so the headline — laid out by the band's
  // justifyContent:'center' — sits at the band centre (pullY/2) on the Y
  // axis exactly where it always was. (The earlier full-screen-panel +
  // transform restructure shifted the text/pause Y and the panel covered
  // things; reverted at the user's request.) Opacity is the user's single
  // position curve over the whole descent (pullY/screenH keyframes
  // [0,¼,½,1] → [100%,100%,0%,0%]). At rest pullY=0 ⇒ height 0 ⇒ the band
  // is invisible regardless of opacity (no full-screen panel to black out
  // the empty pane); the p≤0→0 opacity is kept as harmless defence.
  const wakeStyle = useAnimatedStyle(() => {
    const p = pullY.value
    const opacity = p <= 0
      ? 0
      : interpolate(
          p,
          [0, wakeScreenH / 4, wakeScreenH / 2, wakeScreenH],
          [1, 1, 0, 0],
          'clamp',
        )
    return { height: Math.max(0, p), opacity }
  })
  // "לא עכשיו" scale-grows 0 → full from rest to the commit point. Its
  // OPACITY is NOT set here — it inherits the wake band's single position
  // curve above (band is its parent; RN group-opacity applies it to the
  // text). Setting opacity here too would multiply the curve by the grow-in
  // factor, which is why the requested curve "didn't happen in practice".
  // Band + headline therefore fade together (white text never lands on
  // white) on exactly the user's [0,¼,½,1]→[100,100,0,0] pullY curve. No
  // translateY: the band's height=pullY + justifyContent:'center' position
  // the headline at the original Y (pullY/2); only scale animates here.
  const wakeTextStyle = useAnimatedStyle(() => {
    const v = Math.max(0, Math.min(1, pullY.value / commitDist))
    return {
      transform: [{ scale: v }],
    }
  })
  const card = (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[pullPaneStyles.card, cardStyle, cardStatic ? undefined : cardTranslate]}
        collapsable={false}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
  return (
    <Animated.View
      // Default outer = absolute fill (page1/page2). The profile sheet
      // passes its own bottom-anchored overlay style. `outerTopStyle`
      // applies the topAnchor offset (0 unless provided).
      style={[style ?? StyleSheet.absoluteFill, outerTopStyle]}
      pointerEvents={pointerEvents}
    >
      {/* Static next-stack card, pinned at rest BELOW the wake + the
          pull-translated card. The top card pulls off over the black wake
          exactly as before; the moment the wake clears this one is already
          in place (no rise). Absolute-fill, non-interactive (the top card
          owns the gesture; this becomes the interactive top after the skip
          response flips the stack). Nothing when no second card / non-page1. */}
      {behind ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">{behind}</View>
      ) : null}
      {/* Solid-PRIMARY wake: a top-anchored band whose HEIGHT is the live
          drag (bottom edge glued to the card top). The headline is centred
          IN the band (justifyContent:'center') so it sits at the original Y
          (pullY/2) and scales 0 → full. Rendered ONLY when a `wakeLabel` is
          given — the profile sheet omits it (its gap just reveals Settings). */}
      {wakeLabel ? (
        <Animated.View style={[pullPaneStyles.wake, wakeStyle]} pointerEvents="none">
          <AnimatedText style={[pullPaneStyles.wakeText, wakeTextStyle]} numberOfLines={1}>
            {wakeLabel}
          </AnimatedText>
        </Animated.View>
      ) : null}
      {pullContext ? (
        <PullContext.Provider value={pullContext}>{card}</PullContext.Provider>
      ) : (
        card
      )}
      {extra}
      {tutorialPlaying && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
      )}
    </Animated.View>
  )
}

const pullPaneStyles = StyleSheet.create({
  card: {
    flex: 1,
  },
  // Top-anchored band; height is animated to the live drag (wakeStyle) so
  // its bottom edge is exactly the card top. Centres the headline in its own
  // (dynamic) band — that is what puts the text at its original Y (pullY/2);
  // overflow:hidden keeps it from spilling above the band while it's short.
  wake: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: PRIMARY,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One token below the login "Once" logotype (TEXT.xxl, was TEXT.xxxl) /
  // extrabold / white. Constant size — the wake label no longer scales down.
  wakeText: {
    fontSize: TEXT.xxl,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
    letterSpacing: -1.4,
    textAlign: 'center',
  },
})

// page1 and page2 each need their OWN PullContext value — the two panes can
// be mounted at once (page2 pending while page1 is watching), and a context
// binds a specific panRef + scrollAtTop shared value + `pulling`, none of
// which are safe to alias across the two GestureDetector trees. They can't
// be one instance, but the *shape* is identical, so the construction lives
// here once instead of being hand-rolled per pane.
function usePullCtx(
  panRef: React.MutableRefObject<GestureType | undefined>,
  scrollAtTopSV: SharedValue<boolean>,
  pulling: boolean,
): PullCtx {
  return useMemo(
    () => ({
      panRef,
      extraRefs: [],
      setScrollAtTop: (v: boolean) => {
        scrollAtTopSV.value = v
      },
      pulling,
    }),
    // panRef / scrollAtTopSV are stable (useRef / useSharedValue); only
    // `pulling` actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pulling],
  )
}

// ── usePullBehavior ──────────────────────────────────────────────────────
//
// THE single source of "pull a card down" behaviour, shared by all three
// surfaces. It owns everything that used to be hand-rolled per screen:
//   • the drag shared value + `pulling` engage/disengage;
//   • the Pan gesture itself — two activation strategies:
//       'scrollPan' = page1/page2 (activeOffsetY + scroll-vs-pull, uses
//                     PullContext so the card's inner scroll locks);
//       'sheet'     = the profile sheet (manualActivation + header-vs-scroll
//                     touch arbitration, no PullContext);
//   • tracking: 'scrollPan' (page1 skip / page2 decline) is 1:1 — the card
//     follows the finger exactly, NO resistance (user: "the card slides
//     directly with the finger"). The only accidental-skip guard is the
//     commit gate: RAW finger travel ≥ commitDistance, NO velocity flick —
//     so a fast swipe that didn't pass half never skips, and a short drag
//     just snaps back. 'sheet' is also 1:1 but KEEPS its flick (the profile
//     preview must dismiss freely);
//   • the commit threshold + what crossing it does, via `commit`:
//       'slideOff'  = ride the card off-screen then onCommit (page1 skip);
//       'snapBack'  = onCommit (a confirm dialog) then spring back (page2);
//       'unmount'   = onCommit unmounts the card, drag retained (sheet);
//     plus an optional velocity flick (sheet);
//   • the snap-back animation when released short of commit;
//   • the first-time tutorial: the peek->hold->return choreography AND its
//     once-ever trigger policy (seenFlags gate + post-mount delay), exposing
//     `tutorialPlaying` so the frame can lock input while it plays.
// Each <PullPane> call site calls this once, so the two simultaneously-
// mountable panes still get independent instances (see usePullCtx).
type PullActivation = 'scrollPan' | 'sheet'
type PullBehavior = {
  gesture: GestureType
  pullY: SharedValue<number>
  pulling: boolean
  pullCtx: PullCtx | undefined
  panRef: React.MutableRefObject<GestureType | undefined>
  setScrollAtTop: (v: boolean) => void
  reset: () => void
  // Programmatic ride-off skip (button parity with the swipe). See usage.
  commit: () => void
  tutorialPlaying: boolean
  // The single commit distance (px) every consumer must share — exposed so
  // e.g. the sheet's TabStrip morph normalizes by the exact same value.
  commitDistance: number
  // True ONLY once a release committed and the card is riding off-screen
  // (set in onEnd, cleared on the next onStart). page1's promote reaction
  // gates on this so a 1:1 drag that passes 95% while the finger is still
  // down can't pop the deck before release — only the committed ride does.
  slidOut: SharedValue<boolean>
}
// Commit motion is UNIFORM for all three surfaces: ride the card off-screen
// then fire onCommit (the only per-screen difference is what onCommit does —
// skip / decline / close). Threshold + flick are object-owned constants
// (PULL_COMMIT_FRACTION, SWIPE_DISMISS_VELOCITY) so no caller can desync.
function usePullBehavior(opts: {
  activation: PullActivation
  enabled: boolean
  onCommit: () => void
  headerBottom?: SharedValue<number>
  tutorial?: { ready: boolean; seenFlag: string }
}): PullBehavior {
  const { activation, enabled, onCommit, headerBottom, tutorial } = opts
  const screenH = Dimensions.get('window').height
  const commitDistance = screenH * PULL_COMMIT_FRACTION

  const pullY = useSharedValue(0)
  const engaged = useSharedValue(false)
  const slidOut = useSharedValue(false)
  const scrollOnly = useSharedValue(false)
  const scrollAtTopSV = useSharedValue(true)
  const swipeStart = useSharedValue({ x: 0, y: 0 })
  // Sheet only: latched true once manualActivation fires, so onTouchesMove
  // stops re-arbitrating (and can't fail/cancel) mid-drag — the pan then
  // tracks the finger continuously instead of snapping back when the inner
  // scroll briefly reports not-at-top.
  const activated = useSharedValue(false)
  const [pulling, setPulling] = useState(false)
  const panRef = useRef<GestureType>(undefined as unknown as GestureType)

  const setScrollAtTop = useCallback((v: boolean) => { scrollAtTopSV.value = v }, [scrollAtTopSV])
  const reset = useCallback(() => { pullY.value = 0 }, [pullY])
  // Programmatic commit — the EXACT ride-off the gesture's onEnd performs
  // once the finger crossed commitDistance, so a BUTTON ("not now") skips
  // with the IDENTICAL motion as a swipe (user: "tapping the skip button
  // must drop the card like a swipe"). slidOut ⇒ the page1 promote reaction
  // fires when the ride reaches the bottom; onCommit runs the skip itself.
  // Guarded: scrollPan only, enabled only, no-op while already sliding.
  const commit = useCallback(() => {
    if (activation !== 'scrollPan' || !enabled || slidOut.value) return
    slidOut.value = true
    pullY.value = withTiming(screenH)
    onCommit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation, enabled, onCommit, screenH])

  // Called unconditionally (rules of hooks); only handed out for scrollPan.
  const ctx = usePullCtx(panRef, scrollAtTopSV, pulling)
  const pullCtx = activation === 'scrollPan' ? ctx : undefined

  // First-time tutorial: choreography + once-ever trigger.
  const [tutorialPlaying, setTutorialPlaying] = useState(false)
  const tutorialTriggeredRef = useRef(false)
  const playTutorial = useCallback(() => {
    // Peek just under commit so the choreography can't trigger a real skip.
    const peek = screenH * 0.45
    setPulling(true)
    const finish = () => { setPulling(false); setTutorialPlaying(false) }
    pullY.value = withSequence(
      withTiming(peek),
      withDelay(1000, withTiming(0, undefined, finished => {
        'worklet'
        if (finished) runOnJS(finish)()
      })),
    )
  }, [pullY, screenH])
  const tutorialReady = tutorial?.ready ?? false
  const tutorialSeenFlag = tutorial?.seenFlag
  useEffect(() => {
    if (!tutorialSeenFlag) return
    if (tutorialTriggeredRef.current) return
    if (!tutorialReady) return
    tutorialTriggeredRef.current = true
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    ;(async () => {
      try {
        if (await hasSeenFlag(tutorialSeenFlag)) return
        if (cancelled) return
        // Persist immediately so it plays once per user, ever.
        await markSeenFlag(tutorialSeenFlag)
        if (cancelled) return
        // Wait out the card's SlideInDown before the demo so they don't fight.
        timer = setTimeout(() => {
          if (cancelled) return
          setTutorialPlaying(true)
          playTutorial()
        }, 500)
      } catch {}
    })()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [tutorialReady, tutorialSeenFlag, playTutorial])

  const gestureEnabled = enabled && !tutorialPlaying

  const gesture = useMemo(() => {
    if (activation === 'sheet') {
      return Gesture.Pan()
        .withRef(panRef)
        .manualActivation(true)
        .onTouchesDown(e => {
          'worklet'
          activated.value = false
          const tch = e.allTouches[0]
          if (tch) swipeStart.value = { x: tch.absoluteX, y: tch.absoluteY }
        })
        .onTouchesMove((e, manager) => {
          'worklet'
          // Once we own the gesture, never re-arbitrate — onUpdate keeps
          // tracking the finger continuously (no mid-drag fail/snap-back
          // when the inner scroll momentarily reports not-at-top).
          if (activated.value) return
          const inHeader = headerBottom ? swipeStart.value.y <= headerBottom.value : false
          if (!scrollAtTopSV.value && !inHeader) { manager.fail(); return }
          const tch = e.allTouches[0]
          if (!tch) return
          const dx = tch.absoluteX - swipeStart.value.x
          const dy = tch.absoluteY - swipeStart.value.y
          if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
          if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8) { activated.value = true; manager.activate(); return }
          manager.fail()
        })
        .onUpdate(e => {
          'worklet'
          const drag = e.translationY
          if (drag <= 0) return
          pullY.value = drag
          if (!engaged.value) { engaged.value = true; runOnJS(setPulling)(true) }
        })
        .onEnd(e => {
          'worklet'
          const past = e.translationY >= commitDistance
          const flick = e.velocityY > SWIPE_DISMISS_VELOCITY
          if (past || flick) {
            // Uniform commit motion: ride off-screen, then onCommit.
            slidOut.value = true
            pullY.value = withTiming(screenH)
            runOnJS(onCommit)()
          } else {
            pullY.value = withTiming(0)
          }
          if (engaged.value) { engaged.value = false; runOnJS(setPulling)(false) }
        })
    }
    // 'scrollPan' — page1 skip / page2 decline.
    return Gesture.Pan()
      .withRef(panRef)
      .enabled(gestureEnabled)
      .activeOffsetY(4)
      .failOffsetX([-25, 25])
      .onStart(() => {
        'worklet'
        pullY.value = 0
        slidOut.value = false
        engaged.value = false
        // Scroll always wins: a gesture that began below the top is
        // committed to scrolling only for its lifetime.
        scrollOnly.value = !scrollAtTopSV.value
      })
      .onUpdate(e => {
        'worklet'
        if (scrollOnly.value) { pullY.value = 0; return }
        const raw = Math.max(0, e.translationY)
        // NO resistance: the card tracks the finger 1:1 (user: "no
        // resistance, the card slides directly with the finger"). The only
        // guard against an accidental skip is the commit GATE in onEnd
        // (finger travel ≥ commitDistance, speed-independent — see there);
        // a short drag moves the card 1:1 but snaps back on release.
        pullY.value = raw
        if (raw > 0 && !engaged.value) { engaged.value = true; runOnJS(setPulling)(true) }
      })
      .onEnd(e => {
        'worklet'
        if (scrollOnly.value) return
        // Commit ONLY when the finger (and thus the 1:1 card) crossed
        // commitDistance (~half screen). Speed-INDEPENDENT: there is NO
        // velocity flick — a fast swipe that didn't pass half never skips
        // (user: "regardless of swipe speed, only if the finger and the
        // card together passed the half"). Released short of half ⇒ the
        // card snaps back (onFinalize).
        if (Math.max(0, e.translationY) >= commitDistance) {
          // Ride off-screen on the UI thread immediately, then fire onCommit
          // right away (NOT deferred until the ride finishes). Deferring it
          // pushed the old card's unmount/SlideOutDown to overlap the next
          // card's mount, which made Reanimated intermittently drop the new
          // card's entering — "a card appears suddenly without a rise". This
          // is the proven, reliable timing; the small fall-motion polish is
          // sacrificed for a card that always animates in.
          slidOut.value = true
          pullY.value = withTiming(screenH)
          runOnJS(onCommit)()
        }
      })
      .onFinalize(() => {
        'worklet'
        if (!slidOut.value) { pullY.value = withTiming(0) }
        if (engaged.value) { engaged.value = false; runOnJS(setPulling)(false) }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation, gestureEnabled, commitDistance, screenH, onCommit, headerBottom])

  return { gesture, pullY, pulling, pullCtx, panRef, setScrollAtTop, reset, commit, tutorialPlaying, commitDistance, slidOut }
}

// Telescope illustration: stars + clouds + a soft telescope on a tripod.
function TelescopeIllustration() {
  const sky = ILLUSTRATION_WASH
  const cloud = ILLUSTRATION_CLOUD
  const tube = ILLUSTRATION_BODY
  const tubeStroke = ILLUSTRATION_LINE
  const accent = ILLUSTRATION_ACCENT
  const tripod = ILLUSTRATION_STRUCT
  return (
    <Svg width={220} height={170} viewBox="0 0 220 170" fill="none">
      {/* sparkles */}
      <Path d="M30 30 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4-4 -4-1.4 4-1.4z" fill={accent} opacity={0.55} />
      <Path d="M188 22 l1.2 3.4 3.4 1.2 -3.4 1.2 -1.2 3.4 -1.2-3.4 -3.4-1.2 3.4-1.2z" fill={accent} opacity={0.45} />
      <Path d="M170 92 l1 3 3 1 -3 1 -1 3 -1-3 -3-1 3-1z" fill={accent} opacity={0.5} />
      <Path d="M40 90 l1 3 3 1 -3 1 -1 3 -1-3 -3-1 3-1z" fill={accent} opacity={0.4} />

      {/* clouds */}
      <Path d="M16 70 q-6 0 -6 6 q0 6 6 6 h22 q6 0 6 -6 q0-6 -6-6 q-2 -6 -8-6 q-7 0 -10 6 z" fill={cloud} opacity={0.85} />
      <Path d="M170 56 q-5 0 -5 5 q0 5 5 5 h22 q6 0 6-5 q0-5 -6-5 q-3-5 -9-5 q-7 0 -13 5 z" fill={cloud} opacity={0.85} />

      {/* tripod */}
      <Path d="M110 110 L92 158" stroke={tripod} strokeWidth={4} strokeLinecap="round" />
      <Path d="M110 110 L128 158" stroke={tripod} strokeWidth={4} strokeLinecap="round" />
      <Path d="M110 110 L110 156" stroke={tripod} strokeWidth={4} strokeLinecap="round" />

      {/* telescope tube — tilted up to the right */}
      <Path d="M64 96 L162 60 L172 78 L74 114 Z" fill={tube} stroke={tubeStroke} strokeWidth={2} strokeLinejoin="round" />
      {/* eyepiece */}
      <Path d="M58 99 L72 91 L74 96 L60 104 Z" fill={tubeStroke} />
      {/* lens accent ring */}
      <Path d="M158 56 L172 53 L176 70 L162 73 Z" fill={accent} opacity={0.35} />
      <Circle cx={167} cy={62} r={6} fill={sky} />

      {/* base mount */}
      <Circle cx={110} cy={110} r={8} fill={tripod} />
    </Svg>
  )
}

// Crescent-moon scene used as the page2 empty illustration when the user is
// hidden (page2.state = locked, no profile, no profiles). Same palette as
// TelescopeIllustration so the page reads as the same surface in a different
// mode, not a different screen — only the metaphor swaps from "scanning" to
// "behind the moon".
function HiddenMoonIllustration() {
  const sky = ILLUSTRATION_WASH
  const cloud = ILLUSTRATION_CLOUD
  const moon = ILLUSTRATION_BODY
  const moonShade = ILLUSTRATION_LINE
  const accent = ILLUSTRATION_ACCENT
  return (
    <Svg width={220} height={170} viewBox="0 0 220 170" fill="none">
      {/* sparkles */}
      <Path d="M30 36 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4-4 -4-1.4 4-1.4z" fill={accent} opacity={0.55} />
      <Path d="M188 26 l1.2 3.4 3.4 1.2 -3.4 1.2 -1.2 3.4 -1.2-3.4 -3.4-1.2 3.4-1.2z" fill={accent} opacity={0.45} />
      <Path d="M172 110 l1 3 3 1 -3 1 -1 3 -1-3 -3-1 3-1z" fill={accent} opacity={0.5} />
      <Path d="M40 116 l1 3 3 1 -3 1 -1 3 -1-3 -3-1 3-1z" fill={accent} opacity={0.4} />
      <Path d="M62 26 l0.9 2.7 2.7 0.9 -2.7 0.9 -0.9 2.7 -0.9-2.7 -2.7-0.9 2.7-0.9z" fill={accent} opacity={0.35} />

      {/* clouds — sit lower, like a bank in front of the moon */}
      <Path d="M14 122 q-6 0 -6 6 q0 6 6 6 h28 q6 0 6 -6 q0-6 -6-6 q-2 -6 -8-6 q-7 0 -10 6 z" fill={cloud} opacity={0.85} />
      <Path d="M152 130 q-5 0 -5 5 q0 5 5 5 h44 q6 0 6-5 q0-5 -6-5 q-3-5 -9-5 q-7 0 -13 5 z" fill={cloud} opacity={0.85} />

      {/* crescent moon — full disc with an offset cutout so the lit side
          bows toward the viewer; suggests "tucked away in shadow" */}
      <Circle cx={110} cy={84} r={42} fill={moon} stroke={moonShade} strokeWidth={2} />
      <Circle cx={126} cy={78} r={36} fill={sky} />
      {/* small crater dots on the lit limb for a touch of texture */}
      <Circle cx={84} cy={92} r={3} fill={moonShade} opacity={0.5} />
      <Circle cx={92} cy={108} r={2} fill={moonShade} opacity={0.45} />
      <Circle cx={78} cy={76} r={2} fill={moonShade} opacity={0.55} />
    </Svg>
  )
}

// ── Message ────────────────────────────────────────────────────────────────
// Centered title + description block. Used as the main content surface for
// every per-state variant of this screen (HIDDEN, WATCHING, WAITING, etc.).

const chatMenuStyles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 0,
    paddingVertical: SM / 2,
  },
  row: {
    paddingVertical: MD,
    paddingHorizontal: MD,
    alignItems: 'center',
  },
  // Icon + label cluster (both rows carry a glyph). Row direction follows
  // RTL, so the glyph leads on the start edge with an SM gap to the label.
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: SM },
  rowPressed: { backgroundColor: BLACK_SOFT },
  label: {
    fontSize: TEXT.md,
    color: BLACK,
    fontWeight: WEIGHT.semibold,
  },
  // End-chat reads at full BLACK; block (the more drastic / irreversible
  // action) steps down to BLACK_STRONG so it reads a touch softer.
  labelMid: { color: BLACK_STRONG },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BLACK_SOFT,
    marginHorizontal: MD,
  },
})


// ── Invite timer ──────────────────────────────────────────────────────────

function useSecsLeft(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : 0
  const [secsLeft, setSecsLeft] = useState(() =>
    target ? Math.max(0, Math.floor((target - Date.now()) / 1000)) : 0
  )
  useEffect(() => {
    if (!target) { setSecsLeft(0); return }
    setSecsLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [target])
  return secsLeft
}

function formatClock(secsLeft: number): string {
  const h = Math.floor(secsLeft / 3600)
  const m = Math.floor((secsLeft % 3600) / 60)
  const s = secsLeft % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── StatusCard scaffold ──────────────────────────────────────────────────
// Visual scaffolding shared by InviteTimerCard (page1 invite timer), EventMessageCard
// (terminal locked-message states) and ViewersStatusCard (Viewers empty-state).
// All three render the same warm card surface with optional title,
// description, and a stack of full-width Buttons below. The live timer for
// invite/cooldown rides inside the primary Button itself (footer slot), so
// no separate clock/bar row lives in this scaffold.

// Smooth layout transition for the card interior. When the description text
// or the button stack grows/shrinks, height changes animate in sync instead
// of snapping.
const STATUS_LAYOUT = LinearTransition

const statusCardStyles = StyleSheet.create({
  container: {
    backgroundColor: PRIMARY,
    paddingVertical: LG,
    paddingHorizontal: MD,
  },
  description: {
    fontSize: TEXT.lg,
    lineHeight: lh(TEXT.lg),
    // No fontWeight: rendered through AppText, so this resolves to the real
    // NotoSansHebrew_400Regular face. Kept slightly dimmed so the full-white
    // ExtraBold heading lead-in clearly carries the emphasis.
    color: WHITE_STRONG,
    textAlign: 'center',
    includeFontPadding: false,
  },
  // The heading is no longer a standalone element. It rides at the start of
  // the description as a period-terminated lead-in on the same line. Through
  // AppText this picks the real NotoSansHebrew_800ExtraBold face (not a weak
  // synthetic bold); full-white vs the body's dimmed white adds a second
  // contrast step so the two ranks read clearly apart.
  lead: {
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
  },
})

// Shared heading+body text for every StatusCard variant (InviteTimerCard /
// EventMessageCard / ViewersStatusCard). One AppText-backed paragraph (real weighted Noto faces, not synthetic): the
// bold heading terminated with a period, a space, then the body — a single
// flowing run so it wraps naturally but never hard-breaks between heading
// and body. The period is only appended when the heading doesn't already
// end in sentence punctuation, so a question-style heading won't read "?.".
function StatusCardText({ title, description }: { title: string; description: string }) {
  const head = title.trim()
  const lead = /[.!?]$/.test(head) ? head : `${head}.`
  return (
    <AnimatedText layout={STATUS_LAYOUT} style={statusCardStyles.description} maxFontSizeMultiplier={FONT_SCALE.heading}>
      <Text style={statusCardStyles.lead}>{lead} </Text>
      {description}
    </AnimatedText>
  )
}

// Page1 "you sent an invitation" timer card. Heading-led body
// (StatusCardText) + a plain full-width cancel button. The live countdown that used to ride inside
// the button's footer now sits under the Once tab label, alongside the
// symmetric page2 incoming-invite clock under the invite tab. Keeping the
// two countdowns in the same chrome row (instead of one in the button and
// one in the tab) means both sides of the invitation read the same way.
function InviteTimerCard({ targetIsMale, userIsMale, onCancel, busy }: { targetIsMale?: boolean | null; userIsMale?: boolean | null; onCancel: () => void; busy?: boolean }) {
  const title = tg('home.waitingTimerTitle', targetIsMale ?? null)
  const description = tgg('home.waitingTimerDesc', userIsMale ?? null, targetIsMale ?? null)

  return (
    <View style={statusCardStyles.container}>
      <StatusCardText title={title} description={description} />
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <Button
          label={t('home.cancelWaitingBtn')}
          variant="onPrimary"
          onPress={onCancel}
          loading={busy}
        />
      </Animated.View>
    </View>
  )
}

// ── EventMessageCard ─────────────────────────────────────────────────────────
// Top-of-card info component for terminal locked-message states (page1 after
// a terminal event, page2 dead invite). Same scaffold as InviteTimerCard —
// heading-led body (StatusCardText) + a single full-width "back to game"
// button. No timer here, so no footer on the button.
function EventMessageCard({ title, description, onContinue, busy }: { title: string; description: string; onContinue: () => void; busy?: boolean }) {
  return (
    <View style={statusCardStyles.container}>
      <StatusCardText title={title} description={description} />
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <Button
          label={t('home.endedBack')}
          variant="onPrimary"
          onPress={onContinue}
          loading={busy}
        />
      </Animated.View>
    </View>
  )
}

// ── ReplyingInviteCard ───────────────────────────────────────────────────
// The shared invitation card for BOTH sides of an invite:
//   - page2 "you received an invitation" (topBlock) — the original use.
//   - page1 "send her an invite?" (footerBlock) — the send prompt that used
//     to be a bespoke title+lead+desc+button block. It is the same info
//     component now: same StatusCard scaffold + spacings, no standalone
//     heading (the title rides as a bold lead-in at the start of the body
//     via StatusCardText), ghost decline + primary accept. The accept CTA
//     carries the CreditCost badge (coin × N) both ways so the two sides of
//     an invitation read as mirror actions and surface what they spend.
// `footerInset` is supplied only by the page1 footer use: the card then
// sits at the bottom of the MatchCard scroll, so its bottom padding must
// clear the home indicator (never below the standard LG).
function ReplyingInviteCard({
  title,
  description,
  acceptLabel,
  declineLabel,
  costCredits,
  affordable = true,
  onUnaffordable,
  onAccept,
  onDecline,
  busy,
  acceptLoading,
  footerInset,
}: {
  title: string
  description: string
  acceptLabel: string
  declineLabel: string
  /** Stars the accept action spends — shown as the in-button cost badge
   * (star + N) in place of the old decorative icon. */
  costCredits: number
  /** False ⇒ the user can't afford the accept. The accept button then
   * renders disabled (faded) but stays tappable: a tap fires
   * `onUnaffordable` (the not-enough-stars explainer) instead of accepting. */
  affordable?: boolean
  onUnaffordable?: () => void
  onAccept: () => void
  onDecline: () => void
  busy?: boolean
  acceptLoading?: boolean
  footerInset?: number
}) {
  const unaffordable = affordable === false
  return (
    <View style={[statusCardStyles.container, footerInset != null ? { paddingBottom: Math.max(footerInset, LG) } : null]}>
      <StatusCardText title={title} description={description} />
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <View style={statusButtonStyles.btnRow}>
          <View style={statusButtonStyles.btnDecline}>
            <Button
              variant="onPrimaryGhost"
              label={declineLabel}
              onPress={onDecline}
              disabled={busy}
              silentDisabled
            />
          </View>
          <View style={statusButtonStyles.btnAccept}>
            <Button
              variant="onPrimary"
              label={acceptLabel}
              iconStart={<CreditCost cost={costCredits} color={PRIMARY} bg={PRIMARY_BG} />}
              onPress={onAccept}
              disabled={busy || unaffordable}
              loading={acceptLoading}
              // Keep the in-flight lockout silent (no gray flicker) exactly
              // as before; but when the block is "can't afford" show the
              // disabled look and route the tap to the explainer.
              silentDisabled={!unaffordable && !acceptLoading}
              disabledHint={unaffordable && !busy ? onUnaffordable : undefined}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

// ── Page2 status card ────────────────────────────────────────────────────
// Heading-led body block (StatusCardText) for the Viewers state. Visibility
// is now switched from the side-tab dropdown (no in-page toggle); while
// broadcasting this card's description also carries the live "ends in MM:SS"
// countdown (broadcastTimer), the slot the toggle's segment timer used to own.

function ViewersStatusCard({
  isHidden,
  broadcastActive,
  hasWatchers,
  userIsMale,
  broadcastTimer,
}: {
  isHidden: boolean
  broadcastActive: boolean
  hasWatchers: boolean
  userIsMale: boolean | null
  // Live MM:SS until broadcast ends. When broadcasting it is appended to the
  // card description as a readable line ("03:45 לסיום השידור") — this is
  // where the old toggle's broadcast-segment countdown moved to.
  broadcastTimer?: string | null
}) {
  // 5-state matrix: hidden wins over broadcast; then watched vs empty.
  const [title, description] = (() => {
    if (isHidden) return [tg('home.watchingMeHiddenTitle', userIsMale), tg('home.watchingMeHiddenSubtitle', userIsMale)]
    if (broadcastActive && hasWatchers) return [tg('home.watchingMeBroadcastWatchedTitle', userIsMale), tg('home.watchingMeBroadcastWatchedSubtitle', userIsMale)]
    if (broadcastActive) return [tg('home.watchingMeBroadcastEmptyTitle', userIsMale), tg('home.watchingMeBroadcastEmptySubtitle', userIsMale)]
    if (hasWatchers) return [tg('home.watchingMeVisibleWatchedTitle', userIsMale), tg('home.watchingMeVisibleWatchedSubtitle', userIsMale)]
    return [tg('home.watchingMeVisibleEmptyTitle', userIsMale), tg('home.watchingMeVisibleEmptySubtitle', userIsMale)]
  })()
  // Append the broadcast countdown as its own readable line under the
  // description while broadcasting (replaces the toggle's segment timer).
  const fullDescription = broadcastActive && broadcastTimer
    ? `${description}\n${t('home.broadcast.endsIn').replace('{time}', broadcastTimer)}`
    : description

  return (
    <View style={statusCardStyles.container}>
      <StatusCardText title={title} description={fullDescription} />
    </View>
  )
}

// ── Visibility modes ─────────────────────────────────────────────────────
// hidden / visible / broadcast. The old 3-segment in-page toggle was
// replaced by a dropdown opened from the side tab's visibility glyph
// (VisibilityTabGlyph caret + VisibilityMenu); the transition logic lives
// once in handleVisibilitySelect. The broadcast countdown moved into the
// ViewersStatusCard description.

type ToggleMode = 'hidden' | 'visible' | 'broadcast'

const TOGGLE_ORDER: ToggleMode[] = ['hidden', 'visible', 'broadcast']
// Single source of truth for the visibility-state glyph. Consumed by the
// side-tab dropdown (VisibilityMenu) AND the collapsed side TabStrip tab,
// so a given state (hidden / visible / broadcast) always reads as the same
// icon wherever it surfaces.
const VISIBILITY_ICON: Record<ToggleMode, (color: string, size: number) => React.ReactNode> = {
  hidden: (color, size) => <EyeOffIcon color={color} size={size} />,
  visible: (color, size) => <EyeOpenIcon color={color} size={size} />,
  broadcast: (color, size) => <MegaphoneIcon color={color} size={size} />,
}

// The side tab's visibility glyph + an optional dropdown caret hinting the
// mode can be changed. The caret is ABSOLUTELY positioned (zero layout box)
// so it never changes the compact side tab's measured width — the TabStrip
// chip/equal-width math (iron rules) is untouched whether or not it shows.
// It mounts/unmounts with Fade in/out (user: "appears with animation and is
// removed with animation"). Rendered inside TabStrip's renderIndicator, so
// the glyph itself still gets the normal active/muted selection cross-fade.
function VisibilityTabGlyph({ color, mode, showCaret }: { color: string; mode: ToggleMode; showCaret: boolean }) {
  return (
    <View style={visMenuStyles.glyphWrap}>
      {VISIBILITY_ICON[mode](color, ICON.xxl)}
      {showCaret ? (
        <Animated.View
          key="vis-caret"
          entering={FadeIn.duration(TAB.collapseDuration)}
          exiting={FadeOut.duration(TAB.collapseDuration)}
          style={visMenuStyles.caret}
          pointerEvents="none"
        >
          <ChevronDownIcon color={color} size={ICON.sm} />
        </Animated.View>
      ) : null}
    </View>
  )
}

// Dropdown of the OTHER visibility modes (the current one is omitted — you're
// already in it), opened from the side tab. Each row is icon + name. Picking
// one routes through the SAME handleVisibilitySelect the old toggle used
// (DRY), including its broadcast-confirm / not-enough-stars / watcher-kick
// branches. A full-screen transparent catcher closes it on an outside tap;
// the card itself drops in / lifts out (FadeInUp / FadeOutUp).
function VisibilityMenu({ currentMode, busy, top, onSelect, onClose }: {
  currentMode: ToggleMode
  busy: boolean
  top: number
  onSelect: (m: ToggleMode) => void
  onClose: () => void
}) {
  const items = TOGGLE_ORDER.filter(m => m !== currentMode)
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        entering={FadeInUp.duration(MOTION.base)}
        exiting={FadeOutUp.duration(MOTION.base)}
        style={[visMenuStyles.menu, { top }]}
      >
        {items.map((m, idx) => (
          <Pressable
            key={m}
            style={({ pressed }) => [
              visMenuStyles.item,
              idx > 0 && visMenuStyles.itemDivider,
              pressed && !busy && visMenuStyles.itemPressed,
            ]}
            disabled={busy}
            onPress={() => onSelect(m)}
            hitSlop={SM}
          >
            {VISIBILITY_ICON[m](PRIMARY, ICON.lg)}
            <Text style={visMenuStyles.itemLabel}>{t(`home.visibility.${m}` as const)}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  )
}

const visMenuStyles = StyleSheet.create({
  // Relative host for the side-tab glyph so the caret can sit absolutely
  // under it without contributing a layout box.
  glyphWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caret: {
    position: 'absolute',
    bottom: -ICON.sm + XS,
    alignSelf: 'center',
  },
  // Popover card under the TabStrip, on the side-tab (row-end) edge. `end`
  // auto-flips (LTR right / RTL left) so it lands under the side tab in both
  // directions. Flat WHITE surface (no gradient) with the shared pill lift.
  menu: {
    position: 'absolute',
    end: SM,
    minWidth: 168,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    paddingVertical: XS,
    boxShadow: HEADER_PILL_SHADOW,
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MD,
    paddingVertical: MD,
    paddingHorizontal: LG,
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BLACK_SOFT,
  },
  itemPressed: {
    backgroundColor: BLACK_SOFT,
  },
  itemLabel: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.semibold,
    color: PRIMARY,
  },
})
// Shared button-stack + in-button timer styles. Used by every StatusCard
// variant (InviteTimerCard invite timer, ViewersStatusCard cooldown). Kept in one
// place so the three call sites stay visually identical — the same bar,
// the same small time text, the same horizontal insets.
const statusButtonStyles = StyleSheet.create({
  stack: {
    marginTop: XL,
    gap: SM,
  },
  // Two-button row inside the StatusCard scaffold (ReplyingInviteCard:
  // decline secondary + accept primary). The marginTop XL above the row
  // comes from the enclosing `stack`, so the row itself is layout-only.
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
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: WHITE,
    opacity: 0.85,
    includeFontPadding: false,
  },
  footerTime: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
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
    backgroundColor: WHITE,
  },
})

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets()
  const { profile } = useUserStore()
  // ── Horizontal pager shell ──────────────────────────────────────────────
  // 3-page layout: [settings(0), home(1), side(2)]
  // RTL right→left: Menu | Home | Side(page2/chat)
  // A global TabStrip above the pager owns the title; pages are pure content.
  type PaneIndex = 0 | 1 | 2
  const SETTINGS_PANE: PaneIndex = 0
  const HOME_PANE: PaneIndex = 1
  const PAGE2_PANE: PaneIndex = 2
  const CHAT_PANE: PaneIndex = 2  // same slot as PAGE2_PANE
  // If the app was launched from a killed state by tapping a push, pick the
  // matching pane up front so the user lands on it instead of seeing a flash
  // of Home before re-routing. Cleared after first read so it doesn't replay
  // on remount.
  // Tap-routing rule (matches CLAUDE.md "Push notifications" section):
  //   page2 codes → PAGE2_PANE  (incoming-invite world: pending / locked-with-message)
  //   chat codes  → CHAT_PANE   (active chat — same physical slot as PAGE2_PANE)
  //   page1 codes → HOME_PANE   (default; covered by `return null`)
  const PAGE2_CODES = new Set(['invite-in', 'extended', 'expired-in', 'cancelled-in'])
  const CHAT_CODES = new Set(['chat', 'match'])
  const initialPaneFromNotif = useMemo<PaneIndex | null>(() => {
    const type = getInitialNotificationType()
    if (!type) return null
    if (CHAT_CODES.has(type)) return CHAT_PANE
    if (PAGE2_CODES.has(type)) return PAGE2_PANE
    return null
  }, [])
  useEffect(() => {
    if (initialPaneFromNotif !== null) clearInitialNotification()
  }, [])
  // First-render only: state→chat transitions during the session are owned
  // by the chat-transition effect; this just seats the pager on mount.
  const initialPane = useMemo<PaneIndex>(() => {
    if (initialPaneFromNotif !== null) return initialPaneFromNotif
    if (useUserStore.getState().profile?.state === 'chat') return CHAT_PANE
    return HOME_PANE
  }, [])
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(initialPane)
  // Unread message count reported by ChatPage — shown as a badge next to the
  // "Chat" title while we're on the home pane.
  const [chatUnread, setChatUnread] = useState(0)
  // SettingsPage reports when the user is editing photos (iOS-style jiggle).
  // While that's active, PagerView scrolling is disabled so dragging a photo
  // to reorder doesn't slide the whole pane.
  const sliding = useSlidingActive()
  const pagerRef = useRef<PagerView>(null)
  const paneIndexRef = useRef(paneIndex)
  // Float progress across panes (0..N-1) driven by PagerView onPageScroll.
  // Feeds `tabProgress`, which drives BOTH the TabStrip label cross-fade AND
  // the selected chip (position + size) — one live, linear, synced motion.
  const pagerProgress = useSharedValue<number>(paneIndex)
  useEffect(() => {
    paneIndexRef.current = paneIndex
  }, [paneIndex])
  // Dismiss any open keyboard on every pane transition so it never lingers
  // visually over a pane that doesn't own the focused input.
  useEffect(() => { requestAnimationFrame(() => Keyboard.dismiss()) }, [paneIndex])

  // Profile sheet — rises from below using the same SlideInDown/SlideOutDown
  // layout animations as the home-pane MatchCard, so both cards mount/unmount
  // with identical motion. The swipe-down-to-dismiss gesture writes to a
  // separate dragY shared value (analogous to MatchCard's pull-style transform)
  // so the live finger-drag composes cleanly with the declarative mount motion.
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)
  const profileSheetConfigRef = useRef(profileSheetOpen)
  useEffect(() => { profileSheetConfigRef.current = profileSheetOpen }, [profileSheetOpen])
  const profileSheetHeaderBottom = useSharedValue(0)
  // Measured bottom of the home shell's TabStrip. Used to anchor the profile
  // sheet just below the tabs so the card doesn't slide behind them.
  const tabStripBottom = useSharedValue(0)
  // Same unified pull behaviour as page1/page2, in 'sheet' mode: manual
  // activation with header-vs-scroll arbitration. Threshold/flick/commit
  // motion are all object-owned and identical to the other surfaces (slide
  // off, then onCommit = close). No PullContext — PreviewFieldPage manages
  // its own scroll via dismissGestureRef + onScrollAtTop. No first-time
  // swipe-down tutorial here: the user explicitly disabled the demo
  // choreography on their own profile card (settings "My profile" sheet).
  // Omitting `tutorial` makes usePullBehavior bail before any choreography;
  // the page1/page2 tutorials are unaffected.
  const closeSheetViaSwipe = useCallback(() => setProfileSheetOpen(false), [])
  const profilePull = usePullBehavior({
    activation: 'sheet',
    enabled: true,
    onCommit: closeSheetViaSwipe,
    headerBottom: profileSheetHeaderBottom,
  })
  // ── Sheet open-progress → TabStrip morph (0 = closed, 1 = fully open) ────
  // `profileSheetOpenV` ramps with the card's SlideIn/SlideOut (system
  // default withTiming, matching the card's own mount motion — no magic
  // duration). The live swipe-down drag (`profilePull.pullY`) is folded in
  // and normalised by the SAME commit distance as the gesture, so the morph
  // tracks the card 1:1 and lands exactly at "closed" the instant the drag
  // reaches the dismiss point, then snaps back if released short.
  // `tabProgress` blends the real pager position toward HOME_PANE by this
  // amount: with the sheet shut it IS the pager progress (zero behaviour
  // change); as the sheet rises the selected-chip slides Settings→Home and
  // the Home tab's word morphs "Once"→"My profile" in lockstep.
  const profileSheetOpenV = useSharedValue(0)
  useEffect(() => {
    profileSheetOpenV.value = withTiming(profileSheetOpen ? 1 : 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSheetOpen])
  const profileSheetProgress = useDerivedValue(() => {
    // SAME commit distance as the gesture (object-owned single source) so
    // the morph tracks the card 1:1 and can never drift from the threshold.
    const span = profilePull.commitDistance
    const d = span > 0 ? Math.min(1, Math.max(0, profilePull.pullY.value / span)) : 0
    return profileSheetOpenV.value * (1 - d)
  })
  // Drives the TabStrip label cross-fade AND the selected chip. The
  // profile-sheet blend toward HOME_PANE is folded in here, so opening the
  // sheet still slides the chip Settings->Home (and morphs "Once"->"My
  // profile") with no separate chip driver.
  const tabProgress = useDerivedValue(() => {
    const p = pagerProgress.value
    return p + (HOME_PANE - p) * profileSheetProgress.value
  })
  // PullPane owns the anchor (top = tabStripBottom via topAnchor) and the
  // live drag transform; the RisingCard inside still owns SlideIn/SlideOut.
  const openProfileSheet = useCallback(() => {
    profilePull.reset()
    setProfileSheetOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const closeProfileSheet = useCallback(() => {
    tap()
    profilePull.setScrollAtTop(true)
    setProfileSheetOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shellWidth = useSharedValue(Dimensions.get('window').width)

  // Resolved when subPageOpen flips to true — lets a button that triggered
  // the open await the moment the slide actually starts and show a loading
  // state until then.
  // chatAvailable: state is 'chat'
  const chatAvailable = profile?.state === 'chat'
  const [chatJustStarted, setChatJustStarted] = useState(false)

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
  const availability = (profile?.relations as { availability?: { state?: string; starts_at?: string; reason?: 'group' | 'push'; join_requested?: boolean } } | undefined)?.availability
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


  const goToPane = (index: PaneIndex) => {
    // While geo-gated the side slot (page2/chat) is unreachable — swallow any
    // navigation to it (notification taps, programmatic routes). Menu/Home
    // stay reachable so the user can still open settings / change location.
    if (geoGated && index === PAGE2_PANE) return
    if (index === paneIndexRef.current) return
    tap()
    paneIndexRef.current = index
    setPaneIndex(index)
    pagerRef.current?.setPage(index)
  }

  // ── Notification tap handler ────────────────────────────────────────────
  // Route to the right pane when the user taps a push notification.
  const goToPaneRef = useRef(goToPane)
  goToPaneRef.current = goToPane
  useEffect(() => {
    return addNotificationTapListener(type => {
      if (CHAT_CODES.has(type)) goToPaneRef.current(CHAT_PANE)
      else if (PAGE2_CODES.has(type)) goToPaneRef.current(PAGE2_PANE)
      else goToPaneRef.current(HOME_PANE)
    })
  }, [])

  const onPageSelected = (e: { nativeEvent: { position: number } }) => {
    const pane = e.nativeEvent.position as PaneIndex
    // Defense in depth: if the pager ever lands on the side slot while gated
    // (e.g. mounted there from a stale notification), snap back to Home.
    if (geoGated && pane === PAGE2_PANE) {
      paneIndexRef.current = HOME_PANE
      setPaneIndex(HOME_PANE)
      pagerRef.current?.setPageWithoutAnimation(HOME_PANE)
      return
    }
    if (pane !== paneIndexRef.current) {
      tap()
      paneIndexRef.current = pane
      setPaneIndex(pane)
    }
  }

  // If the gate turns on while the user is on the side slot (or mounted there
  // from a notification), pull them back to Home so the gated slot can't stay
  // on screen.
  useEffect(() => {
    if (geoGated && paneIndexRef.current === PAGE2_PANE) {
      paneIndexRef.current = HOME_PANE
      setPaneIndex(HOME_PANE)
      pagerRef.current?.setPageWithoutAnimation(HOME_PANE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoGated])


  const openShellSubPage = (config: SubPageConfig): Promise<void> => {
    tap()
    if (config.kind === 'profileSection') openProfileSheet()
    return Promise.resolve()
  }



  // Android hardware back — when on the sub-page, slide it out;
  // when on any other side pane, slide back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (profileSheetConfigRef.current) {
        closeProfileSheet()
        return true
      }
      const idx = paneIndexRef.current
      if (idx !== HOME_PANE) {
        tap()
        paneIndexRef.current = HOME_PANE
        setPaneIndex(HOME_PANE)
        pagerRef.current?.setPage(HOME_PANE)
        return true
      }
      return false
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = profile?.state ?? null
  const page2Raw = profile?.relations?.page2
  const page2InviteObj: Page2Invite | null = page2Raw && !Array.isArray(page2Raw) ? page2Raw as Page2Invite : null
  const page2PendingInvite = page2InviteObj?.state === 'pending' ? page2InviteObj : null
  const page2DeadInvite = (page2InviteObj?.state === 'missed' || page2InviteObj?.state === 'fail') ? page2InviteObj : null
  const rawPage1State = profile?.relations?.page1?.state
  // Server-side v3 page2.state, preserved by deriveCompat. We need the raw
  // value (free / pending / chat / locked) to drive the premium popup's
  // hide/reveal toggle separately from the legacy shimmed page2 shape.
  const page2State = (profile?.relations as { page2State?: 'free'|'pending'|'chat'|'locked' } | undefined)?.page2State
  const isHidden = page2State === 'locked' && !page2InviteObj
  // Game mode "off" = both pages locked with no live partner or invite. This
  // is the resting state the settings GameModeCard toggle commits to via
  // app/pause. Used here only to flag the menu tab with a gray dot so the
  // user knows they're paused from anywhere in the home shell.
  const page1Profile = (profile?.relations?.page1 as { profile?: { user_id?: string } } | undefined)?.profile
  const gameModeOff = rawPage1State === 'locked' && page2State === 'locked'
    && !page1Profile?.user_id && !page2InviteObj
  // Drives the Home-tab base word cross-fade "Once" ⇄ "פאוזה". 0 = normal,
  // 1 = paused. withTiming (system default duration — DRY, no magic number)
  // so toggling game mode animates the swap. Fed to TabStrip as the Home
  // tab's `pauseProgress`; the glyph is intentionally NOT changed (the
  // settings glyph stays identical in every state — see the Menu tab spec).
  const pauseProgress = useSharedValue(0)
  useEffect(() => {
    pauseProgress.value = withTiming(gameModeOff ? 1 : 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameModeOff])
  // Broadcast = the "Show me to people" action: app_add. Server enforces a
  // 30-minute cooldown between presses; the toggle keeps the broadcast
  // segment visually "active" while the cooldown is running. The user can
  // exit broadcast early via the toggle (calls app/cancel_add).
  const ADD_COOLDOWN_MS = 30 * 60 * 1000
  const lastAddAt = (() => {
    const raw = profile?.relations?.last_add_at
    if (typeof raw !== 'string') return 0
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : 0
  })()
  const [, setAddCooldownTick] = useState(0)
  useEffect(() => {
    if (!lastAddAt) return
    const expiresAt = lastAddAt + ADD_COOLDOWN_MS
    if (Date.now() >= expiresAt) return
    // 1Hz tick for the countdown label below the button; self-stops once the
    // cooldown elapses so we don't keep waking the JS thread forever.
    const interval = setInterval(() => {
      setAddCooldownTick(t => t + 1)
      if (Date.now() >= expiresAt) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [lastAddAt])
  const addEnabled = !lastAddAt || (Date.now() - lastAddAt) >= ADD_COOLDOWN_MS
  const addCooldownSecsLeft = (() => {
    if (addEnabled || !lastAddAt) return 0
    return Math.max(0, Math.ceil((lastAddAt + ADD_COOLDOWN_MS - Date.now()) / 1000))
  })()
  const addCooldownLabel = (() => {
    if (addEnabled || !lastAddAt) return null
    const totalSec = addCooldownSecsLeft
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  })()
  // Broadcast is "active" while the 30m app_add cooldown is still running.
  // The toggle's broadcast segment lights up as the selected mode during
  // this window. The side TabStrip tab also surfaces the live countdown
  // above its "viewers" label (the label itself never swaps — broadcast
  // isn't a separate pane). Hidden still wins over broadcast in toggleMode
  // priority: hide-while-cooldown-runs is a valid state in which the user
  // is genuinely hidden, not broadcasting (and app_lock2 clears the
  // cooldown server-side anyway).
  const broadcastActive = !addEnabled && !!lastAddAt
  const toggleMode: ToggleMode = isHidden ? 'hidden' : broadcastActive ? 'broadcast' : 'visible'
  const isMale = profile?.is_male ?? null

  const [page2Alerting, setPage2Alerting] = useState(false)
  const [page2Discovery, setPage2Discovery] = useState(false)
  const [chatUnreadAlerting, setChatUnreadAlerting] = useState(false)
  const prevChatUnreadRef = useRef(0)
  // Fires the side tab's short 2-blink pulse whenever the viewer-list count
  // rises (a new person started watching). Increase-only — a viewer leaving
  // is not an attention event. Ambient (icon-only) side-tab states only;
  // see the watchers-count effect just before `tabSpecsAll`.
  const [viewersAlerting, setViewersAlerting] = useState(false)
  // null until the first observed count establishes a baseline, so a cold
  // mount that already has viewers (initial load 0→N) is NOT mistaken for "a
  // viewer just joined" — only a genuine post-baseline rise pulses.
  const prevWatchersCountRef = useRef<number | null>(null)
  // Stars-balance change → the Menu tab's standard 3-blink `alerting` pulse
  // AND, for that window, the star glyph is RECOLOURED (no number element):
  // green when stars were added, red when removed. Same baseline-null +
  // pulseTimeoutMs coalescing pattern as the viewer-count pulse: a burst of
  // changes inside the window reads as one pulse, and a cold mount that loads
  // with a balance (null→N) does NOT pulse. Both flags clear on the timeout
  // so the glyph returns to its normal white right after the blink.
  const [starsAlerting, setStarsAlerting] = useState(false)
  const [starsChangeActive, setStarsChangeActive] = useState(false)
  // Sign of the change → green (added) vs red (removed) glyph tint.
  const [starsChangePositive, setStarsChangePositive] = useState(false)
  const prevStarsBalanceRef = useRef<number | null>(null)
  const starsBalance = creditBalance(profile)
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

  // "Request to join" — the not-in-any-enabled-group gate's CTA. Records
  // relations.join_request server-side; availability.join_requested flips
  // live (Realtime), swapping this CTA for the "waiting for approval" state.
  const [joinBusy, setJoinBusy] = useState(false)
  const runJoinRequest = async () => {
    if (joinBusy) return
    setJoinBusy(true)
    try { await invoke('app/join_request', {}) } catch { /* realtime corrects */ }
    finally { setJoinBusy(false) }
  }

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
      if (!location && !customLoc) setLocFailed(true)
    })()
  }, [notifPerm, locPerm, customLoc])

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
  useEffect(() => {
    let mounted = true
    Network.getNetworkStateAsync()
      .then(s => { if (mounted) setNetReachable(s.isInternetReachable ?? s.isConnected ?? true) })
      .catch(() => { if (mounted) setNetReachable(true) })
    const sub = Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      setNetReachable(isInternetReachable ?? isConnected ?? true)
    })
    return () => { mounted = false; sub.remove() }
  }, [])
  const handleNetRetry = async () => {
    if (netBusy) return
    setNetBusy(true)
    try {
      const s = await Network.getNetworkStateAsync()
      setNetReachable(s.isInternetReachable ?? s.isConnected ?? true)
    } catch {
    } finally {
      setNetBusy(false)
    }
  }
  const showNoInternetOverlay = netReachable === false

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

  // Anchor pane on state transitions. Entering CHAT animates to slot 3;
  // leaving CHAT snaps back to home (slot 1).
  const prevStateRef = useRef(state)
  useEffect(() => {
    if (prevStateRef.current !== state) {
      const prev = prevStateRef.current
      prevStateRef.current = state
      const enteringChat = state === 'chat' && prev !== 'chat'
      const leavingChat = state !== 'chat' && prev === 'chat'

      if (enteringChat) {
        setChatJustStarted(true)
        requestAnimationFrame(() => { pagerRef.current?.setPage(CHAT_PANE) })
      } else if (leavingChat) {
        Keyboard.dismiss()
        setChatUnread(0)
        paneIndexRef.current = HOME_PANE
        setPaneIndex(HOME_PANE)
        requestAnimationFrame(() => { pagerRef.current?.setPageWithoutAnimation(HOME_PANE) })
      } else if (paneIndexRef.current !== HOME_PANE && paneIndexRef.current !== SETTINGS_PANE) {
        // Anchor PAGE2 back to home on state transitions (so a resolved invite
        // doesn't leave the user stranded on the viewers/invite pane), but
        // never yank them out of SETTINGS — the user is intentionally there
        // (e.g. toggling Game mode off via the GameModeCard) and the toggle
        // itself changes state.
        tap()
        paneIndexRef.current = HOME_PANE
        setPaneIndex(HOME_PANE)
        pagerRef.current?.setPage(HOME_PANE)
      }
    }
  }, [state])

  useEffect(() => {
    const prev = prevPage2InviteUserIdRef.current
    prevPage2InviteUserIdRef.current = page2InviteUserId
    if (prev === undefined) {
      // Initial mount with an already-active pending invite (app re-open or
      // hot reload while an invite is still live): pulse the side tab so the
      // returning user notices the live invitation. Skip the discovery card
      // animation — the card itself was already present on the previous run.
      if (page2InviteUserId !== null && paneIndexRef.current !== PAGE2_PANE) {
        setPage2Alerting(true)
        const timer = setTimeout(() => setPage2Alerting(false), TAB.pulseTimeoutMs)
        return () => { clearTimeout(timer); setPage2Alerting(false) }
      }
      return
    }
    // Clear discovery flag if invite went away (cancelled / approved / etc).
    if (prev !== null && page2InviteUserId === null) {
      setPage2Discovery(false)
    }
    if (prev === null && page2InviteUserId !== null) {
      // Fresh incoming invite — fire discovery animation when the card mounts.
      setPage2Discovery(true)
      if (paneIndexRef.current !== PAGE2_PANE) {
        setPage2Alerting(true)
        const timer = setTimeout(() => setPage2Alerting(false), TAB.pulseTimeoutMs)
        return () => { clearTimeout(timer); setPage2Alerting(false) }
      }
    }
  }, [page2InviteUserId])

  useEffect(() => {
    if (paneIndex === PAGE2_PANE && page2Alerting) {
      setPage2Alerting(false)
    }
    if (paneIndex === CHAT_PANE && chatUnreadAlerting) {
      setChatUnreadAlerting(false)
    }
  }, [paneIndex, page2Alerting, chatUnreadAlerting])

  useEffect(() => {
    const prev = prevChatUnreadRef.current
    prevChatUnreadRef.current = chatUnread
    if (prev === 0 && chatUnread > 0 && paneIndexRef.current !== CHAT_PANE) {
      setChatUnreadAlerting(true)
      const timer = setTimeout(() => setChatUnreadAlerting(false), TAB.pulseTimeoutMs)
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
  const remoteMatch = profile?.relations?.match ?? null
  // page1 candidate stack (stack[0] is the visible top === match). The card
  // after the visible one is rendered statically behind it (PullPane
  // `behind`) so a skip reveals it instantly with no rise. behindMatch is
  // derived relative to displayedMatch (below) — the FIRST stack entry that
  // isn't the currently-shown top — so it consistently equals "the card that
  // will become the next top" across the skip transition (no wrong-card
  // frame between the store stack shift and displayedMatch catching up).
  const page1Stack = profile?.relations?.stack ?? null
  const [displayedMatch, setDisplayedMatch] = useState<Profile | null>(remoteMatch)

  // ── page1 LOCAL optimistic deck (Tinder/Bumble) ───────────────────────
  // While watching, the page1 card pair is driven by this LOCAL deck, NOT
  // the server-lagged store: a skip pops the deck the instant the ride-off
  // animation finishes, so the next card is interactive with ZERO
  // dependency on the app/skip round-trip. The server stack
  // (relations.stack) reconciles into the deck in the background — it drops
  // server-removed cards (a non-top person who matched/got kicked
  // elsewhere) and appends fresh top-ups, but never resurrects a locally
  // skipped card. deck[0] = interactive top (pull wrapper); deck[1] = next
  // (static `behind` slot, already in place — no rise).
  const isWatching = state === 'watching'
  const [deck, setDeck] = useState<Profile[]>(
    () => (Array.isArray(page1Stack) ? page1Stack : []),
  )
  const deckRef = useRef<Profile[]>(deck)
  useEffect(() => { deckRef.current = deck }, [deck])
  // Locally-skipped ids: excluded from server-driven re-append so a skipped
  // card never comes back, even if app/skip failed (user decision).
  const skippedIdsRef = useRef<Set<string>>(new Set())
  // Set at skip-commit, cleared on promote; one-shot gate for the ride-off
  // promote so it fires exactly once per skip.
  const pendingSkipRef = useRef<string | null>(null)
  // The user_id the pull/ride currently applies to (the card being dragged
  // / flying off). The FRONT wrapper translates by pullY ONLY when it IS
  // this card; the freshly-promoted next card (a different id) renders at
  // rest immediately, independent of pullY's async settle — that's what
  // kills the post-skip flicker. Updated in the layout effect AFTER reset.
  const liveTopId = useSharedValue('')
  // One-shot latch for the ride-off promote. The useAnimatedReaction below
  // runs EVERY UI frame; without this it would `runOnJS(promote)` on every
  // frame for the whole tail of the ride (pullY ≥ 0.95·screenH until the
  // re-render), spamming the JS thread right at the end of the gesture —
  // the "swipe isn't smooth" stutter. Set true the first frame past the
  // threshold; reset false in the post-slice layout effect (one promote
  // per skip, frame-driven, zero JS churn after it fires).
  const promoteFiredSV = useSharedValue(false)
  // (No rise machinery: per the user the card NEVER rises — neither a fresh
  // first card nor a skip-advance. It just appears at rest; the FRONT
  // wrapper forces Reanimated `skipEntering`.)
  const screenH = Dimensions.get('window').height
  const frontMatch: Profile | null = isWatching ? (deck[0] ?? null) : null
  const behindMatch: Profile | null = isWatching ? (deck[1] ?? null) : null
  // The single FOCUSED counterpart, unified across the live-interaction
  // states so it is ONE persistent React element keyed by user_id: while
  // watching it's the deck top; while waiting/chat it's the same person you
  // committed to. Routing all three through the identical wrapper (below)
  // means inviting the top does NOT remount the card — MatchCard stays
  // mounted and animates its topBlock (the invite timer) in via
  // onTopBlockShown, instead of the card vanishing and reappearing. Ended /
  // locked "what happened" states are NOT here (focusMatch = null) — they
  // keep the RisingCard interrupt-slide path.
  // STICKY focus: while waiting/chat the source is `displayedMatch`, which
  // the sync effect transiently sets to null on the watching→waiting handoff
  // (it isn't maintained during watching, so it's stale/null right when the
  // invite lands). A bare `displayedMatch` there made focusMatch flicker
  // person→null→person ⇒ the keyed element unmounted+remounted ⇒ the card
  // "reloads" on invite. Falling back to the last known focus (the SAME
  // person you just invited — it was the deck top) bridges that one-frame
  // gap so the element identity (key = user_id) is preserved and MatchCard
  // only updates props (topBlock = invite timer) — it stays put and scrolls.
  const stickyFocusRef = useRef<Profile | null>(null)
  const focusMatch: Profile | null = isWatching
    ? frontMatch
    : state === 'waiting' || state === 'chat'
      ? (displayedMatch ?? stickyFocusRef.current)
      : null
  useEffect(() => {
    if (focusMatch) stickyFocusRef.current = focusMatch
    else if (!isWatching && state !== 'waiting' && state !== 'chat') {
      stickyFocusRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMatch?.user_id, isWatching, state])
  // Gate for the first-card rise. The focus card SlideInDown-rises on every
  // genuine in-session fresh search (a real mount of a new focus element),
  // but NOT on the cold-launch first paint (user opened the app already
  // `watching` — that must be static, both for the documented cold-start
  // behaviour and to dodge the Fabric mount-race). Starts false; an effect
  // flips it true AFTER the first commit, so only mounts that happen later
  // (the user pressing play → app/find) animate in. Skip-advance and
  // watching→waiting never remount the focus element, so `entering` can't
  // fire there regardless — this gate is purely the cold-start guard.
  const firstPaintDoneRef = useRef(false)
  useEffect(() => { firstPaintDoneRef.current = true }, [])

  // Reconcile the server stack into the local deck (watching only).
  // Keep the user's local order/position, drop cards the server removed,
  // append genuinely-new server cards (top-ups) that aren't locally skipped.
  useEffect(() => {
    if (!isWatching) {
      if (deckRef.current.length) setDeck([])
      skippedIdsRef.current.clear()
      pendingSkipRef.current = null
      return
    }
    const server = Array.isArray(page1Stack) ? page1Stack : []
    const serverIds = new Set(server.map(p => p.user_id))
    // Once the server has dropped a skipped id (app/skip processed) stop
    // tracking it — its membership is now authoritatively gone.
    for (const id of [...skippedIdsRef.current]) {
      if (!serverIds.has(id)) skippedIdsRef.current.delete(id)
    }
    const prev = deckRef.current
    const kept = prev.filter(p => serverIds.has(p.user_id))
    const keptIds = new Set(kept.map(p => p.user_id))
    const appended = server.filter(
      p => !keptIds.has(p.user_id) && !skippedIdsRef.current.has(p.user_id),
    )
    const next = [...kept, ...appended]
    if (
      next.length === prev.length &&
      next.every((p, i) => p.user_id === prev[i].user_id)
    ) return
    setDeck(next)
  }, [isWatching, page1Stack])

  // Local promote: pop the skipped top off the deck. Triggered LOCALLY by
  // the ride-off animation completing (the useAnimatedReaction below) — NOT
  // by the server. The pull is reset to rest in a layout effect AFTER the
  // deck slice commits (so the unmounting old top is gone before pullY hits
  // 0 — no snap-back flash), then the next card is already in place.
  const promote = useCallback(() => {
    if (!pendingSkipRef.current) return
    pendingSkipRef.current = null
    setDeck(d => (d.length ? d.slice(1) : d))
  }, [])
  // (The ride-off promote trigger + the post-slice pull reset are wired
  // below, right after page1Pull is created — they need its shared value.)
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
  useEffect(() => {
    if (!searching) return
    const timer = setTimeout(
      () => { setSearching(false); setLoadingProfile(false) },
      API_TIMEOUT_MS + SEARCH_WATCHDOG_SLACK_MS,
    )
    return () => clearTimeout(timer)
  }, [searching])

  // STACK model: a top card NEVER rises (SlideInDown). The next card waits
  // statically in place behind the current one (PullPane `behind`), so when
  // the top is skipped off it is simply revealed already there — no rise.
  // RisingCard is passed animateEnter={false} unconditionally; only its
  // SlideOutDown exit + the PullPane black "לא עכשיו" wake still animate.

  // Reset the cached "scroll is at top" gate whenever a new profile is shown.
  // ── Pull-to-skip (page1) ─────────────────────────────────────────────
  // The whole pull behaviour — gesture, 1:1 resistance, half-screen commit,
  // the ride-off-screen animation, AND the first-time tutorial choreography
  // + once-ever trigger — lives in usePullBehavior. runIgnore is the commit
  // action (also fired by the skip-hint dialog) so it's declared here.
  const runIgnore = useCallback(() => {
    // LOCAL optimistic skip. Mark the top skipped and fire app/skip
    // fire-and-forget — the UI advances entirely locally: the committed card
    // rides off over the black "לא עכשיו" wake (the gesture's existing
    // pullY → screenH), then `promote` (fired LOCALLY by the ride-off
    // animation reaching the bottom, NOT by this round-trip) pops the deck
    // so the already-in-place next card becomes the interactive top. The
    // server records the 24h ignore + tops the stack back to 10 and that
    // reconciles into the deck in the background. No busy gate: the next
    // card is immediately skippable with zero dependency on the response.
    const top = deckRef.current[0]
    if (!top || pendingSkipRef.current === top.user_id) return
    tap()
    skippedIdsRef.current.add(top.user_id)
    pendingSkipRef.current = top.user_id
    invoke('app/skip', { skipped_id: top.user_id }).catch(err => console.error(err))
  }, [])
  const page1Pull = usePullBehavior({
    activation: 'scrollPan',
    enabled: state === 'watching',
    onCommit: runIgnore,
    tutorial: {
      // Once-ever, and only on a settled watching card with no overlay
      // eating the surface the demo animates on.
      ready: state === 'watching' && !!displayedMatch
        && !showNotifOverlay && !showLocOverlay && !locFailed && !showNoInternetOverlay,
      seenFlag: SEEN_FLAGS.homeDemo,
    },
  })
  // Ride-off promote (LOCAL, no server): when the committed card has slid
  // ~off-screen (pullY reached the bottom of its withTiming(screenH) ride),
  // pop the local deck so the already-in-place next card becomes the top.
  // One-shot per skip via pendingSkipRef; frame-driven so it tracks the
  // actual animation, not a hardcoded duration.
  useAnimatedReaction(
    () => page1Pull.pullY.value,
    (cur) => {
      // Gate on slidOut: only the COMMITTED ride-off (onEnd → withTiming
      // (screenH)) may promote. Without this, the now-1:1 pull (pullY =
      // raw finger) would hit 0.95·screenH while the finger is still down
      // on a long drag and pop the deck before release.
      if (
        page1Pull.slidOut.value &&
        cur >= screenH * 0.95 &&
        !promoteFiredSV.value
      ) {
        promoteFiredSV.value = true
        runOnJS(promote)()
      }
    },
    [screenH],
  )
  // Instant pull reset AFTER the deck slice has rendered (layout phase, pre
  // paint). By now the old top's keyed wrapper is unmounted (plain View, no
  // exit anim) and the NEW top is mounted in the pull wrapper — still
  // translated by the leftover pullY≈screenH. Resetting to 0 here (before
  // paint) lands the new top at rest with no snap-back flash and no rise;
  // the next card was already sitting in the static `behind` slot.
  useLayoutEffect(() => {
    if (!isWatching) return
    // Order matters: reset the pull FIRST (pullY -> 0), THEN point liveTopId
    // at the new top. Until liveTopId catches up the new FRONT's self-
    // translate is 0 (its id !== liveTopId), and once it does catch up pullY
    // is already 0 — so the new top is at rest the whole time (no flicker).
    page1Pull.reset()
    // Clear the committed-ride latch. It is set true by BOTH the gesture's
    // onEnd AND the button's commit(), but was previously reset ONLY in the
    // gesture onStart — so after a BUTTON skip it stayed true forever and
    // the next commit() hit `if (slidOut.value) return` ⇒ the "Not now"
    // button skipped only once then silently no-op'd ("doesn't always
    // work"). Resetting here (post-promote, after the ride finished) re-arms
    // both the button and the swipe for the next skip. Safe: this effect
    // runs AFTER promote already fired, so it can't abort an in-flight ride.
    page1Pull.slidOut.value = false
    promoteFiredSV.value = false
    liveTopId.value = deck[0]?.user_id ?? ''
    page1Pull.setScrollAtTop(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck[0]?.user_id, isWatching])
  // Self-translate for the page1 FRONT card. PullPane runs in `cardStatic`
  // mode (it does NOT translate the card itself), so the FRONT follows the
  // finger ONLY while it IS the live top (the card being dragged / riding
  // off). A freshly-promoted next card has a different id than liveTopId
  // until the layout effect above runs (by then pullY is already 0), so it
  // sits at rest the entire swap — no off-screen frame, no flicker.
  const frontId = frontMatch?.user_id ?? ''
  const frontPullStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: frontId !== '' && frontId === liveTopId.value ? page1Pull.pullY.value : 0 },
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [frontId])
  // 0 at rest → 1 at the commit point. Drives the Home-tab name slide 1:1
  // with the skip pull. GATED by the EXACT same predicate frontPullStyle
  // uses (`frontId === liveTopId`): the name only slides while the shown
  // top IS the card being dragged. The instant `promote()` pops the deck,
  // `spec.label` jumps to the new top but `pullY` is still ≈screenH (the
  // layout effect hasn't reset it yet) — without this gate the slide would
  // be at p≈1, rendering `nameSwapNext` (the card AFTER next) while the
  // screen shows the new top ⇒ the tab shows the WRONG name, compounding
  // on fast multi-skip ("names get confused"). Gating to 0 there makes the
  // tab show the new top (spec.label) at rest in LOCKSTEP with the card
  // (which is also held at rest by the same liveTopId gate).
  const nameSwapProgress = useDerivedValue(() => {
    if (frontId === '' || frontId !== liveTopId.value) return 0
    const c = page1Pull.commitDistance || 1
    const p = page1Pull.pullY.value / c
    return p < 0 ? 0 : p > 1 ? 1 : p
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId])
  // MatchCard's PullScrollView is the same instance across profile changes;
  // the pull gesture samples scrollAtTop at gesture start. PullScrollView
  // only refreshes it from native onScroll, so without this reset it sticks
  // at `false` (previous card's scrolled-down position) and the first swipe
  // on the new card is routed to scroll-only until the user nudges it.
  useEffect(() => {
    if (displayedMatch) page1Pull.setScrollAtTop(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedMatch?.user_id])

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
    // While watching, the LOCAL deck owns the page1 card pair (front +
    // static behind) and its own promote/reset — this preload→rise
    // choreography must not also drive it (that double-drive was the
    // reported "old card snaps back, black, then second card" glitch).
    if (state === 'watching') return
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
    if (!remoteMatch) {
      setDisplayedMatch(null)
      setPreloadingMatch(null)
      setLoadingProfile(false)
      page1Pull.reset()
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
      clearLoading()
      return () => { cancelled = true }
    }
    // STACK model: a new top (stack[0] changed — a skip resolved, or the
    // initial find landed). The next card was already mounted statically
    // behind (PullPane `behind`) and its photos were prefetched by api.ts —
    // so there is NO preload gate and NO rise. Promote it directly so it
    // sits at rest in place (RisingCard animateEnter is false). Reset the
    // pull first: the skipped card rode pullY off-screen, so without this
    // the freshly-promoted top would mount inside the still-translated
    // wrapper (off-screen). The old top's keyed RisingCard unmounts and
    // plays SlideOutDown off-screen (invisible, as before).
    setPreloadingMatch(null)
    setLoadingProfile(false)
    page1Pull.reset()
    setDisplayedMatch(remoteMatch)
    searchingTimer = setTimeout(() => {
      if (!cancelled) setSearching(false)
    }, 60)
    clearLoading()
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

  // Hidden preloader fires onReady once all photos have rendered. That's the
  // signal to promote the match into the visible slot — at that point the
  // photos are decoded and the upcoming SlideInDown shows a complete card.
  // The userId guard rejects a stale onReady from a previous preload whose
  // MatchCard is still tearing down: we only promote when the user the
  // callback was bound to still matches the current preloadingMatch.
  const onPreloadReady = useCallback((readyUserId: string) => {
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
    })
    setTimeout(() => { setSearching(false); setLoadingProfile(false) }, 480)
    if (ignoreLoadingRef.current) {
      setIgnoreLoading(false)
      setBusy(false)
      setPendingKey(null)
    }
  }, [page1Pull.reset])

  const watchers = profile?.relations?.watchers
    ? [...profile.relations.watchers].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    : []

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
  // The avatar source is chosen in priority order so the circle is never
  // empty waiting on the network:
  //   1. localPhotoUriCache — set during a deferred upload from this session
  //      (instant, but only valid until the cache is cleared post-upload).
  //   2. selfAvatar — a stable copy on documentDirectory mirrored from
  //      AsyncStorage; survives cold start and renders synchronously on the
  //      first frame.
  //   3. remote URL — fallback for the very first launch on a new device,
  //      before the sync effect below has copied the photo locally.
  const localAvatarUri = firstProfileImage ? (localPhotoUriCache.get(firstProfileImage) ?? null) : null
  const selfAvatar = useSelfAvatar()
  const stableSelfAvatarUri = selfAvatar && selfAvatar.filename === firstProfileImage ? selfAvatar.uri : null
  const avatarDisplayUrl = localAvatarUri ?? stableSelfAvatarUri ?? profileAvatarUrl
  const avatarPlaceholder = !localAvatarUri && !stableSelfAvatarUri && firstPhoto?.hash
    ? { blurhash: firstPhoto.hash }
    : undefined

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

  // Match name (strip trailing ", age") and gendered invite confirm desc.
  // While watching, the relevant person is the LOCAL deck front (the card
  // actually on screen / the one an invite acts on), NOT the server-lagged
  // relations.match — so the Home-tab name + invite copy update exactly when
  // the card swaps (on promote), in sync with the visible card.
  const matchName = nameFromTitle(
    isWatching && frontMatch ? frontMatch.title : profile?.relations?.match?.title,
  )
  // The Home tab's displayed name (single source — the spec.label below and
  // the rise-from capture both read this).
  const homeTabLabel = matchName || t('home.tabs.home')
  // Rise-synced tab name slide-up (user: "when a card rises, lift the
  // existing tab text and the new profile's name takes its place — like it
  // goes down [skip], so it goes up [rise]"). Mirror of the pull-driven
  // skip slide, but time-driven and in the OPPOSITE direction. `riseSwap`
  // 0→1 runs on the SAME MOTION.base the card's SlideInDown uses, so the
  // name slide and the card rise are synced by construction (one duration
  // source). `riseFrom` is the OLD label captured at rise start; while set,
  // TabStrip renders the rise pair (old slides up/out, new = spec.label in
  // from the bottom) instead of the skip pair. Cleared in the timing
  // completion callback so it falls back to the resting label seamlessly.
  const riseSwap = useSharedValue(0)
  const [riseFrom, setRiseFrom] = useState<string | null>(null)
  // The Home label as it was while NOT watching — i.e. the genuine
  // pre-search text the tab is showing right before the first card rises
  // ("Once", or a leftover ended-state name). Updated ONLY while
  // `!isWatching` (below), so it can NEVER be contaminated by the new
  // card's name: `matchName` updates reactively from `relations.match`,
  // which can lead the `isWatching` flip, so a render-trailing capture
  // would grab the NEW name ⇒ the rise swapped "new→new" / "name got
  // confused". Reading this at the edge guarantees old = the real old.
  const lastNonWatchingLabelRef = useRef<string>(homeTabLabel)
  const riseArmedRef = useRef<boolean>(false)
  const prevFocusForRiseRef = useRef<string | null>(focusMatch?.user_id ?? null)
  // ARM the rise SYNCHRONOUSLY during render (NOT in an effect). An effect
  // runs one render LATE: by then `homeTabLabel` has already flipped to the
  // new card's name, so for that one frame TabStrip's SKIP branch rendered
  // the NEW name AT REST, then riseFrom landed and the OLD name abruptly
  // appeared — exactly the user's "see the new before the rise; the old
  // suddenly pops". Setting state during render (a documented React escape
  // hatch — guarded by a ref + convergent, so it can't loop) puts riseFrom
  // on the SAME commit as the isWatching flip, so the rise branch is active
  // from the very first frame: no skip-branch gap. riseSwap is NOT touched
  // here (no shared-value writes during render) — the slide only STARTS
  // when the card actually mounts (the FIRE effect below).
  const prevWatchRenderRef = useRef(isWatching)
  if (prevWatchRenderRef.current !== isWatching) {
    prevWatchRenderRef.current = isWatching
    if (isWatching && firstPaintDoneRef.current) {
      // Fresh in-session search. A deck skip/promote NEVER leaves watching
      // so this can't retrigger (no "tab goes crazy on fast skip"); cold
      // launch is excluded by firstPaintDoneRef (+ prevWatchRenderRef init
      // = isWatching ⇒ no edge on the first render).
      riseArmedRef.current = true
      setRiseFrom(lastNonWatchingLabelRef.current || t('home.tabs.home'))
    } else if (!isWatching) {
      // Search abandoned / left watching — cancel so the tab returns to
      // its normal resting label.
      riseArmedRef.current = false
      setRiseFrom(null)
    }
  }
  // FIRE the slide when the first card ACTUALLY mounts (focusMatch
  // null→non-null) while armed — the SAME instant its SlideInDown
  // (MOTION.base) begins, so the tab-name rise is synced to the card rise
  // BY CONSTRUCTION (same start, same duration). riseFrom was already set
  // at arm (rise branch already showing OLD at rest, NEW clipped below);
  // here we only START the slide. Skip-promote / watching→waiting keep
  // focusMatch non-null throughout, so they never re-fire this.
  useEffect(() => {
    const cur = focusMatch?.user_id ?? null
    const prev = prevFocusForRiseRef.current
    prevFocusForRiseRef.current = cur
    if (cur && !prev && riseArmedRef.current) {
      riseArmedRef.current = false
      riseSwap.value = 0
      riseSwap.value = withTiming(1, { duration: MOTION.base }, (fin) => {
        'worklet'
        if (fin) {
          // Do NOT reset riseSwap to 0 here. Clearing riseFrom is async
          // (runOnJS → next tick), so a synchronous riseSwap=0 would, for
          // that tick, leave the rise branch rendered at p=0 ⇒ the OLD
          // name snaps back to rest and the NEW vanishes ("new up → old
          // replaces it → new replaces old", the 3-step glitch). Leaving
          // riseSwap at 1 keeps the ENDED state (new at rest, old gone);
          // when setRiseFrom(null) lands the SKIP branch shows `label`
          // (= the new name) at the SAME translateY 0 — seamless. riseSwap
          // is reset to 0 later, while NOT watching (below), before the
          // next rise's branch is ever rendered.
          runOnJS(setRiseFrom)(null)
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMatch?.user_id])
  // While NOT watching: (a) track the last pre-search label (the genuine
  // "old" text the next rise captures — never contaminated by the new
  // card's name), and (b) park riseSwap at 0 so the NEXT rise's branch
  // renders OLD at rest / NEW clipped from the very first frame (it is
  // never the rendered branch while not watching, so this can't flash).
  useEffect(() => {
    if (!isWatching) {
      lastNonWatchingLabelRef.current = homeTabLabel
      riseSwap.value = 0
    }
  })
  const matchIsMale = isWatching && frontMatch
    ? frontMatch.is_male
    : profile?.relations?.match?.is_male
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
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)
  const [skipHintOpen, setSkipHintOpen] = useState(false)
  // Once the user taps "got it" on the skip-hint popup it's acknowledged
  // forever (persisted seen-flag): from then on "not now" skips directly,
  // exactly as if they'd pressed the popup's "skip" — the popup never opens
  // again. Loaded once on mount; flipped immediately on ack so the very next
  // "not now" in the same session already skips.
  const [skipHintAcked, setSkipHintAcked] = useState(false)
  useEffect(() => {
    hasSeenFlag(SEEN_FLAGS.skipHintAck).then(setSkipHintAcked).catch(() => {})
  }, [])
  // Not-enough-stars explainer. Holds the blocked action's cost (so the
  // popup can say how many stars it needs); null = hidden. Opened by tapping
  // an action button the user can't afford (invite / approve / broadcast).
  const [insufficientCost, setInsufficientCost] = useState<number | null>(null)
  // Drives the watching card's inner scroll back to the top when the user
  // acknowledges the skip hint ("got it"), so the swipe-down-to-skip
  // gesture they were just taught is armed again.
  const watchingCardRef = useRef<MatchCardHandle>(null)
  const [removeWatcherTarget, setRemoveWatcherTarget] = useState<Profile | null>(null)
  const [removeWatcherBusy, setRemoveWatcherBusy] = useState(false)
  const [broadcastConfirmOpen, setBroadcastConfirmOpen] = useState(false)
  // While broadcasting, any toggle tap that would change mode opens a
  // confirm popup first ("you're broadcasting — stop?"). The target tracks
  // which destination button was tapped so the confirm callback can run
  // the right server action. 'visible' and 'exit' both map to
  // app/cancel_add (which lands the user back in visible mode); 'hidden'
  // maps to app/lock2 (which also clears last_add_at atomically).
  const [exitBroadcastTarget, setExitBroadcastTarget] = useState<'hidden' | 'visible' | 'exit' | null>(null)
  // Tapping Hidden while watchers exist would silently kick every watcher
  // (each receives page1=locked+message=remove + a `removed` push) on the
  // bare app/lock2 call. Surface a confirm popup first so the destructive
  // ripple isn't a surprise. Skipped during broadcast (exitBroadcastTarget
  // already covers that branch) and when there are zero watchers.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  // Dropdown of the OTHER visibility modes, opened by tapping the side
  // tab's visibility glyph while it's the selected pane and ambient (no
  // 1:1 counterpart). Replaces the old 3-segment toggle.
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false)
  // Bottom Y (px) of the TabStrip header, in JS land, so the dropdown can
  // be absolutely positioned directly under it. (tabStripBottom is a
  // Reanimated shared value used by the chip; an RN `top` needs a number.)
  const [headerBottomPx, setHeaderBottomPx] = useState(0)
  // Index into READY_HEADLINES; re-rolled on each entry to the ready state
  // by the effect next to headlineText. Lazy init so the first appearance is
  // already random rather than always the first sentence.
  const [readyHeadlineIdx, setReadyHeadlineIdx] = useState(() => pickReadyHeadline(-1))
  // Chat-state actions menu (opens from the MatchCard X button in chat
  // state). Exactly two destructive options: end chat (leave) and block.
  // Report is NOT here any more — it moved to a dedicated flag button on
  // every match card (see reportTargetId / MatchCard.onReport below) so a
  // user can report an inappropriate photo/bio before ever entering chat.
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [chatConfirmAction, setChatConfirmAction] = useState<'block' | 'leave' | null>(null)
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

  const runAction = (endpoint: string, key: string, onDone?: () => void) => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey(key)
    const done = () => { setBusy(false); setPendingKey(null); onDone?.() }
    invoke(endpoint, {})
      .then(done)
      .catch(err => { console.error(err); done() })
  }

  // Visibility-mode selection — the SINGLE source of the hidden/visible/
  // broadcast transition logic (DRY). Was inlined on the old 3-segment
  // VisibilityToggle's onHidden/onVisible/onBroadcast; now the side-tab
  // dropdown (VisibilityMenu) is the only caller. Behaviour is byte-for-byte
  // what the toggle did: a no-op for the current mode, a "stop broadcasting"
  // confirm while broadcasting, the watcher-kick confirm for hidden, the
  // not-enough-stars popup / broadcast confirm for broadcast.
  const handleVisibilitySelect = (target: ToggleMode) => {
    if (busy || target === toggleMode) return
    if (target === 'hidden') {
      if (broadcastActive) setExitBroadcastTarget('hidden')
      else if (watchers.length > 0) setHideConfirmOpen(true)
      else runAction('app/lock2', 'lock2')
    } else if (target === 'visible') {
      if (broadcastActive) setExitBroadcastTarget('visible')
      else runAction('app/free2', 'free2')
    } else {
      if (broadcastActive) setExitBroadcastTarget('exit')
      else if (starsBalance < CREDIT_COST.broadcast) { tap(); setInsufficientCost(CREDIT_COST.broadcast) }
      else setBroadcastConfirmOpen(true)
    }
  }

  const invitedPage1 = profile?.relations?.page1 as { expires_at?: string; invited_at?: string; extended?: boolean; message?: string } | undefined
  const inviteExpiresAt = invitedPage1?.expires_at

  // Title/description for terminal locked-message cards. Keyed by the raw v3
  // server `message` (page1.message / page2.message), not the legacy `event`
  // shim — keeps the lookup orthogonal to userStore's missed/fail synthesis.
  // page1 texts vary by the other user's gender (he/she); page2 texts vary by
  // both (other user's verb + user's "available/answered" adjective).
  const page1Message = isEndedState ? invitedPage1?.message : undefined
  const page1MessageTitle = page1Message ? tg(`home.locked.page1.${page1Message}.title` as never, matchIsMale) : ''
  const page1MessageDesc = page1Message ? tg(`home.locked.page1.${page1Message}.desc` as never, matchIsMale) : ''
  const page2Message = page2DeadInvite?.message
  const page2OtherMale = page2DeadInvite?.is_male ?? null
  const page2MessageTitle = page2Message ? tgg(`home.locked.page2.${page2Message}.title` as never, isMale, page2OtherMale) : ''
  const page2MessageDesc = page2Message ? tgg(`home.locked.page2.${page2Message}.desc` as never, isMale, page2OtherMale) : ''

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
    invoke('app/find', {})
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
      })
  }, [busy])

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

  // ── Page2 pending-invite swipe-down ──────────────────────────────────────
  // Same unified behaviour/threshold/commit motion as page1 (slide off, then
  // onCommit). Independent instance from page1's — both panes can be mounted
  // at once and shared values can't be aliased across the two gesture trees.
  // `openRefuseConfirm` still backs the explicit decline BUTTON (confirm
  // dialog, decline is irreversible); the SWIPE now declines directly, per
  // the uniform-commit decision (decline-without-confirm accepted).
  const openRefuseConfirm = useCallback(() => {
    tap()
    setRefuseConfirmOpen(true)
  }, [])
  const declineViaSwipe = useCallback(() => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey('refuse-confirm')
    invoke('app/decline', {})
      .then(() => { setBusy(false); setPendingKey(null) })
      .catch(err => { console.error(err); setBusy(false); setPendingKey(null) })
  }, [busy])
  const page2Pull = usePullBehavior({
    activation: 'scrollPan',
    // User decision: an incoming invitation in page2 must NOT be skippable
    // by swiping the card down. The gesture is fully disabled; declining is
    // only via the explicit decline button (openRefuseConfirm). The tutorial
    // demo is off too (never teach a disabled gesture). page2Pull is still
    // created so the page2 PullPane keeps its (now inert, pullY≡0) pull
    // wiring + reset without a structural change.
    enabled: false,
    onCommit: declineViaSwipe,
    tutorial: { ready: false, seenFlag: SEEN_FLAGS.page2Demo },
  })
  // page2 has no match-sync (page1) / open() (sheet) reset path, and the
  // unified slide-off commit leaves pullY at screenH after a decline. Reset
  // it whenever a pending invite (re)appears, so the freshly-mounted card
  // isn't translated fully off-screen (which would show only the bare
  // PRIMARY container behind it).
  useEffect(() => {
    if (page2PendingInvite) page2Pull.reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page2PendingInvite?.user_id])


  // Watching-state invite prompt lives inside the MatchCard scroll (passed
  // as footerBlock), not in the pinned HomeButtons row. The "skip" button
  // is gone — pull-to-skip on the card handles the same intent. It is the
  // shared ReplyingInviteCard info component (same scaffold/spacings as the
  // page2 side): the title rides as a bold lead-in into the body, so a
  // single tap on the primary button sends the invite.
  //
  // After pressing send, we keep the block mounted for ~1.5s so it doesn't
  // pop out from under the user's finger when realtime flips state to
  // 'waiting'. The MatchCard's auto-scroll-to-top runs in parallel, so the
  // block visibly slides off-screen below the viewport rather than vanishing
  // in place.
  const [stickyInvite, setStickyInvite] = useState(false)
  useEffect(() => {
    if (!stickyInvite) return
    const id = setTimeout(() => setStickyInvite(false), 1500)
    return () => clearTimeout(id)
  }, [stickyInvite])
  const showInviteBlock = (state === 'watching' || stickyInvite) && isMatchCardOpen
  const watchingInviteButton = showInviteBlock ? (
    <ReplyingInviteCard
      title={tgg('home.inviteConfirmTitle' as any, isMale, matchIsMale).replace(/\{name\}/g, matchName)}
      description={inviteConfirmDesc.replace(/\{name\}/g, matchName)}
      acceptLabel={t('home.inviteConfirmOk')}
      declineLabel={t('home.watchingReject')}
      costCredits={CREDIT_COST.invite}
      affordable={starsBalance >= CREDIT_COST.invite}
      onUnaffordable={() => { tap(); setInsufficientCost(CREDIT_COST.invite) }}
      onAccept={() => { setStickyInvite(true); runAction('app/invite', 'invite-confirm') }}
      // "Not now": first time → teach via the skip-hint popup; after the
      // user has acknowledged it once ("got it"), skip via the SAME ride-off
      // as a swipe (page1Pull.commit → pullY rides to screenH, the card
      // drops, then promote) so the button and the gesture are identical.
      onDecline={() => { if (skipHintAcked) page1Pull.commit(); else { tap(); setSkipHintOpen(true) } }}
      busy={busy}
      acceptLoading={busy && pendingKey === 'invite-confirm'}
      footerInset={bottomInset}
    />
  ) : null

  // Page2 pending-invite card — sits at the TOP of the page2 MatchCard
  // (topBlock), mirroring how InviteTimerCard sits on the page1 sent-invite
  // card. StatusCard scaffold, no standalone heading (the title rides as a
  // bold lead-in inside the body via StatusCardText), accept CTA + decline
  // secondary inside the card. The countdown rides under the invite tab
  // label (see inviteTabSubLabel above). The decline button opens the same
  // refuse-confirm dialog as the swipe-down gesture (page2Pull below).
  const replyingInviteCard = page2PendingInvite ? (
    <ReplyingInviteCard
      title={tg('home.replyingTitle', page2PendingInvite.is_male)}
      description={tgg('home.replyingDesc', isMale, page2PendingInvite.is_male)}
      acceptLabel={t('home.replyingAccept')}
      declineLabel={t('home.watchingReject')}
      // While broadcasting, accepting an invitation is free (the user already
      // paid 2 stars to broadcast). The badge stays — it shows 0, not hidden —
      // so the user sees it costs nothing. Server enforces the same 0 cost
      // (app_approve, same 30m window as broadcastActive).
      costCredits={broadcastActive ? 0 : CREDIT_COST.approve}
      affordable={broadcastActive || starsBalance >= CREDIT_COST.approve}
      onUnaffordable={() => { tap(); setInsufficientCost(CREDIT_COST.approve) }}
      onAccept={() => runAction('app/approve', 'replying-accept')}
      onDecline={openRefuseConfirm}
      busy={busy}
      acceptLoading={busy && pendingKey === 'replying-accept'}
    />
  ) : null

  // Hero-photo overlay button on the page1 MatchCard:
  //   - watching → default heart (omit actions → MatchCard falls back).
  //   - chat     → X menu (opens end-chat / block / report sheet).
  //   - else (waiting, ended) → no button at all. The relevant action for
  //     those states lives elsewhere (timer's cancel, message-block's
  //     continue), so a heart on the hero would just be noise.
  const page1CardActions: CardAction[] | undefined =
    state === 'chat'
      ? [{
          key: 'chat-menu',
          icon: <CloseBoldIcon color={PRIMARY} stroke={WHITE} size={ICON.huge} />,
          onPress: () => { tap(); setChatMenuOpen(true) },
        }]
      : state === 'watching'
        ? undefined
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

  const goToPreferences = () => {
    goToPane(SETTINGS_PANE)
  }

  // v3: synth state is null for both `free` (find ran, no candidate) and `locked`
  // without message (brand-new user, or post-clear). Only the latter is "ready to
  // find" — when state is `free` we surface the no-one-nearby + Search Preferences UI.
  // Never offer the find/play button while geo-gated — the server returns no
  // candidates for a gated user anyway, so the button would be a dead end.
  const isReadyToFind = !geoGated && state === null && rawPage1State !== 'free'
  const isPermMode = showNotifOverlay || (state !== 'chat' && (showLocOverlay || locFailed || isNetMode))

  const permTitle = showNotifOverlay
    ? (notifPerm === 'denied' ? t('home.emptyNotifBlockedTitle') : state !== null ? tg('home.notifPromptWithMatchTitle', isMale) : t('home.notifPromptTitle'))
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationUnavailableTitle') : locPerm === 'denied' ? t('home.emptyLocationBlockedTitle') : state !== null ? t('home.locationPromptWithMatchTitle') : t('home.locationPromptTitle'))
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
  const centerNotice: { text: string; icon: ReactNode; onPress?: () => void; busy?: boolean; disabled?: boolean } | null =
    isPermMode
      ? {
          text: permTitle,
          icon: showNotifOverlay
            ? <BellIcon color={PRIMARY} size={64} />
            : (showLocOverlay || locFailed)
              ? <MapPinIcon color={PRIMARY} size={64} />
              : <WifiOffIcon color={PRIMARY} size={64} />,
          onPress: permOnConfirm,
          busy: permBusyState,
        }
      : geoGated
        ? (availability?.state === 'not_yet'
            ? { text: t('home.geoGate.notYet').replace('{date}', gateWhenStr), icon: <InboxIcon color={PRIMARY} size={64} />, disabled: true }
            : availability?.reason === 'push'
              // notif perm IS granted but the server still push-gates (dead
              // Expo token): nudge the user to re-enable / reopen.
              ? { text: t('home.notifPromptTitle'), icon: <BellIcon color={PRIMARY} size={64} />, onPress: handlePermissionRequest, busy: permBusy }
              : availability?.join_requested
                ? { text: t('home.joinGate.waitingText'), icon: <InboxIcon color={PRIMARY} size={64} />, disabled: true }
                : availability?.reason === 'group'
                  ? { text: t('home.joinGate.requestText'), icon: <MailIcon color={PRIMARY} size={64} />, onPress: runJoinRequest, busy: joinBusy }
                  // old server (no reason) / any other unavailable → keep the
                  // pre-existing geo copy, no action.
                  : { text: t('home.geoGate.unavailable'), icon: <InboxIcon color={PRIMARY} size={64} />, disabled: true })
        : null

  // Tab strip content — single source of truth for the three pane titles
  // and their inline chips (chat unread / viewer count / pending-invite
  // alert). Page chrome lives here; individual panes render content only.
  const watchersCount = watchers?.length ?? 0
  // Pending-invite countdown rendered as a small clock directly under the
  // invite tab's label. Replaces the old in-button timer footer; the bottom
  // button on the page2 invite card is now a single full-width "accept" CTA
  // with no timer of its own (decline is via swipe-down on the card).
  const inviteSecsLeft = useSecsLeft(!chatAvailable ? page2PendingInvite?.expires_at : null)
  // Once an incoming invitation expires (page2 transitions to locked +
  // message='expire'), keep the tab-strip clock frozen at 00:00 instead of
  // disappearing. Stays until the user acknowledges via clear2. Does not
  // apply to broadcast — its cooldown label is handled separately below.
  const page2ExpiredInvite = !chatAvailable && page2DeadInvite?.message === 'expire'
  const inviteTabSubLabel = !chatAvailable && page2PendingInvite?.expires_at
    ? formatClock(inviteSecsLeft)
    : page2ExpiredInvite
      ? formatClock(0)
      : undefined
  // Symmetric treatment for the page1 inviter side: when the user has sent
  // an invitation and is waiting, the same countdown rides under the Once
  // (home) tab label. The cancel button below stays plain — no embedded
  // timer footer.
  //
  // Reveal sequence on a `watching → waiting` transition (i.e. the user just
  // pressed "send invite"): the button spinner runs during the server call,
  // then MatchCard slides the InviteTimerCard topBlock in from above (with a
  // scroll-to-top first if needed). We hold the tab chip back until MatchCard
  // signals that the slide-in landed (`onTopBlockShown`), so the four steps
  // read sequentially: spinner → top card appears → smooth scroll/reveal →
  // tab clock fades in. On any other path into `waiting` (cold mount, app
  // focus while already waiting) the chip is visible from frame 1.
  const waitingExpiresAt = displayedCardMode === 'waiting' ? inviteExpiresAt ?? null : null
  const waitingSecsLeft = useSecsLeft(waitingExpiresAt)
  const prevCardModeRef = useRef(displayedCardMode)
  const [waitingChipReady, setWaitingChipReady] = useState(displayedCardMode === 'waiting')
  useEffect(() => {
    const prev = prevCardModeRef.current
    prevCardModeRef.current = displayedCardMode
    if (displayedCardMode !== 'waiting') {
      setWaitingChipReady(false)
      return
    }
    if (prev === 'waiting') return
    if (prev === 'watching') {
      // Wait for MatchCard's slide-in completion callback below.
      setWaitingChipReady(false)
      return
    }
    setWaitingChipReady(true)
  }, [displayedCardMode])
  const handleTopBlockShown = useCallback(() => setWaitingChipReady(true), [])
  // Symmetric to page2ExpiredInvite: once the user's outgoing invitation
  // expires (page1 transitions to locked + message='expire' → displayedCardMode
  // becomes 'missed'), keep the home-tab clock frozen at 00:00. Stays until
  // the user acknowledges via clear1.
  const page1ExpiredInvite = displayedCardMode === 'missed' && invitedPage1?.message === 'expire'
  const homeTabSubLabel = waitingExpiresAt && waitingChipReady
    ? formatClock(waitingSecsLeft)
    : page1ExpiredInvite
      ? formatClock(0)
      : undefined
  // Unread-chat count chained into the side-tab label as `${label} ${n}` when
  // chat is the active surface. Viewer-count is intentionally NOT chained on
  // the viewers/broadcast labels — the bare word reads cleaner at tab size,
  // and the broadcast state instead surfaces a flashing green "live" dot via
  // `renderLeading` below.
  const sideTabCount = chatAvailable && chatUnread > 0 ? chatUnread : 0
  const sideAlerting = chatAvailable
    ? chatUnreadAlerting
    : (page2PendingInvite ? page2Alerting : false)
  // While the profile preview sheet (opened from Menu) is up, the Menu tab
  // doubles as the close affordance — render an X icon and clear the
  // game-mode dot (irrelevant in that state). Tap handler below closes the
  // sheet on any tab tap (and navigates to the tapped pane for the others).
  // Inviter's name on page2 (stripped of trailing ", age") for the side-tab
  // label when an incoming invitation is pending. Same one-on-one framing as
  // matchName above: the tab reads as "you and this person", not a generic
  // "Invitation" / "Viewers".
  const page2InviteName = nameFromTitle(page2PendingInvite?.title)
  const page2DeadName = nameFromTitle(page2DeadInvite?.title)
  // Side-tab label resolves to the single counterpart's name whenever slot 2
  // is dedicated to one user (pending inviter, or the user whose dead-invite
  // "what happened" card is up). Chat falls through to the static `home.tabs.chat`
  // label since the chat pane already shows the partner's name in its own header.
  const sideTabName = page2PendingInvite
    ? page2InviteName
    : page2DeadInvite
      ? page2DeadName
      : ''
  // Side tab is in ambient self-visibility mode (no 1:1 counterpart, not in
  // chat, not geo-gated) — the only context where switching hidden/visible/
  // broadcast is meaningful, so the only context the dropdown affordance
  // exists. The caret on the glyph (and tap-to-open) only show while that
  // tab is the SELECTED pane (user: "when tab2 is selected").
  const sideVisibilityAffordance = !sideTabName && !chatAvailable && !geoGated
  const showVisibilityCaret = sideVisibilityAffordance && paneIndex === PAGE2_PANE
  // Auto-close the dropdown if its context disappears (an invite arrives,
  // chat starts, geo-gate flips, or the user swipes off the side pane) so a
  // stale menu can never linger over an unrelated screen.
  useEffect(() => {
    if (visibilityMenuOpen && (!sideVisibilityAffordance || paneIndex !== PAGE2_PANE)) {
      setVisibilityMenuOpen(false)
    }
  }, [visibilityMenuOpen, sideVisibilityAffordance, paneIndex])
  // Viewer-count number rendered above the collapsed side icon, in the EXACT
  // slot the live timer uses (`subLabel`). Only in the ambient icon-only
  // side states — broadcast / visible: chat has no viewer list, the labeled
  // pending/dead-invite states own the slot with their timer, and hidden
  // kicks every watcher so the count is 0 there anyway (so `> 0` already
  // excludes it, no explicit hidden guard needed).
  const showViewerCount = !sideTabName && !chatAvailable && watchersCount > 0
  // Rising viewer count → the side tab's short 2-blink attention pulse
  // (TAB.viewerPulseCount). Increase-only; a viewer leaving is not an
  // attention event. Same coalescing/timeout pattern as the chat-unread
  // pulse: a burst of new viewers within the window reads as one double-tick.
  // Reads sideTabName/chatAvailable from closure (single-dep, like
  // prevChatUnreadRef) so it can't re-fire on unrelated tab-state churn.
  useEffect(() => {
    const prev = prevWatchersCountRef.current
    prevWatchersCountRef.current = watchersCount
    if (prev === null) return
    if (watchersCount > prev && !sideTabName && !chatAvailable) {
      setViewersAlerting(true)
      const timer = setTimeout(() => setViewersAlerting(false), TAB.viewerPulseTimeoutMs)
      return () => { clearTimeout(timer); setViewersAlerting(false) }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchersCount])
  // Stars-balance change (grant, spend, refund) → blink the Menu-tab stars
  // marking 3× (the default `alerting` count) and surface a signed delta
  // next to the count. ANY change (up or down) is an attention event here,
  // unlike the increase-only viewer pulse. Baseline-null so the first
  // observed balance (cold mount) doesn't pulse. Single-dep on the numeric
  // balance + pulseTimeoutMs coalescing so a burst within the window reads
  // as one pulse; the cleanup clears the delta so it FadeOuts after the blink.
  useEffect(() => {
    const prev = prevStarsBalanceRef.current
    prevStarsBalanceRef.current = starsBalance
    if (prev === null || starsBalance === prev) return
    const d = starsBalance - prev
    // No number element: just recolour the star (green added / red removed)
    // for the blink window, then revert.
    setStarsChangePositive(d > 0)
    setStarsChangeActive(true)
    setStarsAlerting(true)
    const timer = setTimeout(() => {
      setStarsAlerting(false)
      setStarsChangeActive(false)
    }, TAB.pulseTimeoutMs)
    return () => {
      clearTimeout(timer)
      setStarsAlerting(false)
      setStarsChangeActive(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starsBalance])
  // Game-mode pause/resume, now hosted ON the Home tab (the settings button
  // was removed). The hook is the single source of truth for the
  // resume/pause/confirm decision (was the settings GameModeCard's inline
  // logic). While watching a candidate, a pause glyph rides after the name
  // (tap → app/pause, with the destructive-ripple confirm when one applies);
  // while paused, the same control becomes a centred resume/play glyph that
  // stands in for the faded-out "Once" wordmark (tap → app/resume). It is
  // hidden in every transient state the hook flags inert (outgoing waiting /
  // incoming pending / live chat) — those panes own their own resolution.
  const gameMode = useGameMode()
  const showHomePauseGlyph = gameMode.visible && state === 'watching'
  const showHomeResumeGlyph = gameMode.visible && gameMode.paused
  const tabSpecsAll: TabSpec[] = [
    // Menu tab is icon-only (no label) — it's chrome, not a destination, so
    // it shrinks to its glyph width and yields the freed flex space to the
    // two content tabs (Home + Side). The settings glyph stays the SAME in
    // every state, INCLUDING pause (per the user: pause is signalled on the
    // Home tab word "Once"→"פאוזה", not by morphing this glyph). The only
    // swap is close-X while the profile-preview sheet is open over the menu
    // pane (that is the sheet's close affordance, not a "state").
    {
      renderIndicator: profileSheetOpen
        ? (color) => <CloseBoldIcon color={color} size={ICON.xxl} />
        : (color) => <HamburgerIcon color={color} size={ICON.xxl} />,
      // Stars balance rides above the Menu glyph in the EXACT slot the side
      // tab's viewer-count uses. On a wallet change the star glyph itself
      // recolours green (added) / red (removed) for the blink window — no
      // number element. Suppressed while the profile-preview sheet is open
      // (Menu is then the close-X affordance), change-pulse gated the same.
      subLabel: profileSheetOpen ? undefined : String(starsBalance),
      subLabelIcon: profileSheetOpen
        ? undefined
        : (color) => (
            <StarIcon
              color={starsChangeActive ? (starsChangePositive ? POSITIVE : NEGATIVE) : color}
              size={TAB.timerFontSize}
            />
          ),
      alerting: profileSheetOpen ? undefined : starsAlerting,
    },
    // Home tab. While the own-profile preview sheet rises it morphs
    // "Once" → "My profile" and (via tabProgress) the selected-chip slides
    // onto it from the Menu tab — both driven 1:1 by the sheet's position.
    // Orthogonally, while game mode is paused the BASE word fades out
    // (pauseProgress) and the INTERACTIVE resume glyph (accessory below)
    // takes its place — the profile-sheet morph still applies on top.
    {
      // While a rise is active hold the resting label to the OLD text, so
      // NO render (even a stray skip-branch one) can ever show the new name
      // at rest — it appears ONLY by sliding up from below (nameRiseTo).
      // After the rise completes riseFrom clears ⇒ label = homeTabLabel
      // (the new name) at rest, exactly where the slide ended (seamless).
      label: riseFrom != null ? riseFrom : homeTabLabel,
      // Pull-synced name SLIDE: while watching with a next card, the current
      // name slides DOWN and behindMatch's (the next card's) name slides in
      // from the TOP 1:1 with the skip pull. nameSwapProgress is page1Pull-
      // driven so it's 0 unless actively skipping. Cleared automatically
      // once promoted (pull resets to 0 and label becomes the next name).
      nameSwapProgress: isWatching && behindMatch ? nameSwapProgress : undefined,
      nameSwapNext: isWatching && behindMatch ? nameFromTitle(behindMatch.title) : undefined,
      // Rise-synced name SLIDE (mirror, opposite direction): on a fresh
      // search the OLD label (nameRiseFrom) slides UP/out and the new name
      // (nameRiseTo = the live homeTabLabel) enters from the BOTTOM, synced
      // to the card's SlideInDown. spec.label is held OLD above so the rise
      // pair is the ONLY place the new name can appear. The timing callback
      // clears riseFrom ⇒ back to the skip pair at rest.
      nameRiseProgress: isWatching ? riseSwap : undefined,
      nameRiseFrom: riseFrom ?? undefined,
      nameRiseTo: riseFrom != null ? homeTabLabel : undefined,
      subLabel: homeTabSubLabel,
      altLabel: t('settings.myProfile'),
      altProgress: profileSheetProgress,
      // The paused wordmark is replaced by the interactive accessory glyph,
      // so the morph draws NO built-in glyph — it only fades "Once" out as
      // pauseProgress→1; the centred PauseIcon takes over.
      pauseIcon: () => null,
      pauseProgress,
      // Game-mode glyph hosted on this tab (the settings button was removed).
      // ALWAYS a PauseIcon, passed as a colour function so TabStrip can give
      // it the SAME active(WHITE)/muted(WHITE_MID) cross-fade as the name —
      // its opacity is byte-identical to the wordmark in every state. While
      // watching it rides directly AFTER the name as one centred unit and the
      // WHOLE tab is the pause button (onAccessoryPress → hook, with its
      // confirm when a destructive ripple applies). While paused it's the
      // centred "you're paused" indicator standing in for the faded-out
      // "Once" and is deliberately NON-tappable (user decision 2026-05-19):
      // no onAccessoryPress ⇒ a tap on the tab is a plain navigate no-op.
      // Absent in every other state.
      accessory: (showHomePauseGlyph || showHomeResumeGlyph)
        ? (color) => <PauseIcon color={color} size={ICON.xxl} />
        : undefined,
      onAccessoryPress: showHomePauseGlyph ? gameMode.onPress : undefined,
      accessoryCenter: showHomeResumeGlyph,
    },
    (() => {
      // The side tab carries a full text label ONLY when slot 2 is dedicated
      // to a single counterpart — an incoming-invite card or a dead-invite
      // "what happened" card (sideTabName is that person's name). In every
      // ambient state (live chat, or self-visibility: broadcast / visible /
      // hidden) there's no 1:1 counterpart to name, so the tab collapses to
      // an icon-only compact tab exactly like Menu: it shrinks to its glyph
      // width (TabStrip flags iconOnly whenever there's no label — a
      // sub-label no longer forces flex), freeing flex so "Once" recenters
      // between the two compact end tabs. The expand/collapse + recentre is
      // animated by TabStrip itself (LinearTransition on every tab,
      // TAB.collapseDuration). The icon is shared with the in-page
      // VisibilityToggle via VISIBILITY_ICON so a state always reads as the
      // same glyph; chat gets its own bubble.
      //
      // `showViewerCount` (broadcast / visible with watchers): the count
      // rides as a `subLabel` number above the icon — same slot the live
      // timer uses on the labeled branch — without widening the still-compact
      // tab. A rising count fires the short 2-blink `alerting`
      // (TAB.viewerPulseCount) via `viewersAlerting`; chat-unread keeps the
      // default 3-blink `sideAlerting`.
      if (!sideTabName) {
        return {
          renderIndicator: chatAvailable
            ? (color) => <ChatIcon color={color} size={ICON.xxl} />
            : (color) => <VisibilityTabGlyph color={color} mode={toggleMode} showCaret={showVisibilityCaret} />,
          subLabel: showViewerCount ? String(watchersCount) : undefined,
          alerting: showViewerCount ? viewersAlerting : sideAlerting,
          alertCount: showViewerCount ? TAB.viewerPulseCount : undefined,
          // While broadcasting the megaphone breathes (gentle heartbeat) to
          // signal "you're live" — but only while the side tab isn't the
          // selected pane (TabStrip gates it by selectedness).
          indicatorPulsing: broadcastActive,
          // Fade the whole side tab out 1:1 as the profile-preview sheet
          // rises (same shared value that morphs "Once"→profile + slides the
          // chip), so it disappears in sync with the close-button transition.
          dimProgress: profileSheetProgress,
        } satisfies TabSpec
      }
      return {
        label: sideTabCount > 0 ? `${sideTabName} ${sideTabCount}` : sideTabName,
        alerting: sideAlerting,
        subLabel: inviteTabSubLabel ?? undefined,
        // Same as the ambient branch: the side tab (label + countdown) fades
        // out 1:1 with the profile-preview sheet so it vanishes in sync with
        // the close-button transition.
        dimProgress: profileSheetProgress,
      } satisfies TabSpec
    })(),
  ]
  // While geo-gated, drop the side tab entirely so page2/chat has no entry
  // point. Indices 0/1 still map to Menu/Home (TabStrip onSelect(i) →
  // goToPane(i)), so the remaining tabs keep working unchanged.
  const tabSpecs: TabSpec[] = geoGated ? tabSpecsAll.slice(0, 2) : tabSpecsAll

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
      setReadyHeadlineIdx(prev => pickReadyHeadline(prev))
    }
    prevShowReadyHeadline.current = showReadyHeadline
  }, [showReadyHeadline])
  // The geo-gate message takes the rotating-headline slot and overrides every
  // other home-pane line (locating / ready / no-one-nearby). 'not_yet' and
  // 'unavailable' get distinct copy; the find button is already suppressed
  // (isReadyToFind === false) and the side tab removed (tabSpecs below).
  const headlineText = centerNotice
    ? centerNotice.text
    : isLoadingProfileHeadline
      ? t('home.loadingProfile')
      : isLocatingHeadline
        ? t('home.locatingDesc')
        : isEmptyHeadline
          ? ''
          : showReadyHeadline
            ? genderize(READY_HEADLINES[readyHeadlineIdx] ?? '', isMale)
            : t('home.noOneNearbyTitle')

  // PagerView onPageScroll drives the TabStrip indicator each frame. Runs on
  // the UI thread (worklet) so the underline tracks the swipe 1:1 instead of
  // lagging behind through a JS→UI bridge hop.
  const onPageScroll = usePagerScrollHandler({
    onPageScroll: (e) => {
      'worklet'
      pagerProgress.value = e.position + e.offset
    },
  })

  // Confirm-popup configs for the two visibility-toggle popups, sourced
  // from the shared `visibilityConfirms` module so the equivalent popup
  // on the settings Pause button stays in lockstep on a single edit.
  const exitBroadcastConfig = exitBroadcastConfirm()
  const hideConfirmConfig = hideProfileConfirm()

  // ONE card renderer for the whole live-interaction stack — used for BOTH
  // the deck's static behind card and the interactive focus card, and across
  // watching → waiting → chat for the SAME person. The element TREE it
  // produces is BYTE-IDENTICAL regardless of `interactive` (same wrapper
  // types, same nesting, the inner pull-wrapper Animated.View ALWAYS present)
  // — only styles/props differ. That invariance is load-bearing: React
  // reconciles by key, so the survivor of a deck pop (behind → focus) and a
  // card whose state advances (watching front → waiting) keep their exact
  // element identity ⇒ MatchCard does NOT remount ⇒ no image re-decode
  // flicker, and the invite timer animates IN via MatchCard's own
  // onTopBlockShown instead of the card vanishing/reappearing. The pull
  // self-translate is applied ONLY to the interactive card while watching
  // (liveTopId gates which one actually follows the finger). Behind /
  // waiting / chat pass no transform (static).
  //
  // `animateEnter` controls ONLY the first-mount rise: when true the focus
  // card SlideInDown-rises (a genuine in-session fresh search). The local
  // LayoutAnimationConfig overrides the root + stack `skipEntering` (same
  // documented trick RisingCard uses for the iOS/New-Arch skip leak); when
  // false it keeps `skipEntering` so the card is static (cold-start first
  // paint, and the behind card — which must never rise). Because the focus
  // element is reconciled by key (never remounts on skip-advance or
  // watching→waiting), `entering` only ever fires on a true fresh mount.
  const renderStackCard = (
    m: Profile,
    interactive: boolean,
    animateEnter: boolean,
  ) => (
    <LayoutAnimationConfig key={m.user_id} skipEntering={!animateEnter}>
    <Animated.View
      style={[styles.matchCardWrap, StyleSheet.absoluteFill]}
      pointerEvents={interactive ? 'box-none' : 'none'}
      entering={animateEnter ? SlideInDown.duration(MOTION.base) : undefined}
    >
      <Animated.View
        style={[
          styles.matchCardWrap,
          interactive && isWatching ? frontPullStyle : undefined,
        ]}
      >
        <View style={styles.matchPhoto}>
          <MatchCard
            ref={interactive ? watchingCardRef : undefined}
            match={m}
            viewerFamily={profile?.family ?? null}
            viewerLocationType={resolveLocationType(profile)}
            bottomInset={0}
            hideTime={state === 'chat'}
            actions={interactive ? page1CardActions : undefined}
            // Report rides on EVERY card, always — exactly like the default
            // heart (user: "the report button must stay attached to the
            // card like the heart; it must not pop in only when the card
            // gets focus"). NOT gated by `interactive`: the behind card
            // renders it too (it's pointerEvents:none + covered while
            // behind, so harmless there), so when it promotes to focus the
            // flag is ALREADY in this same persistent MatchCard's action
            // stack ⇒ zero pop-in. In watching page1CardActions is
            // undefined ⇒ both cards' stack is [heart, report], identical
            // through the promote.
            onReport={() => openReport(m.user_id)}
            topBlock={
              interactive && state === 'waiting' && inviteExpiresAt ? (
                <InviteTimerCard
                  targetIsMale={matchIsMale}
                  userIsMale={isMale}
                  onCancel={() => { tap(); setCancelConfirmOpen(true) }}
                />
              ) : undefined
            }
            onTopBlockShown={interactive ? handleTopBlockShown : undefined}
            footerBlock={interactive ? watchingInviteButton : undefined}
            footerBg={interactive && watchingInviteButton ? PRIMARY : undefined}
          />
        </View>
      </Animated.View>
    </Animated.View>
    </LayoutAnimationConfig>
  )

  return (
    <View style={styles.backdrop}>
      {/* Paused state recolors the top chrome (status bar + TabStrip) from
          the warm gradient shelf to flat BLACK_MID so the whole header reads
          as "muted" without going as dark as the round pause overlay button.
          The status bar can't take a gradient (Android), so it tracks the
          gradient's PRIMARY 0% stop when active. Always render (not
          gated on gameModeOff) so the value switches both ways: a gated mount
          would leave the status bar stuck after resume, since expo-status-bar
          applies its value imperatively and never restores prior values on
          unmount. */}
      <AppStatusBar backgroundColor={gameModeOff ? BLACK_MID : PRIMARY} />
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <View
          style={[
            styles.tabStripContainer,
            // XL (not MD) above the safe inset so the sub-label timer, which
            // floats as a caption above the selected-tab chip, has real
            // breathing room and never sits jammed against the status bar.
            { paddingTop: topInset + XL },
            // Paused: swap the solid deep-wine for the flat muted BLACK_MID
            // chrome. No shadow either way — the header is intentionally flat
            // (the user removed the drop-shadow); the color contrast against
            // the white content below is the only separation.
            gameModeOff && { backgroundColor: BLACK_MID },
          ]}
          onLayout={e => {
            const bottom = e.nativeEvent.layout.y + e.nativeEvent.layout.height
            tabStripBottom.value = bottom
            setHeaderBottomPx(prev => (Math.abs(prev - bottom) > 0.5 ? bottom : prev))
          }}
        >
          <TabStrip tabs={tabSpecs} progress={tabProgress} onSelect={(i) => {
            // While the preview sheet is up, the ONLY actionable chrome is
            // the Menu tab (rendered as an X) — it closes the sheet, no
            // navigation. The middle tab is a passive "My profile" label
            // for the open sheet and the side tab is inert: only X closes.
            if (profileSheetOpen) {
              if (i === SETTINGS_PANE) closeProfileSheet()
              return
            }
            // Tapping the side tab while it's ALREADY the selected pane and
            // in ambient self-visibility → open/close the visibility
            // dropdown (replaces the old segmented toggle). A first tap
            // (not yet selected) just navigates there; the next tap opens it.
            if (i === PAGE2_PANE && paneIndexRef.current === PAGE2_PANE && sideVisibilityAffordance) {
              tap()
              setVisibilityMenuOpen(o => !o)
              return
            }
            if (visibilityMenuOpen) setVisibilityMenuOpen(false)
            goToPane(i as PaneIndex)
          }} />
        </View>
        {/* Pass pages as an array to avoid React 19 falsy-children issues
            with react-native-pager-view's childrenWithOverriddenStyle. */}
        <AnimatedPagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          // Clamp the seed page when gated: the side slot doesn't exist while
          // gated (2-child pager), so a stale chat/page2 notification must not
          // try to seat the pager on a non-existent index 2.
          initialPage={geoGated ? Math.min(initialPane, HOME_PANE) : initialPane}
          // Geo-gated: the pager stays swipeable so Home<->Menu(settings) keeps
          // working by swipe (the user must still reach settings while waiting
          // for launch). The side slot is made unreachable by NOT rendering it
          // at all (the children array drops slot 2 when geoGated, see below).
          // react-native-pager-view has no per-page swipe lock, so a 3-child
          // pager always lets a finger reach slot 2 — onPageSelected can only
          // bounce it back *after* it's already on screen, which still reads
          // as "accessible". Removing the child is the only way to make
          // page2/chat truly inaccessible. Its tab is also removed (tabSpecs)
          // and goToPane swallows programmatic nav to it.
          scrollEnabled={!sliding}
          overdrag={false}
          overScrollMode="never"
          onPageSelected={onPageSelected}
          onPageScroll={onPageScroll}
        >
          {[
            // Slot 0: settings (menu) — embedded mode hides the internal
            // ScreenHeader so the global TabStrip is the only chrome.
            <View key="settings" style={{ flex: 1 }}>
              <SettingsPage embedded topInset={0} onOpenSubPage={openShellSubPage} onNavigateHome={() => goToPane(HOME_PANE)} />
            </View>,

            // Slot 1: home (page1 — outgoing)
            <View key="home" style={{ flex: 1 }}>
              <View style={styles.root}>
                <View style={{ flex: 1 }}>
                  {/* Empty / no-match pane — always mounted underneath. The
                      match pane sits on top with a transparent inner card,
                      so when the match Animated.View slides off-screen the
                      empty pane is revealed (along with the searching UI
                      during a card transition). */}
                  <View
                    style={StyleSheet.absoluteFill}
                    pointerEvents={showHiddenPlaceholder ? 'auto' : 'none'}
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
                      <View style={styles.permFlexSpacer} />
                      <View pointerEvents="box-none" style={styles.permCenterGroup}>
                        <HeadlineArea text={headlineText} />
                        <View style={styles.permAvatarWrap}>
                          <AvatarHaloRings />
                          <RadarRings active={startupCompleted && (focusInflight || searching)} />
                          <Pressable
                            onPress={() => {
                              if (centerNotice) {
                                if (!centerNotice.disabled && !centerNotice.busy) centerNotice.onPress?.()
                                return
                              }
                              if (isReadyToFind) {
                                runFind()
                                return
                              }
                              tap()
                              if (page1Profile) {
                                openProfileSheet()
                              } else {
                                goToPreferences()
                              }
                            }}
                            disabled={centerNotice
                              ? (!!centerNotice.disabled || !!centerNotice.busy || !centerNotice.onPress)
                              : (isReadyToFind && (busy || locFetching || startupInflight || focusInflight || searching || !startupCompleted))}
                            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                          >
                            {centerNotice ? (
                              <View style={[styles.permAvatar, styles.permSlidersButton]}>
                                {centerNotice.icon}
                              </View>
                            ) : isReadyToFind ? (
                              <View style={[styles.permAvatar, styles.permPlayButton]}>
                                <Svg width={64} height={64} viewBox="0 0 24 24" fill={PRIMARY}>
                                  <Path d="M8 5v14l11-7z" />
                                </Svg>
                              </View>
                            ) : page1Profile ? (
                              avatarDisplayUrl ? (
                                <Image source={{ uri: avatarDisplayUrl }} placeholder={avatarPlaceholder} style={styles.permAvatar} contentFit="cover" cachePolicy="memory-disk" />
                              ) : (
                                <View style={[styles.permAvatar, styles.permAvatarFallback]} />
                              )
                            ) : (
                              <View style={[styles.permAvatar, styles.permSlidersButton]}>
                                <HamburgerIcon color={PRIMARY} size={64} />
                              </View>
                            )}
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.permFlexSpacer} />
                    </View>
                  </View>

                  {/* Pull-to-skip. PullPane frames the coral wake + the
                      match card on its pull transform; page1 supplies its
                      PullContext (inner-scroll coordination) and the hidden
                      preloader as the non-translated `extra` slot. The empty
                      pane stays a separate sibling behind this. */}
                  <PullPane
                    gesture={page1Pull.gesture}
                    pullY={page1Pull.pullY}
                    pulling={page1Pull.pulling}
                    /* No `wakeLabel` ⇒ PullPane renders NO dynamic full-
                       screen wake. There is also NO strip above the card
                       (user: deleted entirely). The only skip feedback is
                       the card itself sliding down via frontPullStyle — no
                       background / gradient / banner behind or above it. */
                    tutorialPlaying={page1Pull.tutorialPlaying}
                    pointerEvents={showHiddenPlaceholder ? 'none' : 'box-none'}
                    cardStyle={styles.matchCardWrap}
                    pullContext={page1Pull.pullCtx}
                    // The local-deck FRONT self-translates (frontPullStyle)
                    // so a freshly-promoted card stays at rest while the
                    // outgoing one rides off — PullPane must not also
                    // translate the card. Wake + gesture still use pullY.
                    cardStatic
                    extra={preloadingMatch && preloadingMatch.user_id !== displayedMatch?.user_id ? (
                      <View style={styles.preloaderWrap} pointerEvents="none">
                        <View style={styles.matchPhoto}>
                          <MatchCard
                            match={preloadingMatch}
                            viewerFamily={profile?.family ?? null}
                            viewerLocationType={resolveLocationType(profile)}
                            bottomInset={0}
                            onReady={() => onPreloadReady(preloadingMatch.user_id)}
                          />
                        </View>
                      </View>
                    ) : null}
                  >
                    {/* Unified live-interaction stack. Both cards are keyed
                        by user_id and produced by the SAME byte-identical
                        renderStackCard, so a deck pop (behind→focus) and an
                        invite (watching front → waiting, same person)
                        preserve element identity ⇒ MatchCard never remounts:
                        no new-card flicker, and the invite timer animates IN
                        via MatchCard's own onTopBlockShown instead of the
                        card vanishing/reappearing. Each card owns its own
                        LayoutAnimationConfig: the BEHIND card and the cold-
                        start first focus stay static (skipEntering — also the
                        documented Fabric mount-race fix); a genuine
                        in-session fresh-search focus mount SlideInDown-rises
                        (firstPaintDoneRef gates out the cold start). The
                        skip-advance / watching→waiting focus never remounts,
                        so it never re-rises.

                        The BEHIND card is WITHHELD while the first card is
                        rising (`riseFrom != null` ≡ a fresh-search first
                        card mid-rise, set on the isWatching edge, cleared at
                        rise end). Otherwise it mounts statically at full
                        position simultaneously with the rising focus card
                        and is briefly VISIBLE behind it ("you see the next
                        card for a moment, then the first rises"). Suppressed
                        during the rise ⇒ only the first card rises, covering
                        the empty pane (headline + big button); the moment it
                        settles (opaque, full-screen) the behind card mounts
                        behind it — invisible, ready for the next skip. */}
                    {isWatching && behindMatch && !noticeOverridesCard && riseFrom == null
                      ? renderStackCard(behindMatch, false, false)
                      : null}
                    {focusMatch && !noticeOverridesCard
                      ? renderStackCard(focusMatch, true, firstPaintDoneRef.current)
                      : null}
                    {/* Ended / locked "what happened" interrupt card — the
                        only single-card state NOT in the unified stack
                        (focusMatch is null for it). Keeps RisingCard's
                        SlideOutDown so the interrupt card slides away on
                        clear1 (the documented first-card-stale behavior). */}
                    {!isWatching && !focusMatch && displayedMatch && !noticeOverridesCard ? (
                      <RisingCard
                        key={displayedMatch.user_id}
                        animateEnter={false}
                        style={styles.matchCardWrap}
                      >
                        <View style={styles.matchPhoto}>
                          <MatchCard
                            ref={watchingCardRef}
                            match={displayedMatch}
                            viewerFamily={profile?.family ?? null}
                            viewerLocationType={resolveLocationType(profile)}
                            bottomInset={0}
                            hideTime={state === 'chat'}
                            actions={page1CardActions}
                            onReport={() => openReport(displayedMatch.user_id)}
                            topBlock={
                              isEndedState && page1MessageTitle ? (
                                <EventMessageCard
                                  title={page1MessageTitle}
                                  description={page1MessageDesc}
                                  onContinue={() => runAction('app/clear1', 'ended-stop')}
                                  busy={busy && pendingKey === 'ended-stop'}
                                />
                              ) : undefined
                            }
                            onTopBlockShown={handleTopBlockShown}
                            footerBlock={watchingInviteButton}
                            footerBg={watchingInviteButton ? PRIMARY : undefined}
                          />
                        </View>
                      </RisingCard>
                    ) : null}
                  </PullPane>
                </View>

                <ConfirmDialog
                  visible={cancelConfirmOpen}
                  icon={<CloseBoldIcon color={PRIMARY} size={32} />}
                  title={t('home.cancelWaitingTitle')}
                  description={tgg('home.cancelWaitingDesc', isMale, matchIsMale)}
                  confirmLabel={t('home.cancelWaitingConfirm')}
                  onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                  onConfirm={runCancel}
                  busy={busy}
                  draggable
                />

                <ConfirmDialog
                  visible={refuseConfirmOpen}
                  icon={<CloseBoldIcon color={PRIMARY} size={32} />}
                  title={t('home.refuseReplyTitle')}
                  description={tg('home.refuseReplyDesc', page2InviteObj?.is_male ?? null)}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                  onConfirm={() => runAction('app/decline', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
                  busy={busy}
                  draggable
                />

                <ConfirmDialog
                  visible={skipHintOpen}
                  title={t('home.skipHintTitle')}
                  description={t('home.skipHintDesc')}
                  icon={<ChevronDownIcon color={PRIMARY} size={32} />}
                  // Secondary "got it": acknowledge the hint and scroll the
                  // card back to the top so the user can perform the
                  // swipe-down-to-skip gesture they were just taught (pull-
                  // to-skip is gated on the inner scroll being at the top).
                  cancelLabel={t('home.skipHintCancel')}
                  // Primary: just skip now.
                  confirmLabel={t('home.skipHintConfirm')}
                  onCancel={() => {
                    if (busy) return
                    setSkipHintOpen(false)
                    // Remember the acknowledgement: next "not now" skips
                    // directly and this popup never opens again. Still
                    // scrolls the card to top (the taught gesture is armed).
                    setSkipHintAcked(true)
                    markSeenFlag(SEEN_FLAGS.skipHintAck).catch(() => {})
                    watchingCardRef.current?.scrollToTop()
                  }}
                  onConfirm={() => {
                    setSkipHintOpen(false)
                    // Same ride-off as a swipe (not a bare runIgnore that
                    // would advance with no card-down motion).
                    page1Pull.commit()
                  }}
                  busy={busy}
                  draggable
                />

                {/* Not-enough-stars explainer. Reuses the one ConfirmDialog
                    component (DRY): star icon, title, cost-aware description,
                    single "got it" button. Opened by tapping an action the
                    user can't afford (invite / approve / broadcast). */}
                <ConfirmDialog
                  visible={insufficientCost != null}
                  icon={<StarIcon color={PRIMARY} size={32} />}
                  title={t('stars.insufficient.title')}
                  description={t('stars.insufficient.desc').replace('{stars}', starsText(insufficientCost ?? 0))}
                  confirmLabel={t('common.gotIt')}
                  onConfirm={() => setInsufficientCost(null)}
                />

                <ConfirmDialog
                  visible={!!removeWatcherTarget}
                  icon={<CloseBoldIcon color={PRIMARY} size={32} />}
                  title={t('home.removeWatcherTitle')}
                  description={tgg('home.removeWatcherDesc' as any, isMale, removeWatcherTarget?.is_male ?? null)}
                  confirmLabel={t('home.removeWatcherConfirm')}
                  onCancel={() => { if (!removeWatcherBusy) setRemoveWatcherTarget(null) }}
                  onConfirm={async () => {
                    if (!removeWatcherTarget || removeWatcherBusy) return
                    setRemoveWatcherBusy(true)
                    try {
                      await invoke('app/remove', { user_id: removeWatcherTarget.user_id })
                    } catch (e) {
                      console.error(e)
                    } finally {
                      setRemoveWatcherBusy(false)
                      setRemoveWatcherTarget(null)
                    }
                  }}
                  busy={removeWatcherBusy}
                  draggable
                />

                {/* The permission ConfirmDialog popup was removed: the
                    missing-permission / gate UI now lives inline as the home
                    pane's centerNotice (HeadlineArea text + the round center
                    icon-as-action-button), and is mirrored on page2. See
                    `centerNotice` and `noticeOverridesCard`. */}

                {/* Chat-state actions menu (opened from the MatchCard X
                    button). Exactly two rows, each with its own glyph: end
                    chat (leave) and block. Report is a card-level affordance,
                    not here. paddingBottom = safe-area bottom + MD so the
                    last row sits clear of the home-indicator gesture area. */}
                <BottomSheet
                  visible={chatMenuOpen}
                  onDismiss={() => setChatMenuOpen(false)}
                  contentStyle={[chatMenuStyles.sheet, { paddingBottom: Math.max(bottomInset, SM) + MD }]}
                >
                  <Pressable
                    onPress={() => { tap(); setChatMenuOpen(false); setChatConfirmAction('leave') }}
                    style={({ pressed }) => [chatMenuStyles.row, pressed && chatMenuStyles.rowPressed]}
                  >
                    <View style={chatMenuStyles.rowInner}>
                      <SignOutIcon color={BLACK} />
                      <Text style={chatMenuStyles.label}>{t('chat.leave')}</Text>
                    </View>
                  </Pressable>
                  <View style={chatMenuStyles.divider} />
                  <Pressable
                    onPress={() => { tap(); setChatMenuOpen(false); setChatConfirmAction('block') }}
                    style={({ pressed }) => [chatMenuStyles.row, pressed && chatMenuStyles.rowPressed]}
                  >
                    <View style={chatMenuStyles.rowInner}>
                      <BlockIcon color={BLACK_STRONG} />
                      <Text style={[chatMenuStyles.label, chatMenuStyles.labelMid]}>{t('chat.block')}</Text>
                    </View>
                  </Pressable>
                </BottomSheet>

                <ConfirmDialog
                  visible={chatConfirmAction === 'leave'}
                  icon={<SignOutIcon color={PRIMARY} size={32} />}
                  title={t('home.leaveTitle')}
                  description={t('home.leaveDesc')}
                  confirmLabel={t('home.leaveConfirm')}
                  onCancel={() => setChatConfirmAction(null)}
                  onConfirm={async () => { setChatConfirmAction(null); await invoke('app/leave') }}
                  draggable
                />
                <ConfirmDialog
                  visible={chatConfirmAction === 'block'}
                  icon={<BlockIcon color={PRIMARY} size={32} />}
                  title={t('chat.blockTitle')}
                  description={t('chat.blockDesc')}
                  confirmLabel={t('chat.blockConfirm')}
                  onCancel={() => setChatConfirmAction(null)}
                  onConfirm={async () => { await invoke('app/block'); setChatConfirmAction(null) }}
                  draggable
                />
                {/* One shared report confirm for every match-card surface
                    (page1 + page2). The reported user id is whatever card's
                    flag was tapped; the server detects the relation surface
                    and tears it down + permanent-blocks the pair. */}
                <ConfirmDialog
                  visible={!!reportTargetId}
                  icon={<ShieldIcon color={PRIMARY} size={32} />}
                  title={t('chat.reportTitle')}
                  description={t('chat.reportDesc')}
                  noteInput={{
                    value: reportNote,
                    onChangeText: setReportNote,
                    placeholder: t('chat.reportPlaceholder'),
                  }}
                  confirmLabel={t('chat.reportConfirm')}
                  onCancel={() => { setReportTargetId(null); setReportNote('') }}
                  onConfirm={async () => {
                    const pid = reportTargetId
                    const note = reportNote.trim()
                    setReportTargetId(null)
                    setReportNote('')
                    if (pid) await invoke('app/report', { user_id: pid, reason: 'profile', note: note || undefined })
                  }}
                  draggable
                />

              </View>
            </View>,

            // Slot 2: side — page2 or chat depending on chatAvailable.
            // While geo-gated this slot is NOT rendered at all: the pager has
            // only [settings, home] children, so page2/chat is physically
            // unreachable by swipe (not bounced back after it's already shown)
            // while Home<->Menu keeps working. Spread an empty array, never a
            // falsy child — see the React-19 array-children note above.
            ...(geoGated ? [] : [
            <View key="side" style={{ flex: 1 }}>
              {chatAvailable ? (
                <ChatPage
                  key={profile?.relations?.match?.user_id ?? 'no-match'}
                  isActive={paneIndex === CHAT_PANE}
                  onUnreadChange={setChatUnread}
                  topInset={0}
                  autoFocusInput={chatJustStarted}
                />
              ) : (centerNotice && !page2PendingInvite) ? (
                /* Page2 display-hidden: a permission notice is active and
                   page2 isn't a pending incoming invite (those are kept).
                   Non-destructive — NO app_lock2 (no watcher kick / no
                   restriction); the viewers list is just suppressed behind
                   the same notice as page1 (identical text/icon/action via
                   the shared centerNotice). Auto-reverts the instant the
                   permission is granted (centerNotice → null). geoGated
                   never reaches here (the side slot is dropped entirely),
                   so this is the permission cases only. */
                <View style={styles.root}>
                  <View style={styles.permScreen}>
                    <View style={styles.permFlexSpacer} />
                    <View pointerEvents="box-none" style={styles.permCenterGroup}>
                      <HeadlineArea text={centerNotice.text} />
                      <Pressable
                        onPress={() => { if (!centerNotice.disabled && !centerNotice.busy) centerNotice.onPress?.() }}
                        disabled={!!centerNotice.disabled || !!centerNotice.busy || !centerNotice.onPress}
                        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                      >
                        <View style={[styles.permAvatar, styles.permSlidersButton]}>
                          {centerNotice.icon}
                        </View>
                      </Pressable>
                    </View>
                    <View style={styles.permFlexSpacer} />
                  </View>
                </View>
              ) : <View style={styles.root}>
                {/* Base layer — the viewers/visibility screen is ALWAYS
                    mounted so it persists in its exact state (broadcast /
                    visible / hidden) behind any invite card, and is revealed
                    UNCHANGED once a card is dismissed (after the PRIMARY wake
                    fades). Mirrors page1's always-mounted empty pane.
                    The 3-segment visibility toggle that used to be anchored
                    here was replaced by the dropdown on the side tab's
                    visibility glyph (see VisibilityMenu + handleVisibilitySelect);
                    this pane is now just the scrolling status card + watchers
                    list or telescope. */}
                <View style={{ flex: 1 }}>
                  {/* ONE persistent PullScrollView (was two branches). The
                      list container `watchersList` stays mounted across the
                      empty<->non-empty flip so Reanimated can play the LAST
                      viewer's exit (FadeOutUp) instead of the whole subtree
                      snapping away; the telescope cross-fades in (FadeIn)
                      while that last card lifts out. Cards animate add/remove
                      and reflow themselves (see WatcherCard). */}
                  <PullScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                    contentContainerStyle={[watchers.length > 0 ? styles.watchersScrollContent : styles.emptyScrollContent, { paddingBottom: Math.max(bottomInset, LG) }]}
                  >
                    <ViewersStatusCard
                      isHidden={isHidden}
                      broadcastActive={broadcastActive}
                      hasWatchers={watchers.length > 0}
                      userIsMale={isMale}
                      broadcastTimer={broadcastActive ? addCooldownLabel : null}
                    />
                    <View style={styles.watchersList}>
                      {watchers.map((w) => (
                        <WatcherCard
                          key={w.user_id}
                          watcher={w}
                          viewerFamily={profile?.family ?? null}
                          viewerLocationType={resolveLocationType(profile)}
                          onPress={() => { tap(); setRemoveWatcherTarget(w) }}
                        />
                      ))}
                    </View>
                    {watchers.length === 0 ? (
                      <Animated.View style={styles.telescopeWrap} entering={FadeIn.duration(MOTION.base)}>
                        {isHidden ? <HiddenMoonIllustration /> : <TelescopeIllustration />}
                      </Animated.View>
                    ) : null}
                  </PullScrollView>
                </View>
                {/* Invite cards overlay the base (absolute-fill). Dismissing
                    one reveals the base above, untouched. */}
                {page2PendingInvite ? (
                  <View style={StyleSheet.absoluteFill}>
                    <View style={styles.matchPhoto}>
                      {/* Pull-to-decline — same PullPane frame as page1, with
                          page2's own gesture/shared values and PullContext.
                          The "לא עכשיו" headline is the PullPane wake itself
                          (via wakeLabel). */}
                      <PullPane
                        gesture={page2Pull.gesture}
                        pullY={page2Pull.pullY}
                        pulling={page2Pull.pulling}
                        wakeLabel={t('home.watchingReject')}
                        tutorialPlaying={page2Pull.tutorialPlaying}
                        cardStyle={StyleSheet.absoluteFill}
                        pullContext={page2Pull.pullCtx}
                      >
                        <RisingCard
                          key={`pending-${page2PendingInvite.user_id}`}
                          style={StyleSheet.absoluteFill}
                        >
                          <MatchCard
                            match={page2PendingInvite}
                            actions={[]}
                            onReport={() => openReport(page2PendingInvite.user_id)}
                            viewerFamily={profile?.family ?? null}
                            viewerLocationType={resolveLocationType(profile)}
                            bottomInset={0}
                            onReady={page2Discovery ? () => setPage2Discovery(false) : undefined}
                            topBlock={replyingInviteCard}
                          />
                        </RisingCard>
                      </PullPane>
                    </View>
                  </View>
                ) : page2DeadInvite ? (
                  <View style={StyleSheet.absoluteFill}>
                    <View style={styles.matchPhoto}>
                      <RisingCard
                        key={`dead-${page2DeadInvite.user_id}`}
                        style={{ flex: 1 }}
                      >
                        <MatchCard
                          match={page2DeadInvite}
                          actions={[]}
                          onReport={() => openReport(page2DeadInvite.user_id)}
                          viewerFamily={profile?.family ?? null}
                          viewerLocationType={resolveLocationType(profile)}
                          bottomInset={0}
                          topBlock={page2MessageTitle ? (
                            <EventMessageCard
                              title={page2MessageTitle}
                              description={page2MessageDesc}
                              onContinue={() => runAction('app/free2', 'free2')}
                              busy={busy && pendingKey === 'free2'}
                            />
                          ) : undefined}
                        />
                      </RisingCard>
                    </View>
                  </View>
                ) : null}
              </View>}
            </View>,
            ]),
          ]}
        </AnimatedPagerView>
        {/* Visibility dropdown — opened from the side tab's glyph while it's
            the selected pane and ambient. Painted above the pager (later
            sibling) but below the profile sheet (which never co-occurs with
            page2-ambient). Routes selections through handleVisibilitySelect
            (the same logic the old toggle used). */}
        {visibilityMenuOpen && sideVisibilityAffordance && paneIndex === PAGE2_PANE && headerBottomPx > 0 ? (
          <VisibilityMenu
            currentMode={toggleMode}
            busy={busy}
            top={headerBottomPx}
            onSelect={(m) => { setVisibilityMenuOpen(false); handleVisibilitySelect(m) }}
            onClose={() => setVisibilityMenuOpen(false)}
          />
        ) : null}
        {/* Profile preview sheet — same PullPane frame as page1/page2.
            Outer container anchored at the TabStrip bottom (topAnchor) so
            the wake fills the gap below the tabs; the RisingCard (conditional
            on open, owning its SlideIn/SlideOut mount motion) rides the
            swipe-down transform. No PullContext here — the sheet's own
            gesture handles its header-vs-scroll logic. */}
        <PullPane
          gesture={profilePull.gesture}
          pullY={profilePull.pullY}
          pulling={profilePull.pulling}
          tutorialPlaying={profilePull.tutorialPlaying}
          topAnchor={tabStripBottom}
          style={styles.profileSheetOverlay}
          pointerEvents={profileSheetOpen ? 'box-none' : 'none'}
        >
          {profileSheetOpen && (
            <RisingCard style={styles.profileSheetCard}>
              <PreviewFieldPage
                config={{ kind: 'preview', title: t('settings.myProfile') }}
                onBack={closeProfileSheet}
                dismissGestureRef={profilePull.panRef}
                onScrollAtTop={profilePull.setScrollAtTop}
                headerBottomShared={profileSheetHeaderBottom}
                pulling={profilePull.pulling}
                clipBottom
              />
            </RisingCard>
          )}
        </PullPane>
        <ConfirmDialog
          visible={broadcastConfirmOpen}
          // Top action icon echoes the broadcast segment the user just
          // tapped on the toggle below.
          icon={<MegaphoneIcon color={PRIMARY} size={32} />}
          title={t('home.broadcastConfirmTitle')}
          // One flowing paragraph (no forced line breaks), with the two
          // value-prop sentences emphasized bold inside the shared centered
          // desc <Text> (ConfirmDialog inherits size/colour to nested spans).
          description={
            <>
              {t('home.broadcastConfirmDesc')}{' '}
              <Text style={{ fontWeight: WEIGHT.extrabold }}>{t('home.broadcastConfirmDescFree')}</Text>{' '}
              <Text style={{ fontWeight: WEIGHT.extrabold }}>{t('home.broadcastConfirmDescNoStars')}</Text>
            </>
          }
          confirmLabel={t('home.broadcastConfirmButton')}
          confirmIconStart={<CreditCost cost={CREDIT_COST.broadcast} color={WHITE} bg={WHITE_SOFT} />}
          onCancel={() => { if (!(busy && pendingKey === 'add')) setBroadcastConfirmOpen(false) }}
          onConfirm={() => runAction('app/add', 'add', () => setBroadcastConfirmOpen(false))}
          busy={busy && pendingKey === 'add'}
          draggable
        />
        {/* Action routes by destination: 'hidden' → app/lock2 (also clears
            last_add_at server-side); 'visible' / 'exit' → app/cancel_add
            (page2.state is already free during broadcast, so app_free2
            would be a no-op). Copy/icon comes from the shared config above. */}
        <ConfirmDialog
          visible={exitBroadcastTarget !== null}
          icon={exitBroadcastConfig.topIcon}
          title={exitBroadcastConfig.title}
          description={exitBroadcastConfig.description}
          confirmLabel={exitBroadcastConfig.confirmLabel}
          onCancel={() => { if (!busy) setExitBroadcastTarget(null) }}
          onConfirm={() => {
            const endpoint = exitBroadcastTarget === 'hidden' ? 'app/lock2' : 'app/cancel_add'
            const key = exitBroadcastTarget === 'hidden' ? 'lock2' : 'cancel_add'
            runAction(endpoint, key, () => setExitBroadcastTarget(null))
          }}
          busy={busy && (pendingKey === 'cancel_add' || pendingKey === 'lock2')}
          draggable
        />
        <ConfirmDialog
          visible={hideConfirmOpen}
          icon={hideConfirmConfig.topIcon}
          title={hideConfirmConfig.title}
          description={hideConfirmConfig.description}
          confirmLabel={hideConfirmConfig.confirmLabel}
          onCancel={() => { if (!(busy && pendingKey === 'lock2')) setHideConfirmOpen(false) }}
          onConfirm={() => runAction('app/lock2', 'lock2', () => setHideConfirmOpen(false))}
          busy={busy && pendingKey === 'lock2'}
          draggable
        />
        {/* Game-mode pause confirm — fired from the Home-tab pause glyph when
            pausing would disrupt others (broadcasting / watchers / a pending
            invite / a watching partner). Copy + icon come from the shared
            useGameMode hook so it reads identically to the visibility-toggle
            popups. */}
        <ConfirmDialog
          visible={gameMode.confirm.visible}
          icon={gameMode.confirm.icon}
          title={gameMode.confirm.title}
          description={gameMode.confirm.description}
          confirmLabel={gameMode.confirm.confirmLabel}
          onCancel={gameMode.confirm.onCancel}
          onConfirm={gameMode.confirm.onConfirm}
          busy={gameMode.confirm.busy}
          draggable
        />
      </View>
    </View>
  )
}
const styles = StyleSheet.create({
  // Outer, always-opaque backdrop behind the shell.
  backdrop: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: PRIMARY,
  },
  tabStripContainer: {
    width: '100%',
    // Flat solid deep-wine header (no gradients), seamless with the PRIMARY
    // status bar, lifted off the white content by a soft shadow alone. The
    // bottom edge is intentionally square and full-width: a rounded bottom
    // over a top-flush header reveals the white shell in the corner cutouts
    // (reads as a rendering glitch), and the soft shadow already gives the
    // "floating shelf" separation. No overflow:hidden: the sub-label timer
    // must be free to ride up into the top padding (see TabStrip.tsx).
    backgroundColor: PRIMARY,
    // Snug screen-edge margin: SM + XS (a touch more than the original tight
    // SM, at the user's request — composed from tokens, not a magic literal,
    // same pattern as paddingBottom below). It is symmetric, so the row only
    // narrows equally on both sides; TabStrip recomputes its equal flexW from
    // the new rowW and the chip stays centred per tab — tab structure and
    // symmetry are untouched. Independent of the selected-tab chip (a
    // fixed-width element centred on each tab inside the row), so changing
    // this does not affect the chip.
    paddingHorizontal: SM + XS,
    // The selected chip is bottom-anchored and overflows the row by
    // (indicatorPadV + chipBaselineNudge) px downward, so a plain MD here
    // left only ~7px between the pill and the content/photo below — it read
    // as glued to the indicator. Add the chip's downward overflow back so
    // the *visible* gap beneath the pill is a clean MD; self-corrects if the
    // anchor tokens change.
    paddingBottom: TAB.indicatorPadV + TAB.chipBaselineNudge + MD,
    // No drop-shadow: the header is intentionally flat. Separation from the
    // white content below is the deep-wine color contrast alone.
    zIndex: 1,
  },
  subPageOverlay: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: PRIMARY,
    shadowColor: BLACK,
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 8,
  },
  // `top` is set dynamically (= TabStrip bottom) so the sheet anchors just
  // below the tabs and the card doesn't slide under them. `bottom: 0` keeps
  // the sheet stretched to the bottom of the screen. The wrapper itself is
  // transparent; the card child carries the white fill + shadow so the empty
  // wrapper draws nothing while the sheet is closed.
  profileSheetOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    start: 0,
    end: 0,
  },
  profileSheetCard: {
    flex: 1,
    backgroundColor: PRIMARY,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  root: {
    flex: 1,
    backgroundColor: PRIMARY,
  },

  // ── Watching Me page (page2 viewers) ───────────────────────────────────
  watchersScrollContent: {
    paddingBottom: 0,
  },
  watchersList: {
    paddingVertical: SM,
    paddingHorizontal: SM,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: SM,
  },
  watchingMeSubtitle: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: WHITE_STRONG,
    textAlign: 'center',
    marginTop: MD,
    paddingHorizontal: SM,
  },
  rightNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
    marginTop: MD,
    marginBottom: MD,
  },
  rightNowLine: {
    height: 1,
    width: 36,
    backgroundColor: WHITE,
    opacity: 0.5,
  },
  rightNowText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
    letterSpacing: 1.4,
  },
  morePeopleText: {
    fontSize: TEXT.sm,
    color: WHITE_STRONG,
    textAlign: 'center',
    marginTop: MD,
  },
  emptyScrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  telescopeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: PRIMARY,
    overflow: 'hidden',
  },
  // ── Permission screen (no card) ────────────────────────────────────────
  permScreen: {
    flex: 1,
  },
  // Equal flex:1 spacers above and below permCenterGroup vertically center
  // the visible group across every screen height. Named (not inline) so
  // both copies of the layout (page1 watching + page2 pull-to-decline)
  // share the same single source.
  permFlexSpacer: {
    flex: 1,
  },
  // The visible group: gradient SVG headline stacked above the avatar
  // with a constant gap.
  permCenterGroup: {
    alignItems: 'center',
    gap: MD * 4,
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
    borderWidth: 2,
    borderColor: WHITE,
    backgroundColor: BLACK_SOFT,
    // overflow:hidden forces Android (New Arch/Fabric) to clip to the true
    // rounded outline. Without it, borderRadius (=size/2) + borderWidth +
    // elevation makes the border-path tessellation chamfer the corners and
    // the circle renders as an octagon. Also clips the avatar Image variant
    // to the circle. Native elevation shadow is unaffected (drawn from the
    // view outline by the parent, not a clipped child).
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  permAvatarFallback: {
    backgroundColor: BLACK_SOFT,
    borderRadius: AVATAR_SIZE / 2,
  },
  permPlayButton: {
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permSlidersButton: {
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingActions: {
    gap: MD,
  },
})
