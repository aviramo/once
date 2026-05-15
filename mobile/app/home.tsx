import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, useColorScheme, I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withDelay, cancelAnimation, Easing, runOnJS, LinearTransition, interpolateColor, useEvent, useHandler, type SharedValue } from 'react-native-reanimated'
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
import { invoke, markStartupComplete, publicImageUrl } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, clearInitialNotification, openNotifSettings, dismissAllNotifications, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { BLACK, WHITE, WHITE_MID, PRIMARY, PRIMARY_BG, DESTRUCTIVE, DESTRUCTIVE_MUTED, BLACK_STRONG, BLACK_MID, PREMIUM, BLACK_SOFT } from '../src/colors'
import { XS, SM, MD, LG, RADIUS, RADII, WEIGHT, TEXT, ICON, TAB, lh } from '../src/tokens'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BottomSheet } from '../src/components/BottomSheet'
import { MatchCard } from '../src/components/MatchCard'
import { RisingCard } from '../src/components/RisingCard'
import { TabStrip, type TabSpec } from '../src/components/TabStrip'
import { PullScrollView, PullContext, type PullCtx } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SubPageConfig, PreviewFieldPage } from './settings'
import ChatPage from './chat'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'
import { useSelfAvatar, setSelfAvatarFromLocal, setSelfAvatarFromRemote } from '../src/lib/selfAvatar'
import { FONT_SCALE } from '../src/fonts'
import { STORAGE } from '../src/keys'
import { SlidersIcon, CloseBoldIcon, CloseIcon, PauseIcon, PlayIcon, QuestionIcon, SettingsIcon, MegaphoneIcon, EyeOffIcon, EyeOpenIcon, ChevronDownIcon, MapPinIcon, BellIcon, WifiOffIcon } from '../src/components/icons'
import { exitBroadcastConfirm, hideProfileConfirm } from '../src/components/visibilityConfirms'
import type { CardAction } from '../src/components/MatchCard'
import { StatusBar } from 'expo-status-bar'


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
        borderColor: PRIMARY,
      }, style]}
    />
  )
}

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
        backgroundColor: PRIMARY_BG,
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
          stroke={PRIMARY}
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
  return [text.slice(0, best), text.slice(best + 1)]
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
          <Stop offset="0" stopColor={BLACK} stopOpacity={1} />
          <Stop offset="1" stopColor={BLACK_STRONG} stopOpacity={1} />
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

// ── Pull-to-skip "keep going" cue ────────────────────────────────────────
//
// Vertical coral→transparent gradient that fills the gap between the top
// of the home pane and the top edge of the match card. Mounted BEHIND the
// card in the stacking order, so at rest (pullY=0) the card covers it and
// the cue has no visual footprint. As the user pulls the card down the
// View's height tracks pullY pixel-for-pixel, revealing more of the
// gradient: PRIMARY (coral) at the very top of the page, fading to fully
// transparent right where the card's top edge sits. The colored "wake"
// reads as "you're pulling, the card is moving" without any iconography.
//
// Visibility (opacity) is tied to `pulling` so the gradient fades out the
// moment the gesture ends — that way it doesn't linger against the empty
// pane in the brief window between the old card unmounting and pullY
// being reset to 0 by the next card's preload-ready handler.
const PULL_CUE_VIS_FADE_IN_MS = 160
const PULL_CUE_VIS_FADE_OUT_MS = 200
// Three opacity stops at positions 0, 0.5, 1 — transparent, half-coral,
// transparent. No gradient interpolation between them; just three
// equal-height bands sitting next to each other.
const PULL_CUE_MID_OPACITY = 0.5

function PullCue({
  pulling,
  pullY,
}: {
  pulling: boolean
  pullY: SharedValue<number>
}) {
  const visibility = useSharedValue(0)
  const screenH = Dimensions.get('window').height

  useEffect(() => {
    visibility.value = withTiming(pulling ? 1 : 0, {
      duration: pulling ? PULL_CUE_VIS_FADE_IN_MS : PULL_CUE_VIS_FADE_OUT_MS,
      easing: Easing.out(Easing.cubic),
    })
  }, [pulling])

  // Single solid-coral block whose overall opacity follows a triangular
  // ramp over pull progress: 0 at no-pull, peaks at PULL_CUE_MID_OPACITY
  // exactly at the half-screen commit threshold, then fades back to 0 as
  // the user keeps pulling past commit. ScaleY still tracks pullY/screenH
  // linearly so the block's bottom edge stays glued to the card's top.
  // All UI-thread (transform + opacity), same fast path as the card.
  const animatedStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, pullY.value / screenH))
    const ramp = 1 - Math.abs(2 * t - 1)
    return {
      transform: [{ scaleY: t }],
      opacity: visibility.value * ramp * PULL_CUE_MID_OPACITY,
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[pullCueStyles.container, { height: screenH }, animatedStyle]}
    />
  )
}

const pullCueStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: PRIMARY,
    transformOrigin: 'top',
  },
})

// Single-figure silhouette: circle head + trapezoid/rectangular torso.
function SparklesIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <Path d="M20 3v4" />
      <Path d="M22 5h-4" />
      <Path d="M4 17v2" />
      <Path d="M5 18H3" />
    </Svg>
  )
}

function CheckIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  )
}

// Telescope illustration: stars + clouds + a soft telescope on a tripod.
function TelescopeIllustration() {
  const sky = '#FAD7C9'
  const cloud = '#F1E8E2'
  const tube = '#FFFFFF'
  const tubeStroke = '#E0CFC4'
  const accent = PRIMARY
  const tripod = '#C9B8AE'
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
  const sky = '#FAD7C9'
  const cloud = '#F1E8E2'
  const moon = '#FFFFFF'
  const moonShade = '#E0CFC4'
  const accent = PRIMARY
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
  rowPressed: { backgroundColor: BLACK_SOFT },
  label: {
    fontSize: TEXT.md,
    color: BLACK,
    fontWeight: WEIGHT.semibold,
  },
  labelDestructive: { color: DESTRUCTIVE_MUTED },
  labelEmphasis: { color: DESTRUCTIVE, fontWeight: WEIGHT.semibold },
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
    backgroundColor: WHITE,
    paddingVertical: LG,
    paddingHorizontal: MD,
  },
  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    textAlign: 'center',
    marginBottom: SM,
    includeFontPadding: false,
  },
  description: {
    fontSize: TEXT.lg,
    lineHeight: lh(TEXT.lg),
    color: BLACK,
    textAlign: 'center',
    includeFontPadding: false,
  },
})

// Page1 "you sent an invitation" timer card. Title + description + a plain
// full-width cancel button. The live countdown that used to ride inside
// the button's footer now sits under the Once tab label, alongside the
// symmetric page2 incoming-invite clock under the invite tab. Keeping the
// two countdowns in the same chrome row (instead of one in the button and
// one in the tab) means both sides of the invitation read the same way.
function InviteTimerCard({ targetIsMale, userIsMale, onCancel, busy }: { targetIsMale?: boolean | null; userIsMale?: boolean | null; onCancel: () => void; busy?: boolean }) {
  const title = tg('home.waitingTimerTitle', targetIsMale ?? null)
  const description = tgg('home.waitingTimerDesc', userIsMale ?? null, targetIsMale ?? null)

  return (
    <View style={statusCardStyles.container}>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.title} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {title}
      </Animated.Text>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.description} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {description}
      </Animated.Text>
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <Button
          label={t('home.cancelWaitingBtn')}
          variant="primary"
          iconStart={<CloseIcon color={WHITE} size={ICON.xxl} />}
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
// title + description + a single full-width "back to game" button. No
// timer here, so no footer on the button.
function EventMessageCard({ title, description, onContinue, busy }: { title: string; description: string; onContinue: () => void; busy?: boolean }) {
  return (
    <View style={statusCardStyles.container}>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.title} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {title}
      </Animated.Text>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.description} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {description}
      </Animated.Text>
      <Animated.View layout={STATUS_LAYOUT} style={statusButtonStyles.stack}>
        <Button
          label={t('home.endedBack')}
          variant="primary"
          iconStart={<PlayIcon color={WHITE} size={ICON.xxl} />}
          onPress={onContinue}
          loading={busy}
        />
      </Animated.View>
    </View>
  )
}

// ── Page2 status card ────────────────────────────────────────────────────
// Title + description block for the Viewers empty-state. The 3-state
// visibility toggle (VisibilityToggle) sits above this card and now owns the
// broadcast action (`app_add`) as its third segment; this card no longer has
// any siblings below it.

