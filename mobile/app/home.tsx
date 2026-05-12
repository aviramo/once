import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withDelay, cancelAnimation, Easing, runOnJS, SlideInDown, SlideOutDown, LinearTransition, useEvent, useHandler, type SharedValue } from 'react-native-reanimated'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import { invoke, markStartupComplete, publicImageUrl } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, clearInitialNotification, openNotifSettings, dismissAllNotifications, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { BLACK, WHITE, PRIMARY, PRIMARY_BG, DESTRUCTIVE, DESTRUCTIVE_MUTED, BLACK_STRONG, PREMIUM, BLACK_SOFT } from '../src/colors'
import { SINGLE, DOUBLE, QUAD, RADIUS, RADII, BUTTON, WEIGHT, TEXT, EASE, DURATION, ICON } from '../src/tokens'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BottomSheet } from '../src/components/BottomSheet'
import { MatchCard } from '../src/components/MatchCard'
import { DiscoveryReveal } from '../src/components/DiscoveryReveal'
import { TabStrip, type TabSpec, type TabChip } from '../src/components/TabStrip'
import { PullScrollView, PullContext, type PullCtx } from '../src/components/HomeCard'
import { HomeButtons } from '../src/components/HomeButtons'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SubPageConfig, PreviewFieldPage } from './settings'
import ChatPage from './chat'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'
import { useSelfAvatar, setSelfAvatarFromLocal, setSelfAvatarFromRemote } from '../src/lib/selfAvatar'
import { FONT_SCALE } from '../src/fonts'
import { STORAGE } from '../src/keys'
import { SlidersIcon, CloseBoldIcon, CloseIcon, DotsIcon, PauseIcon, InboxIcon, PlayIcon } from '../src/components/icons'
import type { CardAction } from '../src/components/MatchCard'


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
            withTiming(1, { duration: RADAR_DURATION, easing: Easing.out(Easing.quad) }),
          ),
          -1,
          false,
        ),
      )
    } else {
      progress.value = withTiming(1, { duration: 200 })
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
const SKIP_HINT_HPAD = DOUBLE * 2
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
      easing: EASE.out,
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

// Megaphone-style icon used in the premium popup for the "show me to people"
// tile. Single-stroke, currentColor so it reads on both PREMIUM and disabled
// backgrounds.
function MegaphoneIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11v2a2 2 0 0 0 2 2h1l3 4h2v-12h-2l-3 4h-1a2 2 0 0 0-2 2z" />
      <Path d="M14 7a5 5 0 0 1 0 10" />
      <Path d="M18 5a8 8 0 0 1 0 14" />
    </Svg>
  )
}

function EyeOffIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-1.67 2.68" />
      <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s4 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <Path d="M2 2l20 20" />
    </Svg>
  )
}

function EyeOpenIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  )
}

// ── Message ────────────────────────────────────────────────────────────────
// Centered title + description block. Used as the main content surface for
// every per-state variant of this screen (HIDDEN, WATCHING, WAITING, etc.).

const chatMenuStyles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 0,
    paddingVertical: SINGLE / 2,
  },
  row: {
    paddingVertical: BUTTON,
    paddingHorizontal: BUTTON,
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: BLACK_SOFT },
  label: {
    fontSize: TEXT.input,
    color: BLACK,
    fontWeight: WEIGHT.semibold,
  },
  labelDestructive: { color: DESTRUCTIVE_MUTED },
  labelEmphasis: { color: DESTRUCTIVE, fontWeight: WEIGHT.semibold },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BLACK_SOFT,
    marginHorizontal: BUTTON,
  },
})


// ── Invite timer ──────────────────────────────────────────────────────────

function useSecsLeft(expiresAt: string) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  )
  useEffect(() => {
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
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

// ── StatusCard primitive ─────────────────────────────────────────────────
// Shared scaffolding for both InfoBlock (page1 waiting/replying) and
// Page2StatusCard (Viewers empty-state). Warm surface, optional title,
// description, progress bar, and a bottom row with a clock slot on the
// reading-edge side and an actions slot on the trailing side.

const STATUS_BTN_SIZE = 44
const STATUS_GLYPH_SIZE = 14
const STATUS_BAR_HEIGHT = 6

// Smooth layout transition for the StatusCard interior. When the description
// text grows/shrinks (e.g., page2 toggle between visible vs. hidden subtitle),
// the description's height, the bar position, and the bottom row position all
// animate in sync instead of snapping.
const STATUS_LAYOUT = LinearTransition.duration(DURATION.med).easing(EASE.out)

function StatusCard({
  title,
  description,
  progress,
  accent = PRIMARY,
  clock,
  actions,
}: {
  title?: string | null
  description?: string
  progress?: number
  accent?: string
  clock?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <View style={statusCardStyles.container}>
      {title ? (
        <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.title} maxFontSizeMultiplier={FONT_SCALE.heading}>
          {title}
        </Animated.Text>
      ) : null}
      {description ? (
        <Animated.Text layout={STATUS_LAYOUT} style={statusCardStyles.description} maxFontSizeMultiplier={FONT_SCALE.heading}>
          {description}
        </Animated.Text>
      ) : null}
      {progress != null ? (
        <Animated.View layout={STATUS_LAYOUT} style={statusCardStyles.barTrack}>
          <View style={[statusCardStyles.barFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
        </Animated.View>
      ) : null}
      <Animated.View layout={STATUS_LAYOUT} style={statusCardStyles.bottomRow}>
        <View style={statusCardStyles.clockSlot}>{clock}</View>
        <View style={statusCardStyles.actionsRow}>{actions}</View>
      </Animated.View>
    </View>
  )
}

function StatusAction({
  onPress,
  disabled,
  accessibilityLabel,
  color = PRIMARY,
  variant = 'solid',
  children,
}: {
  onPress: () => void
  disabled?: boolean
  accessibilityLabel: string
  color?: string
  variant?: 'solid' | 'outlined'
  children: React.ReactNode
}) {
  const variantStyle = variant === 'outlined'
    ? { backgroundColor: WHITE, borderColor: color, borderWidth: 2 }
    : { backgroundColor: color }
  return (
    <Pressable
      onPress={() => { if (!disabled) onPress() }}
      disabled={disabled}
      hitSlop={SINGLE}
      style={[
        statusCardStyles.actionBtn,
        variantStyle,
        disabled && statusCardStyles.actionBtnDisabled,
      ]}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  )
}

const statusCardStyles = StyleSheet.create({
  container: {
    backgroundColor: WHITE,
    paddingVertical: QUAD,
    paddingHorizontal: BUTTON,
  },
  title: {
    fontSize: TEXT.subhead,
    fontWeight: WEIGHT.bold,
    color: BLACK,
    textAlign: 'center',
    marginBottom: DOUBLE,
    includeFontPadding: false,
  },
  description: {
    fontSize: TEXT.body,
    lineHeight: 23,
    color: BLACK,
    textAlign: 'center',
    marginBottom: QUAD,
    includeFontPadding: false,
  },
  barTrack: {
    height: STATUS_BAR_HEIGHT,
    backgroundColor: PRIMARY_BG,
    overflow: 'hidden',
  },
  barFill: {
    height: STATUS_BAR_HEIGHT,
  },
  bottomRow: {
    marginTop: QUAD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: STATUS_BTN_SIZE,
  },
  clockSlot: {
    minWidth: 60,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SINGLE,
  },
  clock: {
    fontSize: TEXT.h2,
    fontWeight: WEIGHT.extrabold,
    letterSpacing: -0.4,
    color: BLACK,
    fontVariant: ['tabular-nums'],
  },
  clockWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SINGLE,
  },
  expiresLabel: {
    fontSize: TEXT.tiny,
    fontWeight: WEIGHT.semibold,
  },
  stopGlyph: {
    width: STATUS_GLYPH_SIZE,
    height: STATUS_GLYPH_SIZE,
    borderRadius: RADII.xs,
    backgroundColor: WHITE,
  },
  actionBtn: {
    width: STATUS_BTN_SIZE,
    height: STATUS_BTN_SIZE,
    borderRadius: STATUS_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
})

function InfoBlock({ expiresAt, totalSecs, extended, targetIsMale, userIsMale, mode = 'inviter', onCancel, onAccept, onReject, busy }: { expiresAt: string; totalSecs: number; extended?: boolean; targetIsMale?: boolean | null; userIsMale?: boolean | null; mode?: 'inviter' | 'invitee'; onCancel?: () => void; onAccept?: () => void; onReject?: () => void; busy?: boolean }) {
  const secsLeft = useSecsLeft(expiresAt)
  const isExpired = secsLeft === 0
  const isUrgent = secsLeft > 0 && secsLeft < 120
  const progress = Math.max(0, Math.min(1, secsLeft / Math.max(1, totalSecs)))

  const accentColor = isExpired ? DESTRUCTIVE : PRIMARY

  // Gentle blink when expired.
  const blink = useSharedValue(1)
  useEffect(() => {
    cancelAnimation(blink)
    if (isExpired) {
      blink.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      )
    } else {
      blink.value = withTiming(1, { duration: 200 })
    }
  }, [isExpired])
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }))

  const title = mode === 'inviter' ? tg('home.waitingTimerTitle', targetIsMale ?? null) : null
  const description = mode === 'invitee'
    ? tg('home.replyingTimerDesc', userIsMale ?? null)
    : tgg('home.waitingTimerDesc', userIsMale ?? null, targetIsMale ?? null)

  return (
    <StatusCard
      title={title}
      description={description}
      progress={progress}
      accent={accentColor}
      clock={
        <Animated.View style={[statusCardStyles.clockWrap, blinkStyle]}>
          {extended ? (
            <Text style={[statusCardStyles.expiresLabel, { color: accentColor }]} maxFontSizeMultiplier={FONT_SCALE.ui} numberOfLines={1}>
              {t('home.inviteTimerLabelExtended')}
            </Text>
          ) : null}
          <Text
            style={[statusCardStyles.clock, (isUrgent || isExpired) && { color: accentColor }]}
            maxFontSizeMultiplier={FONT_SCALE.ui}
            numberOfLines={1}
          >
            {formatClock(secsLeft)}
          </Text>
        </Animated.View>
      }
      actions={mode === 'invitee' && (onAccept || onReject) ? (
        <>
          <StatusAction
            color={DESTRUCTIVE}
            variant="outlined"
            disabled={busy}
            onPress={onReject!}
            accessibilityLabel={t('home.replyingReject')}
          >
            <CloseIcon color={DESTRUCTIVE} size={22} />
          </StatusAction>
          <StatusAction
            color={PRIMARY}
            disabled={busy}
            onPress={onAccept!}
            accessibilityLabel={t('home.replyingAccept')}
          >
            <CheckIcon color={WHITE} size={22} />
          </StatusAction>
        </>
      ) : onCancel ? (
        <StatusAction onPress={onCancel} accessibilityLabel={t('home.cancelWaitingBtn')}>
          <View style={statusCardStyles.stopGlyph} />
        </StatusAction>
      ) : null}
    />
  )
}