function ViewersStatusCard({
  isHidden,
  broadcastActive,
  hasWatchers,
  userIsMale,
}: {
  isHidden: boolean
  broadcastActive: boolean
  hasWatchers: boolean
  userIsMale: boolean | null
}) {
  // 5-state matrix: hidden wins over broadcast; then watched vs empty.
  const [title, description] = (() => {
    if (isHidden) return [tg('home.watchingMeHiddenTitle', userIsMale), tg('home.watchingMeHiddenSubtitle', userIsMale)]
    if (broadcastActive && hasWatchers) return [tg('home.watchingMeBroadcastWatchedTitle', userIsMale), tg('home.watchingMeBroadcastWatchedSubtitle', userIsMale)]
    if (broadcastActive) return [tg('home.watchingMeBroadcastEmptyTitle', userIsMale), tg('home.watchingMeBroadcastEmptySubtitle', userIsMale)]
    if (hasWatchers) return [tg('home.watchingMeVisibleWatchedTitle', userIsMale), tg('home.watchingMeVisibleWatchedSubtitle', userIsMale)]
    return [tg('home.watchingMeVisibleEmptyTitle', userIsMale), tg('home.watchingMeVisibleEmptySubtitle', userIsMale)]
  })()

  return (
    <View style={statusCardStyles.container}>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.title} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {title}
      </Animated.Text>
      <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.description} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {description}
      </Animated.Text>
    </View>
  )
}

// ── VisibilityToggle ─────────────────────────────────────────────────────
// Connected 3-segment pill anchored at the bottom of the page2 pane: Hidden,
// Visible, Broadcast. One shared outer pill (WHITE bg, PRIMARY border) with
// a PRIMARY-filled sliding indicator that animates between segments on mode
// change. Each segment renders both an active (WHITE) and a muted (PRIMARY)
// icon stacked at the same position; their opacities are driven by the
// shared `progress` value so the icon morphs in lockstep with the indicator
// as it slides past. Segments are glyph-only — labels would crowd the
// shared pill and the ViewersStatusCard directly above already explains the
// active mode.
//
// All three buttons are always tappable. Broadcast is treated as a real
// mode that the user enters via the popup confirmation, sits in for up to
// 30 minutes, and exits explicitly via the same segment (now showing an
// "exit broadcast?" popup). Tapping Hidden/Visible while broadcasting
// switches modes; the server clears the cooldown atomically in those RPCs
// (lock2) or via the explicit app/cancel_add call (used by the Visible
// segment + the exit popup) so the toggle never gets stuck on broadcast.
//
// While a tap is in flight, the matching segment's icon swaps to a spinner
// painted in the segment's tint (WHITE while the indicator is under it,
// PRIMARY otherwise).

type ToggleMode = 'hidden' | 'visible' | 'broadcast'
type ToggleAction = ToggleMode

// Small rotating spinner matching the toggle's icon dimensions. Same shape
// as the Button's internal ButtonSpinner — separate copy to avoid coupling
// the toggle to Button's internals.
function ToggleSpinner({ color, size = 20 }: { color: string; size?: number }) {
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 600, easing: Easing.linear }), -1, false)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Svg width={size} height={size} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke={color} strokeOpacity={0.3} strokeWidth={2.5} fill="none" />
        <Path d="M 11 3 A 8 8 0 0 1 19 11" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  )
}

const TOGGLE_ORDER: ToggleMode[] = ['hidden', 'visible', 'broadcast']
// Padding past the popup's `visible=false` flip to cover BottomSheet's
// slide-out animation (~300ms default withTiming). After this window the
// VisibilityToggle is free to slide its indicator to the new mode.
const TOGGLE_GATE_LINGER_MS = 320
// Inset (px) between the toggle's outer pill and the WHITE indicator. The
// indicator sits as a smaller rounded pill inside the track with breathing
// room on every side, iOS segmented-control style.
const TOGGLE_TRACK_INSET = 4

// One segment of the connected toggle. The toggle sits on a white page
// background and its body carries PRIMARY, so the palette is inverted
// from a typical resting/active pair: resting segments read WHITE icon +
// WHITE label on PRIMARY; the sliding WHITE thumb hosts the active
// segment which paints PRIMARY icon + PRIMARY label. Each segment stacks
// icon-over-label vertically and renders both color variants of the
// stack as overlaid layers, cross-fading via opacity driven by the
// shared `progress` value — same pattern as TabStrip's label cross-fade.
// While a tap is in flight, both layers are swapped for a tint-matched
// spinner.
function ToggleSegment({
  index,
  pending,
  busy,
  progress,
  onPress,
  renderIcon,
  label,
}: {
  index: number
  pending: boolean
  busy: boolean
  progress: SharedValue<number>
  onPress: () => void
  renderIcon: (color: string) => React.ReactNode
  label: string
}) {
  const activeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(progress.value - index)),
  }))
  const mutedStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, 1 - Math.abs(progress.value - index)),
  }))
  // Stack with label always present; the icon slot is swapped for a
  // spinner during pending so the label keeps reading the option being
  // committed even while the request is in flight. Sized to the icon
  // (ICON.xxxl) so the layout doesn't shift when pending flips.
  const renderContent = (color: string) => (
    <View style={visibilityToggleStyles.segmentStack}>
      {pending
        ? <ToggleSpinner color={color} size={ICON.xxxl} />
        : renderIcon(color)}
      <Text style={[visibilityToggleStyles.segmentLabel, { color }]}>{label}</Text>
    </View>
  )
  return (
    <Pressable
      style={({ pressed }) => [
        visibilityToggleStyles.segment,
        pressed && !busy && visibilityToggleStyles.segmentPressed,
      ]}
      onPress={onPress}
      disabled={busy}
      hitSlop={SM}
    >
      {/* Muted layer flows normally — it drives the segment's natural
          height (icon/spinner + gap + label + paddingVertical above/
          below). Active layer is absolutely overlaid so the row's height
          tracks content + padding instead of being pinned to a magic
          number. Opposing opacities deliver the cross-fade as `progress`
          slides past this index. */}
      <Animated.View style={mutedStyle}>{renderContent(WHITE)}</Animated.View>
      <Animated.View style={[visibilityToggleStyles.iconLayer, activeStyle]}>
        {renderContent(PRIMARY)}
      </Animated.View>
    </Pressable>
  )
}

// `gated` holds the indicator slide back while a confirm popup tied to
// this toggle is open OR animating out. Without it, the indicator
// finishes its 280ms slide while the BottomSheet is still on screen
// dimming/dismissing, so by the time the popup is fully gone the user
// sees the toggle already settled — no perceived movement. The parent
// flips `gated` true while a popup is open and keeps it true through
// the sheet's slide-out so the toggle's animation runs against a
// clear stage.
function VisibilityToggle({
  mode,
  pendingAction,
  gated,
  broadcastTimer,
  onHidden,
  onVisible,
  onBroadcast,
  busy,
}: {
  mode: ToggleMode
  // Which action is awaiting a server response. The matching segment swaps
  // its icon for a spinner in the matching tint. null when no action is in
  // flight from this toggle.
  pendingAction: ToggleAction | null
  gated: boolean
  // Live MM:SS countdown shown INSTEAD of the broadcast segment's default
  // "שידור" / "Broadcast" label while broadcast is active. Null when the
  // cooldown isn't running.
  broadcastTimer: string | null
  onHidden: () => void
  onVisible: () => void
  onBroadcast: () => void
  busy: boolean
}) {
  const modeIndex = TOGGLE_ORDER.indexOf(mode)
  const progress = useSharedValue(modeIndex)
  const [trackWidth, setTrackWidth] = useState(0)
  // Latest target index. While gated, modeIndex updates land here and the
  // animation is deferred. When gated flips false the effect below picks
  // up `latestTarget` and runs withTiming from current progress.
  useEffect(() => {
    if (gated) return
    progress.value = withTiming(modeIndex, { duration: 280, easing: Easing.out(Easing.cubic) })
  }, [modeIndex, gated])

  // Segments share the inner track (`trackWidth - 2*INSET`). The indicator
  // is `segmentWidth` wide and rides inside the track with INSET padding
  // on every side (top/bottom/leading), giving an iOS-segmented-control
  // thumb feel.
  const innerWidth = Math.max(0, trackWidth - 2 * TOGGLE_TRACK_INSET)
  const segmentWidth = innerWidth / TOGGLE_ORDER.length
  // RTL: with native RTL the first JSX child is rendered at the right edge
  // of the row. The indicator is anchored at `left: TOGGLE_TRACK_INSET`,
  // which Yoga auto-flips to `right: TOGGLE_TRACK_INSET` (visual right
  // edge of the track's padded interior). `transform: translateX` is
  // pixel-space and not auto-flipped, so we mirror the sign explicitly via
  // `dir`. `progress` itself stays in logical-index land so the per-segment
  // cross-fade math holds regardless of writing direction.
  const dir = I18nManager.isRTL ? -1 : 1
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * progress.value * segmentWidth }],
  }))

  const handlers: Record<ToggleMode, () => void> = {
    hidden: onHidden,
    visible: onVisible,
    broadcast: onBroadcast,
  }
  const handle = (target: ToggleMode) => {
    if (busy || target === mode) return
    tap()
    handlers[target]()
  }

  return (
    <View
      style={visibilityToggleStyles.row}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            visibilityToggleStyles.indicator,
            { width: segmentWidth },
            indicatorStyle,
          ]}
        />
      )}
      {TOGGLE_ORDER.map((m, i) => {
        const iconSize = ICON.xxxl
        const renderIcon =
          m === 'hidden' ? (color: string) => <EyeOffIcon color={color} size={iconSize} />
          : m === 'visible' ? (color: string) => <EyeOpenIcon color={color} size={iconSize} />
          : (color: string) => <MegaphoneIcon color={color} size={iconSize} />
        // The broadcast segment swaps its name for the live MM:SS while
        // the 30m cooldown is running, so the user reads the countdown
        // exactly where the broadcast control lives. Tabular-nums in
        // segmentLabel keeps the digit columns stable as the value ticks.
        const label = m === 'broadcast' && broadcastTimer
          ? broadcastTimer
          : t(`home.visibility.${m}` as const)
        return (
          <ToggleSegment
            key={m}
            index={i}
            pending={pendingAction === m}
            busy={busy}
            progress={progress}
            onPress={() => handle(m)}
            renderIcon={renderIcon}
            label={label}
          />
        )
      })}
    </View>
  )
}

const visibilityToggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Height is content-driven: segments add their own paddingVertical,
    // the row only adds TOGGLE_TRACK_INSET on every side to host the
    // indicator gutter. No magic number.
    borderRadius: RADIUS,
    // The toggle stands alone on the white page background — its body
    // carries the coral. Resting segments read as WHITE-on-PRIMARY, the
    // WHITE thumb stands out, and the wrapper around the pill stays
    // neutral so the toggle isn't framed by a coral strip.
    backgroundColor: PRIMARY,
    // Inner padding gives the indicator and segments breathing room from
    // the outer pill edge.
    padding: TOGGLE_TRACK_INSET,
  },
  indicator: {
    position: 'absolute',
    top: TOGGLE_TRACK_INSET,
    bottom: TOGGLE_TRACK_INSET,
    // Anchor at `left: TOGGLE_TRACK_INSET`. Yoga auto-flips to the visual
    // right edge in RTL; `transform: translateX` is pixel-space and
    // flipped in the animated style via `dir` (see VisibilityToggle).
    left: TOGGLE_TRACK_INSET,
    backgroundColor: WHITE,
    // Smaller rounded corners than the outer pill — a rounded thumb riding
    // inside a more-rounded slot. Subtract the inset so the visible curve
    // tracks the outer pill's curvature.
    borderRadius: RADIUS - TOGGLE_TRACK_INSET,
    // Subtle lift to read as a moving thumb, not a flat painted slab.
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Breathing room above the icon and below the label inside each
    // segment. Drives the row's natural height — change this and the
    // whole toggle grows/shrinks accordingly, no fixed height to chase.
    paddingVertical: MD,
  },
  segmentPressed: {
    opacity: 0.7,
  },
  // Fills the segment so alignItems/justifyContent center the icon+label
  // stack. Without these stretch offsets the layer is sized 0×0 and the
  // content paints at the segment's top-left corner instead of its
  // center.
  iconLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Vertical icon-over-label stack inside each segment. The label uses
  // the same typographic register as the TabStrip timer (subLabel:
  // TEXT.md + semibold) so the broadcast countdown above and the
  // visibility labels below read as one family.
  segmentStack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: XS,
  },
  segmentLabel: {
    // Visual match to the TabStrip broadcast timer. Even though both use
    // semibold tabular-style numbers in TEXT.md upstream, Hebrew letters
    // here read heavier than digits in the same point size, so we drop
    // a tier (TEXT.sm) to keep the same perceived weight as the timer.
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    // Broadcast segment may swap its name for a live MM:SS countdown.
    // Tabular numerals keep the digit columns from jittering each second
    // (harmless for the Hebrew/English text labels).
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
})