// ── MessageBlock ─────────────────────────────────────────────────────────
// Top-of-card info component for terminal locked-message states (page1 after
// a terminal event, page2 dead invite). Same StatusCard layout as InfoBlock —
// title + description + a passive bar in the place where the live timer would
// sit + a continue StatusAction that mirrors cancel/accept/reject styling.
function MessageBlock({ title, description, onContinue, busy }: { title: string; description: string; onContinue: () => void; busy?: boolean }) {
  return (
    <StatusCard
      title={title}
      description={description}
      progress={1}
      actions={
        <StatusAction
          color={PRIMARY}
          disabled={busy}
          onPress={onContinue}
          accessibilityLabel={t('home.endedBack')}
        >
          <PlayIcon color={WHITE} size={22} />
        </StatusAction>
      }
    />
  )
}

// ── Page2 status card ────────────────────────────────────────────────────
// Composes StatusCard for the Viewers empty-state. Two PREMIUM round action
// buttons: broadcast (`app_add`) and hide/reveal (`app_lock2` / `app_free2`).
// Broadcast carries a 1h cooldown; while it is counting down the bar reflects
// the time-left ratio and the clock label renders next to the actions.

function Page2StatusCard({
  isHidden,
  userIsMale,
  addEnabled,
  addCooldownLabel,
  addCooldownSecsLeft,
  addCooldownTotalSecs,
  busyKey,
  onBroadcast,
  onToggleHide,
  title: titleOverride,
  description: descriptionOverride,
}: {
  isHidden: boolean
  userIsMale: boolean | null
  addEnabled: boolean
  addCooldownLabel: string | null
  addCooldownSecsLeft: number
  addCooldownTotalSecs: number
  busyKey: string | null
  onBroadcast: () => void
  onToggleHide: () => void
  title?: string | null
  description?: string
}) {
  const addBusy = busyKey === 'add'
  const toggleBusy = busyKey === 'lock2' || busyKey === 'free2'
  const onCooldown = !addEnabled && !!addCooldownLabel
  const broadcastDisabled = onCooldown || addBusy
  const title = titleOverride !== undefined
    ? titleOverride
    : isHidden ? t('home.watchingMeHiddenTitle') : t('home.watchingMeNoOneTitle')
  const description = descriptionOverride !== undefined
    ? descriptionOverride
    : isHidden
      ? t('home.watchingMeHiddenSubtitle')
      : tg('home.watchingMeNoOneSubtitle', userIsMale)
  const ToggleIcon = isHidden ? EyeOpenIcon : EyeOffIcon
  const progress = onCooldown
    ? Math.max(0, Math.min(1, addCooldownSecsLeft / Math.max(1, addCooldownTotalSecs)))
    : 1

  return (
    <StatusCard
      title={title}
      description={description}
      progress={progress}
      accent={PREMIUM}
      clock={onCooldown ? (
        <Text
          style={statusCardStyles.clock}
          maxFontSizeMultiplier={FONT_SCALE.ui}
          numberOfLines={1}
        >
          {addCooldownLabel}
        </Text>
      ) : null}
      actions={
        <>
          <StatusAction
            color={PREMIUM}
            variant="outlined"
            disabled={broadcastDisabled}
            onPress={() => { tap(); onBroadcast() }}
            accessibilityLabel={t('home.premiumPopup.add')}
          >
            <MegaphoneIcon color={PREMIUM} size={22} />
          </StatusAction>
          <StatusAction
            color={isHidden ? PRIMARY : PREMIUM}
            variant="outlined"
            disabled={toggleBusy}
            onPress={() => { tap(); onToggleHide() }}
            accessibilityLabel={isHidden ? t('home.premiumPopup.reveal') : t('home.premiumPopup.hide')}
          >
            <ToggleIcon color={isHidden ? PRIMARY : PREMIUM} size={22} />
          </StatusAction>
        </>
      }
    />
  )
}

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
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(initialPaneFromNotif ?? HOME_PANE)
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

  // Profile sheet — slides up from the bottom as a full-screen popup showing the user's own match card.
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)
  const profileSheetConfigRef = useRef(profileSheetOpen)
  useEffect(() => { profileSheetConfigRef.current = profileSheetOpen }, [profileSheetOpen])
  const shellHeight = useSharedValue(Dimensions.get('window').height)
  const profileSheetSlide = useSharedValue(0)
  const profileSheetScrollAtTop = useSharedValue(true)
  const profileSheetHeaderBottom = useSharedValue(0)
  // Measured bottom of the home shell's TabStrip. Used to anchor the profile
  // sheet just below the tabs so the card doesn't slide behind them.
  const tabStripBottom = useSharedValue(0)
  const profileSheetGestureRef = useRef<import('react-native-gesture-handler').GestureType | undefined>(undefined)
  const profileSheetAnimStyle = useAnimatedStyle(() => ({
    top: tabStripBottom.value,
    transform: [{ translateY: (1 - profileSheetSlide.value) * shellHeight.value }],
  }))
  const closeProfileSheetFn = () => setProfileSheetOpen(false)
  const closeProfileSheet = () => {
    tap()
    profileSheetScrollAtTop.value = true
    profileSheetSlide.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
      'worklet'
      if (finished) runOnJS(closeProfileSheetFn)()
    })
  }
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
        profileSheetSlide.value = 1 - Math.min(1, drag / shellHeight.value)
      })
      .onEnd(e => {
        'worklet'
        const drag = e.translationY
        const vy = e.velocityY
        const past = drag > shellHeight.value * 0.3
        const flick = vy > 500
        if (past || flick) {
          profileSheetSlide.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }, (finished) => {
            'worklet'
            if (finished) runOnJS(closeProfileSheetFn)()
          })
        } else {
          profileSheetSlide.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })
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
    if (config.kind === 'profileSection') {
      setProfileSheetOpen(true)
      profileSheetSlide.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) })
    }
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
  // "Show me to people" button: visible whenever there are no viewers and no
  // active page2 profile (pending/dead invite, post-approve lock, etc.) and
  // we're not in chat. Server-enforced 1h cooldown between presses, mirrored
  // here so the button shows as disabled (faded) before the cooldown elapses.
  const ADD_COOLDOWN_MS = 60 * 60 * 1000
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
    getLocPermission().then(setLocPerm)
  }, [notifPerm])

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
    if (notifPerm !== 'granted' || locPerm !== 'granted') return
    if (startupSentRef.current) return
    startupSentRef.current = true
    ;(async () => {
      // Get location + push token in parallel, then send app/start.
      startLocFetch()
      const [location, token] = await Promise.all([
        getLocation().finally(stopLocFetch),
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
      if (!location) setLocFailed(true)
    })()
  }, [notifPerm, locPerm])

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

  const showLocOverlay = locPerm !== 'granted'

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
      // Re-check location using the fresh notif result, not a stale closure value
      if (np === 'granted') getLocPermission().then(setLocPerm)
      // Send app/focus with last known location (only after initial startup completed, max once per 30s)
      if (startupSentRef.current && Date.now() - lastFocusRef.current > 30_000) {
        lastFocusRef.current = Date.now()
        const location = await getLastKnownLocation()
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
  useEffect(() => {
    if (notifPerm !== 'granted') return
    const id = setInterval(() => getLocPermission().then(setLocPerm), 2000)
    return () => clearInterval(id)
  }, [notifPerm])

  // ── Continuous location tracking ──────────────────────────────────────
  // After startup completes, watch for significant movement and push
  // updates to the server so distance calculations stay fresh.
  // A 60s interval guarantees at least one update per minute even when
  // the user is standing still (watchLocation only fires on movement).
  useEffect(() => {
    if (!startupSentRef.current || locPerm !== 'granted') return
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
  }, [locPerm, locFailed])

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
    if (prev === undefined) return
    // Clear discovery flag if invite went away (cancelled / approved / etc).
    if (prev !== null && page2InviteUserId === null) {
      setPage2Discovery(false)
    }
    if (prev === null && page2InviteUserId !== null) {
      // Fresh incoming invite — fire discovery animation when the card mounts.
      setPage2Discovery(true)
      if (paneIndexRef.current !== PAGE2_PANE) {
        setPage2Alerting(true)
        const timer = setTimeout(() => setPage2Alerting(false), 4900)
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
      const timer = setTimeout(() => setChatUnreadAlerting(false), 4900)
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
      withTiming(peek, { duration: 550, easing: Easing.out(Easing.cubic) }),
      withDelay(
        1000,
        withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }, finished => {
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
  }, [state, displayedMatch?.user_id, runFirstTimeDemo])

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
    setPreloadingMatch(current => {
      if (!current || current.user_id !== readyUserId) return current
      // Reset the pull transform first — pull-to-skip leaves pullY at screenH
      // (the outer wrapper translated off-screen). Mounting the new card while
      // the outer wrapper is still translated means SlideInDown plays inside
      // an off-screen container, invisible to the user. requestAnimationFrame
      // gives the UI thread a chance to apply pullY=0 before React mounts the
      // new keyed Animated.View.
      pullY.value = 0
      requestAnimationFrame(() => {
        setDisplayedMatch(current)
      })
      setTimeout(() => setSearching(false), 480)
      if (ignoreLoadingRef.current) {
        setIgnoreLoading(false)
        setBusy(false)
        setPendingKey(null)
      }
      return null
    })
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
  const [removeWatcherTarget, setRemoveWatcherTarget] = useState<Profile | null>(null)
  const [removeWatcherBusy, setRemoveWatcherBusy] = useState(false)
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
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
  const inviteInvitedAt = invitedPage1?.invited_at
  const inviteTotalSecs = inviteExpiresAt && inviteInvitedAt
    ? Math.max(60, Math.round((new Date(inviteExpiresAt).getTime() - new Date(inviteInvitedAt).getTime()) / 1000))
    : 3600

  // Title/description for terminal locked-message cards. Keyed by the raw v3
  // server `message` (page1.message / page2.message), not the legacy `event`
  // shim — keeps the lookup orthogonal to userStore's missed/fail synthesis.
  const page1Message = isEndedState ? invitedPage1?.message : undefined
  const page1MessageTitle = page1Message ? t(`home.locked.page1.${page1Message}.title` as never) : ''
  const page1MessageDesc = page1Message ? t(`home.locked.page1.${page1Message}.desc` as never) : ''
  const page2Message = page2DeadInvite?.message
  const page2MessageTitle = page2Message ? t(`home.locked.page2.${page2Message}.title` as never) : ''
  const page2MessageDesc = page2Message ? t(`home.locked.page2.${page2Message}.desc` as never) : ''

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

  const pullEnabled = state === 'watching' && !demoPlaying
  // Capture screen height in JS — Dimensions isn't available inside the
  // gesture worklets (UI thread), so we close over a plain number. Lifted
  // to component scope so the pull-down chevron cue can fade against the
  // same threshold the gesture commits at.
  const screenH = Dimensions.get('window').height
  const commitDistance = screenH * 0.5
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
          pullY.value = withTiming(screenH, { duration: 280, easing: Easing.out(Easing.cubic) })
          runOnJS(runIgnore)()
        }
      })
      .onFinalize(() => {
        'worklet'
        // Safety net — if the gesture didn't commit (snap back), or was
        // cancelled mid-pull, animate the card back to position 0. Without
        // this, a cancelled pan would leave the card stuck partway down.
        if (!slidOut.value) {
          pullY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
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
    <View style={[styles.watchingInviteBlock, { paddingBottom: Math.max(bottomInset, SINGLE) }]}>
      <Text style={styles.watchingInviteTitle}>
        {tgg('home.inviteConfirmTitle' as any, isMale, matchIsMale).replace('{name}', matchName)}
      </Text>
      <Text style={styles.watchingInviteLead}>{leadDesc}</Text>
      {tailDesc ? <Text style={styles.watchingInviteDesc}>{tailDesc}</Text> : null}
      <View style={styles.watchingInviteButtonWrap}>
        <Button
          variant="primary"
          label={t('home.inviteConfirmOk')}
          iconEnd={<SparklesIcon color={WHITE} />}
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
    )
  })() : null

  // Hero-photo overlay button on the page1 MatchCard:
  //   - watching → default heart (omit actions → MatchCard falls back).
  //   - chat     → dots menu (opens end-chat / block / report sheet).
  //   - else (waiting, ended) → no button at all. The relevant action for
  //     those states lives elsewhere (timer's cancel, message-block's
  //     continue), so a heart on the hero would just be noise.
  const page1CardActions: CardAction[] | undefined =
    state === 'chat'
      ? [{
          key: 'chat-menu',
          icon: <DotsIcon color={WHITE} size={ICON.xxxl} />,
          onPress: () => { tap(); setChatMenuOpen(true) },
        }]
      : state === 'watching'
        ? undefined
        : []

  const matchButtons = (() => {
    if (!isMatchCardOpen) return null
    if (state === 'watching') {
      // No bottom button row in the watching state — invite lives inside
      // the card scroll (see watchingInviteButton above).
      return null
    }
    if (state === 'waiting') {
      // Cancel lives inside the timer card (InfoBlock's onCancel STOP
      // button), so the bottom button row is unused in this state.
      return null
    }
    if (state === 'chat') {
      return null
    }
    if (isEndedState) {
      // Continue affordance now lives inside the MessageBlock at the top of
      // the card (StatusAction-style, matching cancel/accept/reject buttons
      // in the live-timer states). No pinned bottom row in ended states.
      return null
    }
    return null
  })()

  const isNetMode = !showNotifOverlay && !showLocOverlay && !locFailed && showNoInternetOverlay

  const permConfirmLabel = showNotifOverlay
    ? tg('home.notifPromptButton', isMale)
    : showLocOverlay
      ? tg('home.locationPromptButton', isMale)
      : locFailed
        ? tg('home.locationUnavailableButton', isMale)
        : tg('home.noInternetButton', isMale)

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
  const cardButtons = isMatchCardOpen ? matchButtons : null

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
  const tabChipSide: TabChip | null = chatAvailable
    ? (chatUnread > 0
        ? { value: chatUnread, bg: WHITE, fg: PRIMARY }
        : null)
    : (!page2PendingInvite && !page2DeadInvite && watchersCount > 0
        ? { value: watchersCount, bg: WHITE, fg: PRIMARY }
        : null)
  // Page2 has two "needs attention" states surfaced as an inline indicator
  // next to the side-tab label:
  //   - pending invite → inbox glyph + "הזמנה" label, pulses on arrival.
  //   - dead invite (cancel/expire/decline/fail) → pause glyph, paused-ish.
  // Dead-invite uses the same pause glyph as the menu tab's game-mode pause
  // because both communicate "this side is on hold" rather than an error.
  const sideIndicator = chatAvailable
    ? undefined
    : page2PendingInvite
      ? <InboxIcon color={WHITE} size={ICON.sm} />
      : page2DeadInvite
        ? <PauseIcon color={WHITE} size={ICON.sm} />
        : undefined
  const sideAlerting = chatAvailable
    ? chatUnreadAlerting
    : (page2PendingInvite ? page2Alerting : false)
  // While the profile preview sheet (opened from Menu) is up, the Menu tab
  // doubles as the close affordance — render an X icon and clear the
  // game-mode dot (irrelevant in that state). Tap handler below closes the
  // sheet on any tab tap (and navigates to the tapped pane for the others).
  const tabSpecs: TabSpec[] = [
    profileSheetOpen
      ? {
          // Label + small X indicator next to it — same geometry as the
          // pause indicator in the gameModeOff variant, so the menu tab
          // reads consistently across states (label-leading, glyph-trailing)
          // rather than swapping into a single oversized icon.
          label: t('home.tabs.closeProfile'),
          indicator: <CloseBoldIcon color={WHITE} size={ICON.sm} />,
        }
      : {
          label: gameModeOff ? t('settings.gameMode.off') : t('home.tabs.menu'),
          indicator: gameModeOff ? <PauseIcon color={WHITE} size={ICON.sm} /> : undefined,
        },
    { label: t('home.tabs.home') },
    {
      label: chatAvailable
        ? t('home.tabs.chat')
        : page2PendingInvite
          ? t('home.tabs.invite')
          : t('home.tabs.viewers'),
      chip: tabChipSide,
      indicator: sideIndicator,
      alerting: sideAlerting,
    },
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

  return (
    <View style={styles.backdrop}>
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <StatusBar style="light" backgroundColor={PRIMARY} translucent={false} />
        <View
          style={[styles.tabStripContainer, { paddingTop: topInset + RADII.sm }]}
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
          initialPage={initialPaneFromNotif ?? HOME_PANE}
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
                    {/* Empty pane — vertically centers a single group of
                        [headline + avatar] with a generous gap between them.
                        Headline is the gradient SVG label; its text swaps
                        with state (scanning / ready-to-find / no-one-nearby
                        / "לא עכשיו" during pull). The action button stays
                        anchored at the bottom. When a match card is showing
                        on top, this whole pane sits behind it; the card
                        sliding down reveals the centered group. */}
                    <View style={styles.permScreen}>
                      <View style={{ flex: 1 }} />
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
                                setProfileSheetOpen(true)
                                profileSheetSlide.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) })
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
                      <View style={{ flex: 1 }} />
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
                            /* Inner element owns the layout animations. Kept
                               separate from pullStyle so SlideInDown/SlideOutDown's
                               transform isn't clobbered by useAnimatedStyle. */
                            <Animated.View
                              key={displayedMatch.user_id}
                              entering={matchHasMountedRef.current ? SlideInDown.duration(420).easing(Easing.out(Easing.cubic)) : undefined}
                              exiting={SlideOutDown.duration(380).easing(Easing.in(Easing.cubic))}
                              style={styles.matchCardWrap}
                            >
                              <View style={styles.matchPhoto}>
                                <MatchCard
                                  match={displayedMatch}

                                  viewerFamily={profile?.family ?? null}
                                  bottomInset={0}
                                  hideTime={state === 'chat'}
                                  actions={page1CardActions}
                                  topBlock={
                                    displayedCardMode === 'waiting' && inviteExpiresAt ? (
                                      <InfoBlock
                                        expiresAt={inviteExpiresAt}
                                        totalSecs={inviteTotalSecs}
                                        extended={invitedPage1?.extended}
                                        targetIsMale={matchIsMale}
                                        userIsMale={isMale}
                                        onCancel={() => { tap(); setCancelConfirmOpen(true) }}
                                      />
                                    ) : isEndedState && page1MessageTitle ? (
                                      <MessageBlock
                                        title={page1MessageTitle}
                                        description={page1MessageDesc}
                                        onContinue={() => runAction('app/clear1', 'ended-stop')}
                                        busy={busy && pendingKey === 'ended-stop'}
                                      />
                                    ) : undefined
                                  }
                                  footerBlock={watchingInviteButton}
                                  footerBg={watchingInviteButton ? PRIMARY : undefined}
                                />
                              </View>
                              {cardButtons && (
                                <HomeButtons>{cardButtons}</HomeButtons>
                              )}
                            </Animated.View>
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
                  onConfirm={permOnConfirm}
                  onCancel={() => {}}
                  busy={permBusyState}
                  tone="positive"
                />

                {/* Chat-state actions menu (opened from MatchCard dots).
                    paddingBottom = safe-area bottom + DOUBLE so the last row
                    sits clear of the home-indicator gesture area. */}
                <BottomSheet
                  visible={chatMenuOpen}
                  onDismiss={() => setChatMenuOpen(false)}
                  contentStyle={[chatMenuStyles.sheet, { paddingBottom: Math.max(bottomInset, SINGLE) + DOUBLE }]}
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
                    <DiscoveryReveal
                      key={page2PendingInvite.user_id}
                      enabled={page2Discovery}
                      centerAvatarUrl={profileAvatarUrl}
                      onComplete={() => setPage2Discovery(false)}
                    >
                      {({ onImagesReady }) => (
                        <MatchCard
                          match={page2PendingInvite}
                          actions={[]}
                          viewerFamily={profile?.family ?? null}
                          bottomInset={0}
                          onReady={page2Discovery ? onImagesReady : undefined}
                          topBlock={page2PendingInvite.expires_at ? (
                            <InfoBlock
                              expiresAt={page2PendingInvite.expires_at}
                              totalSecs={page2PendingInvite.invited_at
                                ? Math.max(60, Math.round((new Date(page2PendingInvite.expires_at).getTime() - new Date(page2PendingInvite.invited_at).getTime()) / 1000))
                                : 600}
                              extended={page2PendingInvite.extended}
                              targetIsMale={page2PendingInvite.is_male}

                              mode="invitee"
                              busy={busy}
                              onAccept={() => runAction('app/approve', 'replying-accept')}
                              onReject={() => { tap(); setRefuseConfirmOpen(true) }}
                            />
                          ) : undefined}
                        />
                      )}
                    </DiscoveryReveal>
                  </View>
                ) : page2DeadInvite ? (
                  <View style={styles.matchPhoto}>
                    <MatchCard
                      match={page2DeadInvite}
                      actions={[]}
                      viewerFamily={profile?.family ?? null}
                      bottomInset={0}
                      topBlock={page2MessageTitle ? (
                        <MessageBlock
                          title={page2MessageTitle}
                          description={page2MessageDesc}
                          onContinue={() => runAction('app/free2', 'free2')}
                          busy={busy && pendingKey === 'free2'}
                        />
                      ) : undefined}
                    />
                  </View>
                ) : (
                  // Premium "Hide / Reveal / Add viewers" CTA is always
                  // anchored at the bottom of the page2 pane regardless of
                  // whether the viewers list has anyone in it. The pane
                  // splits into a flexing content area (watchers list or
                  // empty-state illustration) and a fixed CTA row below.
                  <View style={{ flex: 1 }}>
                    {watchers.length > 0 ? (
                      <PullScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        contentContainerStyle={styles.watchersScrollContent}
                      >
                        <Page2StatusCard
                          isHidden={isHidden}
                          userIsMale={isMale}
                          addEnabled={addEnabled}
                          addCooldownLabel={addCooldownLabel}
                          addCooldownSecsLeft={addCooldownSecsLeft}
                          addCooldownTotalSecs={Math.floor(ADD_COOLDOWN_MS / 1000)}
                          busyKey={busy ? pendingKey : null}
                          onBroadcast={() => runAction('app/add', 'add')}
                          onToggleHide={() => {
                            if (isHidden) {
                              runAction('app/free2', 'free2')
                            } else if (watchers.length === 0) {
                              runAction('app/lock2', 'lock2')
                            } else {
                              setHideConfirmOpen(true)
                            }
                          }}
                          title={null}
                          description={t('home.watchingMePhotosHidden')}
                        />
                        <View style={styles.watchersList}>
                          {watchers.map((w) => (
                            <WatcherCard
                              key={w.user_id}
                              watcher={w}
                              onPress={() => { tap(); setRemoveWatcherTarget(w) }}
                            />
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
                        <Page2StatusCard
                          isHidden={isHidden}
                          userIsMale={isMale}
                          addEnabled={addEnabled}
                          addCooldownLabel={addCooldownLabel}
                          addCooldownSecsLeft={addCooldownSecsLeft}
                          addCooldownTotalSecs={Math.floor(ADD_COOLDOWN_MS / 1000)}
                          busyKey={busy ? pendingKey : null}
                          onBroadcast={() => runAction('app/add', 'add')}
                          onToggleHide={() => {
                            if (isHidden) runAction('app/free2', 'free2')
                            else runAction('app/lock2', 'lock2')
                          }}
                        />
                        <View style={styles.telescopeWrap}>
                          {isHidden ? <HiddenMoonIllustration /> : <TelescopeIllustration />}
                        </View>
                      </PullScrollView>
                    )}
                  </View>
                )}
              </View>}
            </View>,
          ]}
        </AnimatedPagerView>
        {profileSheetOpen && (
          <Animated.View style={[styles.profileSheetOverlay, profileSheetAnimStyle]}>
            <GestureDetector gesture={profileSheetSwipe}>
              <View style={{ flex: 1 }}>
                <PreviewFieldPage
                  config={{ kind: 'preview', title: t('settings.myProfile') }}
                  onBack={closeProfileSheet}
                  dismissGestureRef={profileSheetGestureRef}
                  onScrollAtTop={onProfileSheetScrollAtTop}
                  headerBottomShared={profileSheetHeaderBottom}
                  clipBottom
                />
              </View>
            </GestureDetector>
          </Animated.View>
        )}
        <ConfirmDialog
          visible={hideConfirmOpen}
          title={t('home.hideConfirmTitle')}
          description={t('home.hideConfirmDesc')}
          confirmLabel={t('home.hideConfirmButton')}
          premium
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
    paddingHorizontal: SINGLE,
    paddingBottom: RADII.sm,
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
  // the sheet stretched to the bottom of the screen.
  profileSheetOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    start: 0,
    end: 0,
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
    paddingVertical: SINGLE,
    paddingHorizontal: SINGLE,
    alignItems: 'stretch',
  },
  watchingMeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: BLACK_STRONG,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 6,
  },
  rightNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 22,
    marginBottom: 14,
  },
  rightNowLine: {
    height: 1,
    width: 36,
    backgroundColor: PRIMARY,
    opacity: 0.5,
  },
  rightNowText: {
    fontSize: 12,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: 1.4,
  },
  morePeopleText: {
    fontSize: 13,
    color: BLACK_STRONG,
    textAlign: 'center',
    marginTop: 14,
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
  // Centered group: headline (gradient SVG label) + avatar with rings,
  // stacked vertically with a generous gap. The two flex:1 spacers above
  // and below push the group into the visual center of the home pane.
  permCenterGroup: {
    alignItems: 'center',
    gap: DOUBLE * 4,
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
    gap: 12,
  },
  // Two-button horizontal row used by WATCHING/REPLYING. flex:1 cells so
  // both buttons share width evenly regardless of label length.
  buttonRow: {
    flexDirection: 'row',
    gap: SINGLE,
  },
  buttonCell: {
    flex: 1,
  },
  buttonCellReject: {
    flex: 1,
  },
  buttonCellAccept: {
    flex: 2,
  },
  watchingInviteBlock: {
    backgroundColor: WHITE,
    paddingHorizontal: DOUBLE,
    paddingTop: DOUBLE,
    paddingBottom: DOUBLE,
    gap: RADIUS,
  },
  watchingInviteTitle: {
    fontSize: TEXT.h2,
    fontWeight: WEIGHT.bold,
    color: PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  watchingInviteLead: {
    fontSize: TEXT.body,
    lineHeight: 24,
    color: PRIMARY,
    textAlign: 'center',
  },
  watchingInviteDesc: {
    fontSize: TEXT.body,
    lineHeight: 24,
    color: PRIMARY,
    textAlign: 'center',
  },
  watchingInviteButtonWrap: {
    marginTop: SINGLE,
  },
})