// Shared button-stack + in-button timer styles. Used by every StatusCard
// variant (InviteTimerCard invite timer, ViewersStatusCard cooldown). Kept in one
// place so the three call sites stay visually identical — the same bar,
// the same small time text, the same horizontal insets.
const statusButtonStyles = StyleSheet.create({
  stack: {
    marginTop: LG,
    gap: SM,
  },
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
  const colorScheme = useColorScheme()
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
  // The TabStrip indicator multiplies it by tabWidth to follow the swipe.
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
  const shellHeight = useSharedValue(Dimensions.get('window').height)
  const profileSheetDragY = useSharedValue(0)
  const profileSheetScrollAtTop = useSharedValue(true)
  const profileSheetHeaderBottom = useSharedValue(0)
  // Measured bottom of the home shell's TabStrip. Used to anchor the profile
  // sheet just below the tabs so the card doesn't slide behind them.
  const tabStripBottom = useSharedValue(0)
  const profileSheetGestureRef = useRef<import('react-native-gesture-handler').GestureType | undefined>(undefined)
  // Outer wrapper: anchor top to the TabStrip's bottom + apply live drag
  // offset. The inner Animated.View carries SlideInDown/SlideOutDown so the
  // mount transform composes with this drag without conflicting on the same
  // useAnimatedStyle target.
  const profileSheetWrapStyle = useAnimatedStyle(() => ({
    top: tabStripBottom.value,
    transform: [{ translateY: profileSheetDragY.value }],
  }))
  const openProfileSheet = useCallback(() => {
    profileSheetDragY.value = 0
    setProfileSheetOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const closeProfileSheet = useCallback(() => {
    tap()
    profileSheetScrollAtTop.value = true
    setProfileSheetOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onProfileSheetScrollAtTop = useCallback((atTop: boolean) => {
    profileSheetScrollAtTop.value = atTop
  }, [profileSheetScrollAtTop])
  const profileSheetSwipeStart = useSharedValue({ x: 0, y: 0 })
  const profileSheetSwipe = useMemo(() =>
    Gesture.Pan()
      .withRef(profileSheetGestureRef)
      .manualActivation(true)
      .onTouchesDown((e, _manager) => {
        'worklet'
        const t = e.allTouches[0]
        if (t) profileSheetSwipeStart.value = { x: t.absoluteX, y: t.absoluteY }
      })
      .onTouchesMove((e, manager) => {
        'worklet'
        const inHeader = profileSheetSwipeStart.value.y <= profileSheetHeaderBottom.value
        if (!profileSheetScrollAtTop.value && !inHeader) { manager.fail(); return }
        const t = e.allTouches[0]
        if (!t) return
        const dx = t.absoluteX - profileSheetSwipeStart.value.x
        const dy = t.absoluteY - profileSheetSwipeStart.value.y
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8) { manager.activate(); return }
        manager.fail()
      })
      .onUpdate(e => {
        'worklet'
        const drag = e.translationY
        if (drag <= 0) return
        profileSheetDragY.value = drag
      })
      .onEnd(e => {
        'worklet'
        const drag = e.translationY
        const vy = e.velocityY
        const past = drag > shellHeight.value * 0.3
        const flick = vy > 500
        if (past || flick) {
          // Trigger unmount → SlideOutDown plays. dragY is retained so the
          // composed visual continues smoothly from the user's release point
          // (no upward bump before the exit animation starts).
          runOnJS(setProfileSheetOpen)(false)
        } else {
          profileSheetDragY.value = withTiming(0)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [])

  const shellWidth = useSharedValue(Dimensions.get('window').width)

  // Resolved when subPageOpen flips to true — lets a button that triggered
  // the open await the moment the slide actually starts and show a loading
  // state until then.
  // chatAvailable: state is 'chat'
  const chatAvailable = profile?.state === 'chat'
  const [chatJustStarted, setChatJustStarted] = useState(false)


  const goToPane = (index: PaneIndex) => {
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
    if (pane !== paneIndexRef.current) {
      tap()
      paneIndexRef.current = pane
      setPaneIndex(pane)
    }
  }


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

  // ── Startup completion ────────────────────────────────────────────────
  // Both permissions granted → send app/start + try to get location.
  const lastFocusRef = useRef(0)
  const startupSentRef = useRef(false)
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
      invoke('app/start', {
        ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
        ...(pushChanged ? { push_token: { type: 'expo', token } } : {}),
        os: Platform.OS,
        lang,
        appearance: colorScheme ?? 'light',
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

  // Unified card mode — derived synchronously. The home pane is laid out
  // with both the empty/no-match content and the match-card content always
  // mounted; visibility is driven by `paneOpacity` below, so transient state
  // transitions can't unmount the match card.
  const displayedCardMode = state

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
        invoke('app/focus', location ? { location: { latitude: location.lat, longitude: location.lng } } : {})
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
    const id = setInterval(() => getLocPermission().then(setLocPerm), 2000)
    return () => clearInterval(id)
  }, [notifPerm, customLoc])

  // ── Continuous location tracking ──────────────────────────────────────
  // After startup completes, watch for significant movement and push
  // updates to the server so distance calculations stay fresh.
  // A 60s interval guarantees at least one update per minute even when
  // the user is standing still (watchLocation only fires on movement).
  // Custom-location users opt out entirely: their location is whatever
  // they picked manually, GPS movement should not overwrite it.
  useEffect(() => {
    if (!startupSentRef.current || locPerm !== 'granted' || customLoc) return
    let sub: { remove(): void } | null = null
    watchLocation((coords) => {
      invoke('app/location', { location: { latitude: coords.lat, longitude: coords.lng } }).catch(() => {})
    }).then(s => { sub = s }).catch(() => {})
    const id = setInterval(() => {
      getLastKnownLocation().then(coords => {
        if (coords) invoke('app/location', { location: { latitude: coords.lat, longitude: coords.lng } }).catch(() => {})
      })
    }, 60_000)
    return () => { sub?.remove(); clearInterval(id) }
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
  // True from the moment runFind/runIgnore is initiated until the new card
  // (if any) has finished its slide-in animation, OR until the empty pane
  // settles after the slide-out (when no new card arrives). Drives the
  // scanning UI (radar + locating text) so the user sees a coherent
  // "Scanning..." state through the entire transition. The pull gesture
  // itself does NOT set this — only the post-release server call does, so
  // mid-pull there's no scanning UI flicker.
  const [searching, setSearching] = useState(false)
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

  // Skip the entering animation only when the session started with a card
  // already in page1 (app-load instant appearance). If the session started
  // empty, the first card to arrive (and every subsequent one) animates with
  // SlideInDown. Initializing from remoteMatch avoids a useEffect race where
  // the ref would still be false on the render that mounts the first card.
  const matchHasMountedRef = useRef(!remoteMatch)
  useEffect(() => {
    if (displayedMatch) matchHasMountedRef.current = true
  }, [displayedMatch?.user_id])

  // Reset the cached "scroll is at top" gate whenever a new profile is shown.
  // The MatchCard's PullScrollView is the same component instance across
  // profile changes; the parent gesture below reads scrollAtTopSV at gesture
  // start to decide whether to allow pull-to-skip. PullScrollView only
  // refreshes that value from native onScroll events, so without this reset
  // the value sticks at `false` (from the previous card's scrolled-down
  // position) and the first swipe on the new card gets routed to scroll-only
  // mode — the user has to nudge the scroll to "unstick" it.
  useEffect(() => {
    if (displayedMatch) scrollAtTopSV.value = true
  }, [displayedMatch?.user_id])

  // Pull-to-skip gesture state. Lifted up from HomeCard so the entire match
  // card (photo + buttons) shares the same translateY transform.
  // 1:1 with the finger — no damping. Two-phase: while the inner ScrollView
  // is not at top, the gesture passes through to the scroll (the offset
  // tracks how far the finger moved while scrolling). Once scrollY hits 0,
  // additional finger movement starts pulling the card.
  const PULL_DAMP = 1
  const pullY = useSharedValue(0)
  const pullStartOffset = useSharedValue(0)
  const slidOut = useSharedValue(false)
  const scrollAtTopSV = useSharedValue(true)
  // `pullEngaged` flips true the first time pullY moves >0 in this gesture.
  // It stays true until the gesture ends so that disabling-scroll-during-
  // pull is sticky (an upward reversal mid-pull goes to the pan, not back
  // into the scroll). `pulling` mirrors it on JS so PullScrollView can
  // disable its scroll via PullContext.
  const pullEngaged = useSharedValue(false)
  // Locks the current gesture to scroll-only mode when it began with the
  // ScrollView not at the top. Scroll always wins; pulling the card to skip
  // is only available on a fresh gesture that starts already at the top.
  const scrollOnly = useSharedValue(false)
  const [pulling, setPulling] = useState(false)
  const cardPanRef = useRef<GestureType>(undefined as unknown as GestureType)

  // First-time pull-to-skip demo. When the user lands in a watching state
  // for the first time ever (gated by the `home_demo` flag in seenFlags),
  // we run a single non-interactive choreography: card drops to mid-screen,
  // holds for ~1s, slides back up. While the demo plays the screen is
  // locked so the user can't fight the animation.
  const [demoPlaying, setDemoPlaying] = useState(false)
  const demoTriggeredRef = useRef(false)
  const runFirstTimeDemo = useCallback(() => {
    const screenH = Dimensions.get('window').height
    // Stop just below the commit threshold so the animation can't trigger
    // a real skip; the gesture handler reads `e.translationY` rather than
    // `pullY.value`, but keeping the visual under commitDistance matches
    // the intent ("a peek, not a skip").
    const peek = screenH * 0.45
    // Drive the same `pulling` flag the real gesture toggles, so the
    // gradient PullCue fades in and the "לא עכשיו" headline takes over the
    // empty pane behind the card. Cleared when the card returns to rest.
    setPulling(true)
    const finish = () => {
      setPulling(false)
      setDemoPlaying(false)
    }
    pullY.value = withSequence(
      withTiming(peek),
      withDelay(
        1000,
        withTiming(0, undefined, finished => {
          'worklet'
          if (finished) runOnJS(finish)()
        }),
      ),
    )
  }, [pullY])
  useEffect(() => {
    if (demoTriggeredRef.current) return
    if (state !== 'watching') return
    if (!displayedMatch) return
    // Don't play while any home-pane overlay is up: notification/location
    // permission cards, the location-failed retry, or the no-internet
    // banner all eat the same surface the demo is supposed to animate on.
    // These are the same booleans that compose `isPermMode` (and since
    // state==='watching' here, the `state !== 'chat'` branch is implicit).
    // Re-running on overlay flips is exactly what lets the demo fire once
    // permissions finally land.
    if (showNotifOverlay || showLocOverlay || locFailed || showNoInternetOverlay) return
    demoTriggeredRef.current = true
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleDemo = () => {
      // Wait out the card's SlideInDown (~420ms) before kicking off the
      // demo so the two animations don't fight.
      timer = setTimeout(() => {
        if (cancelled) return
        setDemoPlaying(true)
        runFirstTimeDemo()
      }, 500)
    }
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE.seenFlags)
        if (cancelled) return
        const flags = raw ? JSON.parse(raw) : {}
        if (flags.home_demo) return
        // Persist the flag immediately so the demo plays once per user,
        // ever — independent of whether they go on to actually skip.
        flags.home_demo = true
        AsyncStorage.setItem(STORAGE.seenFlags, JSON.stringify(flags)).catch(() => {})
        scheduleDemo()
      } catch {}
    })()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [state, displayedMatch?.user_id, showNotifOverlay, showLocOverlay, locFailed, showNoInternetOverlay, runFirstTimeDemo])

  const pullStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullY.value }],
  }))

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
      pullY.value = 0
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
      clearLoading()
      return () => { cancelled = true }
    }
    // URL must match exactly what MatchCard requests, otherwise expo-image's
    // disk cache key differs and the prefetch goes to waste. MatchCard uses
    // raw filenames (no encodeURI) and passes through anything containing
    // "://" as-is.
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
    const urls = (remoteMatch.images ?? [])
      .filter(img => !!img.normal)
      .map(img => {
        const n = img.normal!
        return n.includes('://') ? n : `${supabaseUrl}/storage/v1/object/public/users/${remoteMatch.user_id}/normal/${n}`
      })
    const startPreload = () => {
      if (cancelled) return
      // Mount the hidden MatchCard. The card slides up only after that
      // hidden instance reports onReady (all photos painted from cache).
      setPreloadingMatch(remoteMatch)
    }
    if (urls.length === 0) {
      // No photos to wait for — promote immediately.
      setDisplayedMatch(remoteMatch)
      pullY.value = 0
      searchingTimer = setTimeout(() => {
        if (!cancelled) setSearching(false)
      }, 460)
      clearLoading()
    } else {
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
    pullY.value = 0
    preloadingMatchRef.current = null
    setPreloadingMatch(null)
    requestAnimationFrame(() => {
      setDisplayedMatch(current)
    })
    setTimeout(() => setSearching(false), 480)
    if (ignoreLoadingRef.current) {
      setIgnoreLoading(false)
      setBusy(false)
      setPendingKey(null)
    }
  }, [pullY])

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
  const matchName = (profile?.relations?.match?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
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
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)
  const [skipHintOpen, setSkipHintOpen] = useState(false)
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
  // Hold the VisibilityToggle's indicator slide while one of its confirm
  // popups is open OR animating out. Mode usually updates while the popup
  // is still on screen (Realtime arrives mid-dismiss), so without this
  // gate the indicator slide finishes UNDER the popup and the user only
  // sees the post-state when the sheet is gone — no perceived movement.
  // We extend the gate by `TOGGLE_GATE_LINGER_MS` past the popup's
  // `visible=false` flip to cover BottomSheet's slide-out (default 300ms).
  const visibilityPopupOpen = broadcastConfirmOpen || exitBroadcastTarget !== null || hideConfirmOpen
  const [visibilityToggleGated, setVisibilityToggleGated] = useState(false)
  useEffect(() => {
    if (visibilityPopupOpen) {
      setVisibilityToggleGated(true)
      return
    }
    if (!visibilityToggleGated) return
    const t = setTimeout(() => setVisibilityToggleGated(false), TOGGLE_GATE_LINGER_MS)
    return () => clearTimeout(t)
  }, [visibilityPopupOpen])
  const [hasBeenActiveThisSession, setHasBeenActiveThisSession] = useState(false)
  // Chat-state actions menu (opens from the MatchCard dots button in chat
  // state). Replaces the old chat-page dots dropdown for block/leave; adds
  // a Report option (placeholder feedback only — no server endpoint yet).
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [chatConfirmAction, setChatConfirmAction] = useState<'block' | 'leave' | 'report' | null>(null)

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
      })
  }, [busy])

  const runIgnore = useCallback(() => {
    if (busy || ignoreLoading) return
    tap()
    setBusy(true)
    setPendingKey('watching-reject')
    setIgnoreLoading(true)
    setSearching(true)
    // Optimistic exit: clearing displayedMatch unmounts the keyed
    // Animated.View, which plays SlideOutDown. The Pan gesture's pullY is
    // preserved as a transform during the layout exit, so a release at any
    // pulled position continues smoothly off-screen. Realtime delivers the
    // next match (or null) and the sync effect clears the loading state.
    setDisplayedMatch(null)
    invoke('app/ignore', {}).catch(err => {
      console.error(err)
      setBusy(false)
      setPendingKey(null)
      setIgnoreLoading(false)
      setSearching(false)
    })
  }, [busy, ignoreLoading])

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

  // Inner ScrollView (MatchCard's PullScrollView) coexistence: a Pan ref +
  // PullContext lets the inner scroll and outer pan negotiate via
  // simultaneousHandlers and dropped scroll while pulling. Same protocol as
  // HomeCard, lifted up so the photo + buttons share one Animated.View.
  const pullCtx = useMemo<PullCtx>(() => ({
    panRef: cardPanRef,
    extraRefs: [],
    setScrollAtTop: (v: boolean) => {
      scrollAtTopSV.value = v
    },
    pulling,
  }), [pulling])

  // Screen height + commit distance hoisted so both the page1 and page2
  // pan gestures can share the same half-screen commit threshold.
  const screenH = Dimensions.get('window').height
  const commitDistance = screenH * 0.5

  // ── Page2 pending-invite swipe-down gesture ──────────────────────────────
  // Mirrors the page1 watching pull-to-skip but commits to decline instead
  // of ignore. Decline goes through the confirm dialog (setRefuseConfirmOpen)
  // because it's irreversible — same UX as the old "לדלג" button used to be.
  // Separate state from the page1 gesture so they can't interfere: both
  // panes can technically be mounted simultaneously (page2 pending while
  // page1 is in watching), and Reanimated shared values aren't safe to
  // alias across two GestureDetector trees.
  const page2PullY = useSharedValue(0)
  const page2SlidOut = useSharedValue(false)
  const page2ScrollAtTopSV = useSharedValue(true)
  const page2PullEngaged = useSharedValue(false)
  const page2ScrollOnly = useSharedValue(false)
  const [page2Pulling, setPage2Pulling] = useState(false)
  const page2CardPanRef = useRef<GestureType>(undefined as unknown as GestureType)
  const page2PullStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: page2PullY.value }],
  }))
  const page2PullCtx = useMemo<PullCtx>(() => ({
    panRef: page2CardPanRef,
    extraRefs: [],
    setScrollAtTop: (v: boolean) => { page2ScrollAtTopSV.value = v },
    pulling: page2Pulling,
  }), [page2Pulling])
  const openRefuseConfirm = useCallback(() => {
    tap()
    setRefuseConfirmOpen(true)
  }, [])
  const page2CardPan = useMemo(() => {
    return Gesture.Pan()
      .withRef(page2CardPanRef)
      .enabled(!!page2PendingInvite && !busy)
      .activeOffsetY(4)
      .failOffsetX([-25, 25])
      .onStart(() => {
        'worklet'
        page2PullY.value = 0
        page2SlidOut.value = false
        page2PullEngaged.value = false
        page2ScrollOnly.value = !page2ScrollAtTopSV.value
      })
      .onUpdate(e => {
        'worklet'
        if (page2ScrollOnly.value) { page2PullY.value = 0; return }
        const raw = Math.max(0, e.translationY)
        page2PullY.value = raw
        if (raw > 0 && !page2PullEngaged.value) {
          page2PullEngaged.value = true
          runOnJS(setPage2Pulling)(true)
        }
      })
      .onEnd(e => {
        'worklet'
        if (page2ScrollOnly.value) return
        const pulled = Math.max(0, e.translationY)
        if (pulled >= commitDistance) {
          // Don't slide the card off-screen here — the confirm dialog might
          // be cancelled. Snap back to rest and open the dialog instead.
          runOnJS(openRefuseConfirm)()
        }
      })
      .onFinalize(() => {
        'worklet'
        if (!page2SlidOut.value) {
          page2PullY.value = withTiming(0)
        }
        if (page2PullEngaged.value) {
          page2PullEngaged.value = false
          runOnJS(setPage2Pulling)(false)
        }
      })
  }, [page2PendingInvite, busy, commitDistance, openRefuseConfirm])

  const pullEnabled = state === 'watching' && !demoPlaying
  // Capture screen height in JS — Dimensions isn't available inside the
  // gesture worklets (UI thread), so we close over a plain number. Lifted
  // to component scope so the pull-down chevron cue can fade against the
  // same threshold the gesture commits at. (Now hoisted above so the
  // page2 pan gesture can share commitDistance.)
  const cardPan = useMemo(() => {
    return Gesture.Pan()
      .withRef(cardPanRef)
      .enabled(pullEnabled)
      .activeOffsetY(4)
      .failOffsetX([-25, 25])
      .onStart(() => {
        'worklet'
        pullY.value = 0
        pullStartOffset.value = 0
        slidOut.value = false
        pullEngaged.value = false
        // Sample scroll position at gesture start. If the user wasn't at the
        // top, this gesture is committed to scrolling only — they have to
        // release and start a fresh gesture (with scroll already at top) to
        // pull the card down. Scroll always wins.
        scrollOnly.value = !scrollAtTopSV.value
      })
      .onUpdate(e => {
        'worklet'
        // Gesture started below the top: hand the whole gesture to the
        // ScrollView. The card never moves, even if the user scrolls all
        // the way back to the top mid-gesture.
        if (scrollOnly.value) {
          pullY.value = 0
          return
        }
        // Started at the top — finger travel pulls the card 1:1.
        const raw = Math.max(0, e.translationY)
        pullY.value = raw * PULL_DAMP
        // The first time the card actually moves, engage `pulling` so the
        // inner ScrollView locks (scrollEnabled=false). This makes an
        // upward reversal mid-pull go back to the pan instead of being
        // consumed as a downward scroll.
        if (raw > 0 && !pullEngaged.value) {
          pullEngaged.value = true
          runOnJS(setPulling)(true)
        }
      })
      .onEnd(e => {
        'worklet'
        // Scroll-only gestures never commit — the card didn't move.
        if (scrollOnly.value) return
        // Commit only when the user pulled past the screen-half mark.
        // A fast flick alone is not enough — the user must consciously cross
        // the midpoint before lifting, otherwise an accidental fast swipe
        // would skip the card. Continue the slide off-screen on the UI
        // thread immediately — without this, pullY stays frozen at the
        // finger's release position for the 1-2 frames it takes the JS
        // thread to handle setDisplayedMatch(null), which reads as the card
        // briefly sticking before SlideOutDown picks it up.
        const pulled = Math.max(0, e.translationY)
        if (pulled >= commitDistance) {
          slidOut.value = true
          pullY.value = withTiming(screenH)
          runOnJS(runIgnore)()
        }
      })
      .onFinalize(() => {
        'worklet'
        // Safety net — if the gesture didn't commit (snap back), or was
        // cancelled mid-pull, animate the card back to position 0. Without
        // this, a cancelled pan would leave the card stuck partway down.
        if (!slidOut.value) {
          pullY.value = withTiming(0)
        }
        if (pullEngaged.value) {
          pullEngaged.value = false
          runOnJS(setPulling)(false)
        }
      })
  }, [pullEnabled, runIgnore])

  // Watching-state invite block lives inside the MatchCard scroll (passed
  // as footerBlock), not in the pinned HomeButtons row. The "skip" button
  // is gone — pull-to-skip on the card handles the same intent. The prompt
  // copy that used to live in the inviteConfirm popup is rendered inline
  // above the button, so a single tap sends the invite.
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
  const watchingInviteButton = showInviteBlock ? (() => {
    const fullDesc = inviteConfirmDesc.replace(/\{name\}/g, matchName)
    const [leadDesc, ...restDesc] = fullDesc.split('\n\n')
    const tailDesc = restDesc.join('\n\n')
    return (
    <View style={[styles.watchingInviteBlock, { paddingBottom: Math.max(bottomInset, SM) }]}>
      <Text style={styles.watchingInviteTitle}>
        {tgg('home.inviteConfirmTitle' as any, isMale, matchIsMale).replace('{name}', matchName)}
      </Text>
      <Text style={styles.watchingInviteLead}>{leadDesc}</Text>
      {tailDesc ? <Text style={styles.watchingInviteDesc}>{tailDesc}</Text> : null}
      <View style={styles.replyingButtonRow}>
        <View style={styles.replyingDeclineCell}>
          <Button
            variant="secondary"
            label={t('home.watchingReject')}
            onPress={() => { tap(); setSkipHintOpen(true) }}
            disabled={busy}
            loading={busy && pendingKey === 'watching-reject'}
            silentDisabled={pendingKey !== 'watching-reject'}
          />
        </View>
        <View style={styles.replyingAcceptCell}>
          <Button
            variant="primary"
            label={t('home.inviteConfirmOk')}
            iconStart={<SparklesIcon color={WHITE} />}
            onPress={() => {
              setStickyInvite(true)
              runAction('app/invite', 'invite-confirm')
            }}
            disabled={busy}
            loading={busy && pendingKey === 'invite-confirm'}
            silentDisabled={pendingKey !== 'invite-confirm'}
          />
        </View>
      </View>
    </View>
    )
  })() : null

  // Page2 pending-invite accept block — sits at the bottom of the page2
  // MatchCard the way watchingInviteButton sits at the bottom of the page1
  // watching card. Title + description + accept CTA + decline secondary.
  // The countdown timer used to live in the accept button's footer; it now
  // lives under the invite tab label (see inviteTabSubLabel above). The
  // decline button opens the same refuse-confirm dialog as the swipe-down
  // gesture (page2CardPan below).
  const replyingAcceptBlock = page2PendingInvite ? (
    <View style={[styles.watchingInviteBlock, { paddingBottom: Math.max(bottomInset, SM) }]}>
      <Text style={styles.watchingInviteTitle}>
        {t('home.replyingTitle')}
      </Text>
      <Text style={styles.watchingInviteLead}>
        {tg('home.replyingDesc', isMale)}
      </Text>
      <View style={styles.replyingButtonRow}>
        <View style={styles.replyingDeclineCell}>
          <Button
            variant="secondary"
            label={t('home.watchingReject')}
            onPress={openRefuseConfirm}
            disabled={busy}
            silentDisabled
          />
        </View>
        <View style={styles.replyingAcceptCell}>
          <Button
            variant="primary"
            label={t('home.replyingAccept')}
            iconStart={<CheckIcon color={WHITE} size={ICON.xxl} />}
            onPress={() => runAction('app/approve', 'replying-accept')}
            disabled={busy}
            loading={busy && pendingKey === 'replying-accept'}
            silentDisabled={pendingKey !== 'replying-accept'}
          />
        </View>
      </View>
    </View>
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
          icon: <CloseBoldIcon color={WHITE} size={ICON.huge} />,
          onPress: () => { tap(); setChatMenuOpen(true) },
        }]
      : state === 'watching'
        ? undefined
        : []

  const isNetMode = !showNotifOverlay && !showLocOverlay && !locFailed && showNoInternetOverlay

  const permConfirmLabel = showNotifOverlay
    ? tg('home.notifPromptButton', isMale)
    : showLocOverlay
      ? tg('home.locationPromptButton', isMale)
      : locFailed
        ? tg('home.locationUnavailableButton', isMale)
        : tg('home.noInternetButton', isMale)

  const permConfirmIcon = showNotifOverlay
    ? <BellIcon color={WHITE} size={22} />
    : (showLocOverlay || locFailed)
      ? <MapPinIcon color={WHITE} size={22} />
      : isNetMode
        ? <WifiOffIcon color={WHITE} size={22} />
        : undefined

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
  const isReadyToFind = state === null && rawPage1State !== 'free'
  useEffect(() => {
    if (state !== null && state !== undefined && !hasBeenActiveThisSession) {
      setHasBeenActiveThisSession(true)
    }
  }, [state])
  const isPermMode = showNotifOverlay || (state !== 'chat' && (showLocOverlay || locFailed || isNetMode))

  const permTitle = showNotifOverlay
    ? (notifPerm === 'denied' ? t('home.emptyNotifBlockedTitle') : state !== null ? tg('home.notifPromptWithMatchTitle', isMale) : t('home.notifPromptTitle'))
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationUnavailableTitle') : locPerm === 'denied' ? t('home.emptyLocationBlockedTitle') : state !== null ? t('home.locationPromptWithMatchTitle') : t('home.locationPromptTitle'))
      : locFailed
        ? t('home.locationUnavailableTitle')
        : t('home.noInternetTitle')

  const permDesc = showNotifOverlay
    ? (notifPerm === 'denied' ? tg('home.emptyNotifBlockedDesc', isMale) : state !== null ? t('home.notifPromptWithMatchDesc') : tg('home.notifPromptDesc', isMale))
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationServicesOffDesc') : locPerm === 'denied' ? t('home.emptyLocationBlockedDesc') : state !== null ? t('home.locationPromptWithMatchDesc') : t('home.locationPromptDesc'))
      : locFailed
        ? t('home.locationUnavailableDesc')
        : t('home.noInternetDesc')

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
  const page2InviteName = (page2PendingInvite?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  const page2DeadName = (page2DeadInvite?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  // Side-tab label resolves to the single counterpart's name whenever slot 2
  // is dedicated to one user (pending inviter, or the user whose dead-invite
  // "what happened" card is up). Chat falls through to the static `home.tabs.chat`
  // label since the chat pane already shows the partner's name in its own header.
  const sideTabName = page2PendingInvite
    ? page2InviteName
    : page2DeadInvite
      ? page2DeadName
      : ''
  const tabSpecs: TabSpec[] = [
    // Menu tab is icon-only (no label) — it's chrome, not a destination, so
    // it shrinks to its glyph width and yields the freed flex space to the
    // two content tabs (Home + Side). Icon swaps by state: settings gear
    // normally, pause when the user has toggled game mode off, close-X while
    // the profile preview sheet is open over the menu pane.
    {
      renderIndicator: profileSheetOpen
        ? (color) => <CloseBoldIcon color={color} size={ICON.xl} />
        : gameModeOff
          ? (color) => <PauseIcon color={color} size={ICON.xl} />
          : (color) => <SettingsIcon color={color} size={ICON.xl} />,
    },
    { label: matchName || t('home.tabs.home'), subLabel: homeTabSubLabel },
    (() => {
      // Self-state mode = no counterpart on the side tab and no live chat
      // (i.e. broadcasting, free-visible, or hidden). The label reads the
      // current visibility state in plain text — same shape as every other
      // tab. Gendered via tg so feminine users see "מוסתרת" / "גלויה".
      const selfStateMode = !sideTabName && !chatAvailable
      const base = selfStateMode
        ? (broadcastActive
            ? t('home.tabs.broadcast')
            : isHidden
              ? tg('home.tabs.hidden', isMale)
              : tg('home.tabs.visible', isMale))
        : sideTabName
          ? sideTabName
          : chatAvailable
            ? t('home.tabs.chat')
            : page2PendingInvite
              ? t('home.tabs.invite')
              : t('home.tabs.viewers')
      return {
        label: sideTabCount > 0 ? `${base} ${sideTabCount}` : base,
        alerting: sideAlerting,
        subLabel: inviteTabSubLabel ?? undefined,
      } satisfies TabSpec
    })(),
  ]

  // Single headline text for the home pane — swaps value based on state.
  // Rendered through the same SkipHintLabel used during pull-to-skip, so
  // every empty/scanning/ready/skip message uses one gradient label at one
  // position with one styling.
  const headlineText = pulling
    ? t('home.watchingReject')
    : (startupCompleted && (focusInflight || searching))
      ? t('home.locatingDesc')
      : (!showHiddenPlaceholder || cardExiting)
        ? ''
        : isReadyToFind
          ? t(hasBeenActiveThisSession ? 'home.continueHeadline' : 'home.startHeadline')
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

  return (
    <View style={styles.backdrop}>
      {/* Paused state recolors the top chrome (status bar + TabStrip) from
          PRIMARY to BLACK_MID so the whole header reads as "muted" without
          going as dark as the round pause overlay button. Always render (not
          gated on gameModeOff) so the value switches both ways: a gated mount
          would leave the status bar stuck after resume, since expo-status-bar
          applies its value imperatively and never restores prior values on
          unmount. */}
      <StatusBar
        style="light"
        backgroundColor={gameModeOff ? BLACK_MID : PRIMARY}
        translucent={false}
      />
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <View
          style={[
            styles.tabStripContainer,
            { paddingTop: topInset + MD },
            gameModeOff && {
              backgroundColor: BLACK_MID,
              // Drop shadow + elevation in pause mode. The drop shadow bleeds
              // through the translucent BLACK_MID and reads as a dark frame
              // around the strip; we don't need the separator effect anyway,
              // since the dark chrome itself already contrasts with the
              // content below.
              shadowOpacity: 0,
              elevation: 0,
            },
          ]}
          onLayout={e => { tabStripBottom.value = e.nativeEvent.layout.y + e.nativeEvent.layout.height }}
        >
          <TabStrip tabs={tabSpecs} progress={pagerProgress} onSelect={(i) => {
            // While the sheet is open, any tab tap dismisses it. Non-menu
            // tabs additionally navigate to the tapped pane in the same tap.
            if (profileSheetOpen) {
              if (i !== SETTINGS_PANE) goToPane(i as PaneIndex)
              closeProfileSheet()
              return
            }
            goToPane(i as PaneIndex)
          }} />
        </View>
        {/* Pass pages as an array to avoid React 19 falsy-children issues
            with react-native-pager-view's childrenWithOverriddenStyle. */}
        <AnimatedPagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={initialPane}
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
              <SettingsPage embedded topInset={0} onOpenSubPage={openShellSubPage} />
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
                            disabled={isReadyToFind && (busy || locFetching || startupInflight || focusInflight || searching || !startupCompleted)}
                            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                          >
                            {isReadyToFind ? (
                              <View style={[styles.permAvatar, styles.permPlayButton]}>
                                <Svg width={64} height={64} viewBox="0 0 24 24" fill={WHITE}>
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
                                <SlidersIcon color={WHITE} size={64} />
                              </View>
                            )}
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.permFlexSpacer} />
                    </View>
                  </View>

                  {/* "Keep going" cue — vertical coral→transparent gradient
                      that fills the gap above the card as it's pulled down.
                      Sits BETWEEN the empty pane and the match card so the
                      opaque card hides it entirely at rest. */}
                  <PullCue pulling={pulling} pullY={pullY} />

                  {/* Match-card pane — single Animated.View keyed by
                      match.user_id. Layout animations (SlideInDown /
                      SlideOutDown) handle the slide on key change; the Pan
                      gesture below adds a pull-to-skip transform on top. */}
                  <View
                    style={styles.matchPaneWrapper}
                    pointerEvents={showHiddenPlaceholder ? 'none' : 'box-none'}
                  >
                    <PullContext.Provider value={pullCtx}>
                      <GestureDetector gesture={cardPan}>
                        {/* Outer wrapper carries the pull-to-skip transform.
                            Always mounted (even when displayedMatch is null)
                            so the GestureDetector has a stable target. */}
                        <Animated.View style={[styles.matchCardWrap, pullStyle]} collapsable={false}>
                          {displayedMatch && (
                            /* RisingCard owns the slide-up / slide-down layout
                               animations. Kept separate from the pullStyle
                               above so SlideIn/SlideOut's transform doesn't
                               clobber the useAnimatedStyle on the outer view. */
                            <RisingCard
                              key={displayedMatch.user_id}
                              animateEnter={matchHasMountedRef.current}
                              style={styles.matchCardWrap}
                            >
                              <View style={styles.matchPhoto}>
                                <MatchCard
                                  match={displayedMatch}

                                  viewerFamily={profile?.family ?? null}
                                  viewerLocationCustom={profile?.location_custom ?? null}
                                  bottomInset={0}
                                  hideTime={state === 'chat'}
                                  actions={page1CardActions}
                                  topBlock={
                                    displayedCardMode === 'waiting' && inviteExpiresAt ? (
                                      <InviteTimerCard
                                        targetIsMale={matchIsMale}
                                        userIsMale={isMale}
                                        onCancel={() => { tap(); setCancelConfirmOpen(true) }}
                                      />
                                    ) : isEndedState && page1MessageTitle ? (
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
                          )}
                        </Animated.View>
                      </GestureDetector>
                    </PullContext.Provider>
                    {preloadingMatch && preloadingMatch.user_id !== displayedMatch?.user_id && (
                      <View style={styles.preloaderWrap} pointerEvents="none">
                        <View style={styles.matchPhoto}>
                          <MatchCard
                            match={preloadingMatch}

                            viewerFamily={profile?.family ?? null}
                            viewerLocationCustom={profile?.location_custom ?? null}
                            bottomInset={0}
                            onReady={() => onPreloadReady(preloadingMatch.user_id)}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                <ConfirmDialog
                  visible={cancelConfirmOpen}
                  title={t('home.cancelWaitingTitle')}
                  description={tg('home.cancelWaitingDesc', matchIsMale).replace(/\{name\}/g, matchName)}
                  confirmLabel={t('home.cancelWaitingConfirm')}
                  destructive
                  onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                  onConfirm={runCancel}
                  busy={busy}
                  draggable
                />

                <ConfirmDialog
                  visible={refuseConfirmOpen}
                  title={t('home.refuseReplyTitle')}
                  description={tg('home.refuseReplyDesc', page2InviteObj?.is_male ?? null)}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  destructive
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
                  cancelLabel={t('home.skipHintCancel')}
                  confirmLabel={t('home.watchingReject')}
                  soft
                  confirmIcon={<CloseIcon color={WHITE} size={22} />}
                  onCancel={() => { if (!busy) setSkipHintOpen(false) }}
                  onConfirm={() => {
                    setSkipHintOpen(false)
                    runIgnore()
                  }}
                  busy={busy}
                  draggable
                />

                <ConfirmDialog
                  visible={!!removeWatcherTarget}
                  title={t('home.removeWatcherTitle')}
                  description={tg('home.removeWatcherDesc' as any, removeWatcherTarget?.is_male ?? null).replace('{name}', removeWatcherTarget?.name ?? '')}
                  confirmLabel={t('home.removeWatcherConfirm')}
                  destructive
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

                <ConfirmDialog
                  visible={isPermMode}
                  title={permTitle}
                  description={permDesc}
                  confirmLabel={permConfirmLabel}
                  confirmIcon={permConfirmIcon}
                  onConfirm={permOnConfirm}
                  onCancel={() => {}}
                  busy={permBusyState}
                  tone="positive"
                />

                {/* Chat-state actions menu (opened from MatchCard dots).
                    paddingBottom = safe-area bottom + MD so the last row
                    sits clear of the home-indicator gesture area. */}
                <BottomSheet
                  visible={chatMenuOpen}
                  onDismiss={() => setChatMenuOpen(false)}
                  contentStyle={[chatMenuStyles.sheet, { paddingBottom: Math.max(bottomInset, SM) + MD }]}
                >
                  <Pressable
                    onPress={() => { tap(); setChatMenuOpen(false); setChatConfirmAction('leave') }}
                    style={({ pressed }) => [chatMenuStyles.row, pressed && chatMenuStyles.rowPressed]}
                  >
                    <Text style={[chatMenuStyles.label, chatMenuStyles.labelDestructive]}>{t('chat.leave')}</Text>
                  </Pressable>
                  <View style={chatMenuStyles.divider} />
                  <Pressable
                    onPress={() => { tap(); setChatMenuOpen(false); setChatConfirmAction('block') }}
                    style={({ pressed }) => [chatMenuStyles.row, pressed && chatMenuStyles.rowPressed]}
                  >
                    <Text style={[chatMenuStyles.label, chatMenuStyles.labelDestructive]}>{t('chat.block')}</Text>
                  </Pressable>
                  <View style={chatMenuStyles.divider} />
                  <Pressable
                    onPress={() => { tap(); setChatMenuOpen(false); setChatConfirmAction('report') }}
                    style={({ pressed }) => [chatMenuStyles.row, pressed && chatMenuStyles.rowPressed]}
                  >
                    <Text style={[chatMenuStyles.label, chatMenuStyles.labelDestructive, chatMenuStyles.labelEmphasis]}>{t('chat.report')}</Text>
                  </Pressable>
                </BottomSheet>

                <ConfirmDialog
                  visible={chatConfirmAction === 'leave'}
                  title={t('home.leaveTitle')}
                  description={t('home.leaveDesc')}
                  confirmLabel={t('home.leaveConfirm')}
                  destructive
                  onCancel={() => setChatConfirmAction(null)}
                  onConfirm={async () => { setChatConfirmAction(null); await invoke('app/leave') }}
                  draggable
                />
                <ConfirmDialog
                  visible={chatConfirmAction === 'block'}
                  title={t('chat.blockTitle')}
                  description={t('chat.blockDesc')}
                  confirmLabel={t('chat.blockConfirm')}
                  destructive
                  onCancel={() => setChatConfirmAction(null)}
                  onConfirm={async () => { await invoke('app/block'); setChatConfirmAction(null) }}
                  draggable
                />
                <ConfirmDialog
                  visible={chatConfirmAction === 'report'}
                  title={t('chat.reportTitle')}
                  description={t('chat.reportDesc')}
                  confirmLabel={t('chat.reportConfirm')}
                  tone="positive"
                  onCancel={() => setChatConfirmAction(null)}
                  onConfirm={() => setChatConfirmAction(null)}
                  draggable
                />

              </View>
            </View>,

            // Slot 2: side — page2 or chat depending on chatAvailable
            <View key="side" style={{ flex: 1 }}>
              {chatAvailable ? (
                <ChatPage
                  key={profile?.relations?.match?.user_id ?? 'no-match'}
                  isActive={paneIndex === CHAT_PANE}
                  onUnreadChange={setChatUnread}
                  topInset={0}
                  autoFocusInput={chatJustStarted}
                />
              ) : <View style={styles.root}>
                {page2PendingInvite ? (
                  <View style={styles.matchPhoto}>
                    {/* Pull-to-decline reveal — mirrors page1 watching.
                        The "לא עכשיו" gradient headline sits centered behind
                        the card; the coral PullCue gradient fills the gap
                        above the card as it's pulled down. Both are hidden
                        at rest because the opaque card covers them. */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <View style={styles.permScreen}>
                        <View style={styles.permFlexSpacer} />
                        <View style={styles.permCenterGroup}>
                          <HeadlineArea text={t('home.watchingReject')} />
                          {/* Invisible spacer matching the page1 avatar so the
                              headline sits at the same Y as in watching. */}
                          <View style={styles.permAvatarWrap} />
                        </View>
                        <View style={styles.permFlexSpacer} />
                      </View>
                    </View>
                    <PullCue pulling={page2Pulling} pullY={page2PullY} />
                    <View style={StyleSheet.absoluteFill}>
                      <PullContext.Provider value={page2PullCtx}>
                        <GestureDetector gesture={page2CardPan}>
                          {/* Same split as page1: outer Animated.View owns the
                              pull-to-decline transform, inner RisingCard owns
                              the slide-up/slide-down mount animation. */}
                          <Animated.View style={[StyleSheet.absoluteFill, page2PullStyle]} collapsable={false}>
                            <RisingCard
                              key={`pending-${page2PendingInvite.user_id}`}
                              style={StyleSheet.absoluteFill}
                            >
                              <MatchCard
                                match={page2PendingInvite}
                                actions={[{
                                  key: 'help',
                                  icon: <QuestionIcon color={PRIMARY} stroke={WHITE} size={ICON.huge} />,
                                }]}
                                viewerFamily={profile?.family ?? null}
                                viewerLocationCustom={profile?.location_custom ?? null}
                                bottomInset={0}
                                onReady={page2Discovery ? () => setPage2Discovery(false) : undefined}
                                footerBlock={replyingAcceptBlock}
                                footerBg={replyingAcceptBlock ? PRIMARY : undefined}
                              />
                            </RisingCard>
                          </Animated.View>
                        </GestureDetector>
                      </PullContext.Provider>
                    </View>
                  </View>
                ) : page2DeadInvite ? (
                  <View style={styles.matchPhoto}>
                    <RisingCard
                      key={`dead-${page2DeadInvite.user_id}`}
                      style={{ flex: 1 }}
                    >
                      <MatchCard
                        match={page2DeadInvite}
                        actions={[]}
                        viewerFamily={profile?.family ?? null}
                        viewerLocationCustom={profile?.location_custom ?? null}
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
                ) : (
                  // Pane layout: 3-state visibility toggle (hidden | visible
                  // | broadcast) anchored at the top of the pane; scrolling
                  // status card + watchers list or telescope below. Broadcast
                  // (formerly the premium "Show me to people" button) is a
                  // real selectable mode now, lit up for the full 30m the
                  // cooldown lasts; the side tab still surfaces the live
                  // countdown above the "viewers" label.
                  <View style={{ flex: 1 }}>
                    {watchers.length > 0 ? (
                      <PullScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        contentContainerStyle={styles.watchersScrollContent}
                      >
                        <ViewersStatusCard
                          isHidden={isHidden}
                          broadcastActive={broadcastActive}
                          hasWatchers={true}
                          userIsMale={isMale}
                        />
                        <View style={styles.watchersList}>
                          {watchers.map((w) => (
                            <View key={w.user_id} style={styles.watcherSlot}>
                              <WatcherCard
                                watcher={w}
                                viewerFamily={profile?.family ?? null}
                                viewerLocationCustom={profile?.location_custom ?? null}
                                onPress={() => { tap(); setRemoveWatcherTarget(w) }}
                              />
                            </View>
                          ))}
                        </View>
                      </PullScrollView>
                    ) : (
                      <PullScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        contentContainerStyle={styles.emptyScrollContent}
                      >
                        <ViewersStatusCard
                          isHidden={isHidden}
                          broadcastActive={broadcastActive}
                          hasWatchers={false}
                          userIsMale={isMale}
                        />
                        <View style={styles.telescopeWrap}>
                          {isHidden ? <HiddenMoonIllustration /> : <TelescopeIllustration />}
                        </View>
                      </PullScrollView>
                    )}
                    <View style={[styles.page2BottomBar, { paddingBottom: Math.max(bottomInset, LG) }]}>
                      <VisibilityToggle
                        mode={toggleMode}
                        gated={visibilityToggleGated}
                        broadcastTimer={broadcastActive ? addCooldownLabel : null}
                        pendingAction={
                          busy && pendingKey === 'lock2' ? 'hidden'
                          : busy && pendingKey === 'free2' ? 'visible'
                          : busy && pendingKey === 'cancel_add' ? (broadcastActive ? 'broadcast' : 'visible')
                          : busy && pendingKey === 'add' ? 'broadcast'
                          : null
                        }
                        onHidden={() => {
                          if (toggleMode === 'hidden') return
                          // During broadcast, any mode switch is a "stop
                          // broadcasting" action — confirm first.
                          if (broadcastActive) setExitBroadcastTarget('hidden')
                          // app/lock2 kicks every current watcher and pushes
                          // each one a `removed` notification. Surface the
                          // ripple before running it.
                          else if (watchers.length > 0) setHideConfirmOpen(true)
                          else runAction('app/lock2', 'lock2')
                        }}
                        onVisible={() => {
                          if (toggleMode === 'visible') return
                          if (broadcastActive) setExitBroadcastTarget('visible')
                          else runAction('app/free2', 'free2')
                        }}
                        onBroadcast={() => {
                          if (broadcastActive) setExitBroadcastTarget('exit')
                          else setBroadcastConfirmOpen(true)
                        }}
                        busy={busy && (pendingKey === 'lock2' || pendingKey === 'free2' || pendingKey === 'add' || pendingKey === 'cancel_add')}
                      />
                    </View>
                  </View>
                )}
              </View>}
            </View>,
          ]}
        </AnimatedPagerView>
        {/* Always-mounted positioning wrapper: anchors below the TabStrip and
            carries the live swipe-drag offset. Inner Animated.View is the one
            conditional on open state — its SlideInDown / SlideOutDown layout
            animations drive the mount/dismount motion, identical to the
            MatchCard pane on the home slot. */}
        <Animated.View
          style={[styles.profileSheetOverlay, profileSheetWrapStyle]}
          pointerEvents={profileSheetOpen ? 'box-none' : 'none'}
        >
          <GestureDetector gesture={profileSheetSwipe}>
            <View style={{ flex: 1 }} collapsable={false}>
              {profileSheetOpen && (
                <RisingCard style={styles.profileSheetCard}>
                  <PreviewFieldPage
                    config={{ kind: 'preview', title: t('settings.myProfile') }}
                    onBack={closeProfileSheet}
                    dismissGestureRef={profileSheetGestureRef}
                    onScrollAtTop={onProfileSheetScrollAtTop}
                    headerBottomShared={profileSheetHeaderBottom}
                    clipBottom
                  />
                </RisingCard>
              )}
            </View>
          </GestureDetector>
        </Animated.View>
        <ConfirmDialog
          visible={broadcastConfirmOpen}
          title={t('home.broadcastConfirmTitle')}
          description={t('home.broadcastConfirmDesc')}
          confirmLabel={t('home.broadcastConfirmButton')}
          // Confirm-button icon mirrors the toggle option being committed,
          // so the popup's primary action visually echoes the segment the
          // user just tapped on the toggle below.
          confirmIcon={<MegaphoneIcon color={WHITE} size={ICON.xxl} />}
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
          title={exitBroadcastConfig.title}
          description={exitBroadcastConfig.description}
          confirmLabel={exitBroadcastConfig.confirmLabel}
          destructive={exitBroadcastConfig.destructive}
          confirmIcon={exitBroadcastConfig.confirmIcon}
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
          title={hideConfirmConfig.title}
          description={hideConfirmConfig.description}
          confirmLabel={hideConfirmConfig.confirmLabel}
          destructive={hideConfirmConfig.destructive}
          confirmIcon={hideConfirmConfig.confirmIcon}
          onCancel={() => { if (!(busy && pendingKey === 'lock2')) setHideConfirmOpen(false) }}
          onConfirm={() => runAction('app/lock2', 'lock2', () => setHideConfirmOpen(false))}
          busy={busy && pendingKey === 'lock2'}
          draggable
        />
        {demoPlaying && (
          <View style={styles.demoLockOverlay} pointerEvents="auto" />
        )}
      </View>
    </View>
  )
}
const styles = StyleSheet.create({
  // Outer, always-opaque backdrop behind the shell.
  backdrop: {
    flex: 1,
    backgroundColor: WHITE,
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: WHITE,
  },
  tabStripContainer: {
    width: '100%',
    backgroundColor: PRIMARY,
    paddingHorizontal: SM,
    paddingBottom: MD,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 1,
  },
  subPageOverlay: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: WHITE,
    shadowColor: '#000',
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
    backgroundColor: WHITE,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  root: {
    flex: 1,
    backgroundColor: WHITE,
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
  watcherSlot: {
    width: '100%',
  },
  watchingMeSubtitle: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: BLACK_STRONG,
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
    backgroundColor: PRIMARY,
    opacity: 0.5,
  },
  rightNowText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.extrabold,
    color: PRIMARY,
    letterSpacing: 1.4,
  },
  morePeopleText: {
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
    textAlign: 'center',
    marginTop: MD,
  },
  emptyScrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  page2BottomBar: {
    paddingHorizontal: MD,
    paddingTop: LG,
  },
  telescopeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPaneWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  // Transparent fullscreen overlay rendered above everything while the
  // first-time pull-to-skip demo plays; absorbs every touch so the user
  // can't fight the animation.
  demoLockOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: WHITE,
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
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permSlidersButton: {
    backgroundColor: BLACK_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingActions: {
    gap: MD,
  },
  watchingInviteBlock: {
    backgroundColor: WHITE,
    paddingHorizontal: MD,
    paddingTop: MD,
    paddingBottom: MD,
    gap: RADIUS,
  },
  watchingInviteTitle: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  watchingInviteLead: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: PRIMARY,
    textAlign: 'center',
  },
  watchingInviteDesc: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: PRIMARY,
    textAlign: 'center',
  },
  replyingButtonRow: {
    flexDirection: 'row',
    gap: SM,
    marginTop: SM,
  },
  replyingDeclineCell: {
    flex: 1,
  },
  replyingAcceptCell: {
    flex: 2,
  },
})
