import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, I18nManager, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, useColorScheme, Modal } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureType } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, withSequence, withDelay, cancelAnimation, interpolateColor, useFrameCallback, Easing, runOnJS, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'
import { Text } from '../src/components/AppText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle } from 'react-native-svg'
import { invoke, markStartupComplete, publicImageUrl } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, clearInitialNotification, openNotifSettings, dismissAllNotifications, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { TEXT_PRIMARY, WHITE, BLACK, PRIMARY, PRIMARY_BG, DESTRUCTIVE, GRAY_50, GRAY_100, GRAY_400, PREMIUM, PREMIUM_BG } from '../src/colors'
import { SINGLE, DOUBLE, RADIUS } from '../src/fonts'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { MatchCard } from '../src/components/MatchCard'
import { DiscoveryReveal } from '../src/components/DiscoveryReveal'
import { CountBadge } from '../src/components/CountBadge'
import { HomeHeader } from '../src/components/HomeHeader'
import { HomeCard, PullScrollView, PullContext, type PullCtx } from '../src/components/HomeCard'
import { HomeButtons } from '../src/components/HomeButtons'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SelectFieldConfig, SelectFieldPage, SubPageConfig, AgeRangeFieldPage, RadiusFieldPage, AdminFieldPage, AccountFieldPage, AboutFieldPage, PreviewFieldPage, AppSectionPage, ShellInnerNavContext } from './settings'
import ChatPage from './chat'
import { OnceLogo } from '../src/components/OnceLogo'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'
import { useSelfAvatar, setSelfAvatarFromLocal, setSelfAvatarFromRemote } from '../src/lib/selfAvatar'


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

// Single-figure silhouette: circle head + trapezoid/rectangular torso.
// `variant` shapes the torso so a viewer reads it as one gender or the other.
function PersonGlyph({ variant, size = 140 }: { variant: 'M' | 'F'; size?: number }) {
  const color = 'rgba(0,0,0,0.12)'
  const w = size
  const h = Math.round(size * 1.15)
  return (
    <Svg width={w} height={h} viewBox="0 0 100 120">
      <Circle cx={50} cy={28} r={20} fill={color} />
      {variant === 'F' ? (
        <Path d="M18 116 L34 54 L66 54 L82 116 Z" fill={color} />
      ) : (
        <Path d="M22 116 V 82 C 22 66 34 54 50 54 C 66 54 78 66 78 82 V 116 Z" fill={color} />
      )}
    </Svg>
  )
}

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

function HeartIcon({ color, size = 28, filled }: { color: string; size?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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

function PaperPlaneIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2L11 13" />
      <Path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  )
}

// ── Watching-Me page icons ────────────────────────────────────────────────

function LockIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 11h14v10H5z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M8 11V8a4 4 0 1 1 8 0v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  )
}

function SparkleIcon({ color, size = 14, style }: { color: string; size?: number; style?: any }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
      <Path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
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

// Sparkle/star used as the leading icon on the premium button. Solid fill so
// it pops against the purple background.
function PremiumStarIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
    </Svg>
  )
}

// Three blurred avatar-like circles with subtle decorative sparkles —
// communicates "more might be watching" without showing fake data.
function PotentialPresence() {
  const pulse = useSharedValue(0)
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
  }, [])
  const aStyle = useAnimatedStyle(() => ({ opacity: 0.22 + pulse.value * 0.10 }))
  const bStyle = useAnimatedStyle(() => ({ opacity: 0.30 + pulse.value * 0.10 }))
  const cStyle = useAnimatedStyle(() => ({ opacity: 0.22 + pulse.value * 0.10 }))
  return (
    <View style={{ alignItems: 'center', marginTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <SparkleIcon color={PRIMARY} size={14} style={{ opacity: 0.55 }} />
        <Animated.View style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: PRIMARY }, aStyle]} />
        <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, backgroundColor: PRIMARY }, bStyle]} />
        <Animated.View style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: PRIMARY }, cStyle]} />
        <SparkleIcon color={PRIMARY} size={12} style={{ opacity: 0.45 }} />
      </View>
    </View>
  )
}

function PreferredGenderGlyph({ forMale, forFemale, size = 140 }: { forMale: boolean; forFemale: boolean; size?: number }) {
  if (forMale && forFemale) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <PersonGlyph variant="F" size={size * 0.82} />
        <PersonGlyph variant="M" size={size * 0.82} />
      </View>
    )
  }
  if (forFemale) return <PersonGlyph variant="F" size={size} />
  return <PersonGlyph variant="M" size={size} />
}


// ── Message ────────────────────────────────────────────────────────────────
// Centered title + description block. Used as the main content surface for
// every per-state variant of this screen (HIDDEN, WATCHING, WAITING, etc.).

function renderWithEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <Text key={i} style={messageStyles.emphasis}>{part.slice(2, -2)}</Text>
      : part
  )
}

// ── Premium options popup ────────────────────────────────────────────────
// Bottom-sheet shown when the user taps the purple "Premium options" CTA on
// the page2 (Watching Me) pane. Two tiles:
//   1. Add — pulls candidates into page2.profiles[] (existing app_add). When
//      already on cooldown the tile is disabled with the remaining time.
//   2. Hide / Reveal — toggles page2.state between free and locked. Hidden
//      users are excluded from new finds; revealing puts them back in the
//      pool. Always tappable (no cooldown).
//
// Visual language matches AddOptionsPopup in settings.tsx: tile grid, drag
// pill, slide-from-bottom + tap-outside dismiss. Accent color is PREMIUM
// (purple) to distinguish a paid surface from free brand-color actions.

function PremiumOptionsPopup({
  visible,
  hidden,
  addEnabled,
  addCooldownLabel,
  busyKey,
  onDismiss,
  onAdd,
  onToggleHide,
}: {
  visible: boolean
  hidden: boolean
  addEnabled: boolean
  addCooldownLabel: string | null
  busyKey: string | null
  onDismiss: () => void
  onAdd: () => void
  onToggleHide: () => void
}) {
  const translateY = useSharedValue(420)
  const cardHeight = useSharedValue(420)
  const dragY = useSharedValue(0)
  const insets = useSafeAreaInsets()
  const [modalVisible, setModalVisible] = useState(false)

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })
      })
    } else if (modalVisible) {
      translateY.value = withTiming(cardHeight.value, { duration: 240, easing: Easing.in(Easing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const swipeDismiss = Gesture.Pan()
    .activeOffsetY(8).failOffsetY(-8)
    .onUpdate(e => { 'worklet'; dragY.value = Math.max(0, e.translationY) })
    .onEnd(e => {
      'worklet'
      if (e.translationY > 80 || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 240, easing: Easing.in(Easing.cubic) })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) })
      }
    })

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const addBusy = busyKey === 'add'
  const toggleBusy = busyKey === 'lock2' || busyKey === 'free2'
  const addTileDisabled = !addEnabled
  const addLabel = addCooldownLabel
    ? `${t('home.premiumPopup.add')}   ${addCooldownLabel}`
    : t('home.premiumPopup.add')
  const toggleLabel = hidden ? t('home.premiumPopup.reveal') : t('home.premiumPopup.hide')
  const ToggleIcon = hidden ? EyeOpenIcon : EyeOffIcon

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      {/* GHRH is required because the Modal renders into a detached native
          tree, so the app-root GestureHandlerRootView doesn't apply here.
          Without it the GestureDetector can't observe events and the inner
          Pressable taps are swallowed. */}
      <GestureHandlerRootView style={premiumPopupStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <GestureDetector gesture={swipeDismiss}>
          <Animated.View
            style={slideStyle}
            onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
          >
            {/* Soft top-edge shadow (same gradient pattern as AddOptionsPopup
                / ConfirmDialog) so the sheet reads as floating above the
                page behind, even without a backdrop dim. */}
            <View style={premiumPopupStyles.shadowGradient} pointerEvents="none">
              {[0.005,0.01,0.012,0.015,0.018,0.02,0.022,0.025,0.028,0.03,0.032,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.075].map((o, i) => (
                <View key={i} style={[premiumPopupStyles.shadowLayer, { opacity: o }]} />
              ))}
            </View>
            <View style={[premiumPopupStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) + SINGLE }]}>
              <View style={premiumPopupStyles.pill} />
              <View style={premiumPopupStyles.row}>
                <Pressable
                  style={[
                    premiumPopupStyles.tile,
                    addTileDisabled && premiumPopupStyles.tileDisabled,
                    addBusy && premiumPopupStyles.tilePressed,
                  ]}
                  onPress={() => { if (!addTileDisabled && !addBusy) { tap(); onAdd() } }}
                >
                  <View style={premiumPopupStyles.iconWrap}>
                    <MegaphoneIcon color={addTileDisabled ? GRAY_400 : PREMIUM} />
                  </View>
                  <Text
                    style={[premiumPopupStyles.tileLabel, addTileDisabled && premiumPopupStyles.tileLabelDisabled]}
                    numberOfLines={2}
                  >
                    {addLabel}
                  </Text>
                </Pressable>
                <Pressable
                  style={[premiumPopupStyles.tile, toggleBusy && premiumPopupStyles.tilePressed]}
                  onPress={() => { if (!toggleBusy) { tap(); onToggleHide() } }}
                >
                  <View style={[premiumPopupStyles.iconWrap, premiumPopupStyles.iconWrapPrimary]}>
                    <ToggleIcon color={PRIMARY} />
                  </View>
                  <Text style={premiumPopupStyles.tileLabel} numberOfLines={2}>
                    {toggleLabel}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const premiumPopupStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  shadowGradient: { height: 60, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: SINGLE,
  },
  pill: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: GRAY_100,
    alignSelf: 'center', marginBottom: SINGLE,
  },
  row: {
    flexDirection: 'row',
    gap: SINGLE,
  },
  tile: {
    flex: 1,
    backgroundColor: GRAY_50,
    borderRadius: RADIUS,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 132,
  },
  tilePressed: { opacity: 0.7 },
  tileDisabled: { opacity: 0.55 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: PREMIUM_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapPrimary: {
    backgroundColor: PRIMARY_BG,
  },
  tileLabel: {
    fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, textAlign: 'center',
    // Reserve room for two lines so a tile whose label wraps (e.g. the add
    // tile when its cooldown countdown is appended) lines up vertically with
    // a tile whose label is single-line. Without this, the icons sit at
    // different heights and the row reads as uneven.
    lineHeight: 18,
    minHeight: 36,
    textAlignVertical: 'center',
  },
  tileLabelDisabled: { color: GRAY_400 },
})

function Message({
  state,
  title,
  subtitle,
  desc,
  hideDesc,
  badgeCount,
  titleColorOverride,
}: {
  state: string
  title?: string
  subtitle?: string
  desc: string
  // Suppress the desc when it's rendered separately below the watchers.
  hideDesc?: boolean
  // Optional count pill rendered next to the title. Used for the
  // "watching you" title in visible-with-watchers mode.
  badgeCount?: number
  titleColorOverride?: string
}) {
  const titleColor = titleColorOverride
  const titleNode = title ? (
    <Text style={[messageStyles.title, titleColor ? { color: titleColor } : null]}>
      {title}
    </Text>
  ) : null
  return (
    <View style={messageStyles.wrap}>
      {badgeCount != null && badgeCount !== 0 ? (
        <View style={messageStyles.titleRow}>
          {titleNode}
          <CountBadge value={badgeCount} color={titleColor ?? TEXT_PRIMARY} />
        </View>
      ) : titleNode}
      {subtitle ? (
        <Text style={messageStyles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {!hideDesc && (
        <View style={messageStyles.descWrap}>
          <Text style={messageStyles.desc}>{renderWithEmphasis(desc)}</Text>
        </View>
      )}
    </View>
  )
}

const messageStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  descWrap: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
  desc: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  emphasis: {
    fontWeight: '700',
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

const TIMER_RING_SIZE = 112
const TIMER_RING_RADIUS = (TIMER_RING_SIZE - 8) / 2
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS

function CircularTimer({ expiresAt, totalSecs, extended, targetIsMale, userIsMale, mode = 'inviter' }: { expiresAt: string; totalSecs: number; extended?: boolean; targetIsMale?: boolean | null; userIsMale?: boolean | null; mode?: 'inviter' | 'invitee' }) {
  const secsLeft = useSecsLeft(expiresAt)
  const isExpired = secsLeft === 0
  const isUrgent = secsLeft > 0 && secsLeft < 120
  const progress = Math.max(0, Math.min(1, secsLeft / Math.max(1, totalSecs)))

  const ringColor = isExpired ? DESTRUCTIVE : PRIMARY
  const labelColor = isExpired ? DESTRUCTIVE : PRIMARY
  const dashLen = TIMER_RING_CIRCUMFERENCE * progress

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

  return (
    <View style={timerStyles.container}>
      <View style={timerStyles.ringWrap}>
        <Svg width={TIMER_RING_SIZE} height={TIMER_RING_SIZE}>
          <Circle
            cx={TIMER_RING_SIZE / 2}
            cy={TIMER_RING_SIZE / 2}
            r={TIMER_RING_RADIUS}
            stroke={PRIMARY_BG}
            strokeWidth={4}
            fill="none"
          />
          <Circle
            cx={TIMER_RING_SIZE / 2}
            cy={TIMER_RING_SIZE / 2}
            r={TIMER_RING_RADIUS}
            stroke={ringColor}
            strokeWidth={4}
            fill="none"
            strokeDasharray={`${dashLen} ${TIMER_RING_CIRCUMFERENCE}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${TIMER_RING_SIZE / 2} ${TIMER_RING_SIZE / 2})`}
          />
        </Svg>
        <Animated.View style={[timerStyles.ringCenter, blinkStyle]} pointerEvents="none">
          <Text style={[timerStyles.expiresLabel, { color: labelColor }]}>
            {t(extended ? 'home.inviteTimerLabelExtended' : 'home.inviteTimerLabel')}
          </Text>
          <Text style={[timerStyles.clock, (isUrgent || isExpired) && { color: ringColor }]}>{formatClock(secsLeft)}</Text>
        </Animated.View>
      </View>
      <Text style={timerStyles.combinedText}>
        {mode === 'invitee'
          ? tg('home.replyingTimerDesc', userIsMale ?? null)
          : `${tg('home.waitingNoInvitesTitle', targetIsMale ?? null)} ${tg('home.waitingNoInvitesSubtext', targetIsMale ?? null)}`}
      </Text>
    </View>
  )
}

const timerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2EE',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: RADIUS,
    marginBottom: 12,
  },
  expiresLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  ringWrap: {
    width: TIMER_RING_SIZE,
    height: TIMER_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
  },
  combinedText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    color: TEXT_PRIMARY,
    marginStart: 20,
    textAlign: 'center',
  },
})

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets()
  const { profile } = useUserStore()
  const colorScheme = useColorScheme()
  // ── Horizontal pager shell ──────────────────────────────────────────────
  // 2-page layout: [home(0), side(1)]
  // Settings opens as an overlay that slides over the current page — not a pager slot.
  // RTL right→left: Home | Side(page2/chat)  — Settings overlays from the right
  type PaneIndex = 0 | 1
  const HOME_PANE: PaneIndex = 0
  const PAGE2_PANE: PaneIndex = 1
  const CHAT_PANE: PaneIndex = 1  // same slot as PAGE2_PANE
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
  const [subPageConfig, setSubPageConfig] = useState<SubPageConfig | null>(null)
  // Unread message count reported by ChatPage — shown as a badge next to the
  // "Chat" title while we're on the home pane.
  const [chatUnread, setChatUnread] = useState(0)
  // SettingsPage reports when the user is editing photos (iOS-style jiggle).
  // While that's active, PagerView scrolling is disabled so dragging a photo
  // to reorder doesn't slide the whole pane.
  const sliding = useSlidingActive()
  const pagerRef = useRef<PagerView>(null)
  const paneIndexRef = useRef(paneIndex)
  const paneIndexSV = useSharedValue<number>(paneIndex)
  useEffect(() => {
    paneIndexRef.current = paneIndex
    paneIndexSV.value = paneIndex
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
  const profileSheetGestureRef = useRef<import('react-native-gesture-handler').GestureType | undefined>(undefined)
  const profileSheetAnimStyle = useAnimatedStyle(() => ({
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

  // SubPage — slides in as an overlay on top of Settings.
  // afterSlideRef holds a callback to run after the sub-page is removed
  // (e.g. SelectFieldPage fires onSelect, then slides back).
  const afterSlideRef = useRef<(() => Promise<void> | void) | null>(null)
  const shellWidth = useSharedValue(Dimensions.get('window').width)
  const subPageSlide = useSharedValue(0)
  const [subPageOpen, setSubPageOpen] = useState(false)
  const subPageDir = I18nManager.isRTL ? 1 : -1
  const subPageAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: subPageDir * (1 - subPageSlide.value) * shellWidth.value }],
  }))
  // ── Settings overlay ────────────────────────────────────────────────────
  const [settingsIsOpen, setSettingsIsOpen] = useState(false)
  const settingsProgress = useSharedValue(0)
  const settingsIsOpenSV = useSharedValue(0)
  // Settings panel position: opposite side of the Side pane so the two swipe
  // gestures are in opposite directions and don't compete.
  // - LTR: Side is to the right (slot 1) → Settings panel on the LEFT
  // - RTL: Side is to the left (slot 1) → Settings panel on the RIGHT
  // The user opens Settings with a swipe AWAY from the Side direction.
  const settingsAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (I18nManager.isRTL ? 1 : -1) * (1 - settingsProgress.value) * shellWidth.value }],
  }))

  // Swipe-to-dismiss: manualActivation so we resolve direction before
  // committing. Activates once horizontal movement is clear; fails on
  // vertical (lets scroll through). Photo drag coexists via long-press
  // threshold on dragPan — quick touches go to swipe, held touches to drag.
  const doCloseSubPage = () => { closeShellSubPage() }
  const swipeStartX = useSharedValue(0)
  const swipeStartY = useSharedValue(0)
  // Inner sub-page state owned by the shell so swipe-back / hardware-back
  // can drive the inner animation directly. Section pages (profile / app)
  // share `innerSlide` via ShellInnerNavContext and register a finalize
  // callback so the shell can complete the close after a swipe.
  const innerSlide = useSharedValue(0)
  const innerOpenSV = useSharedValue(0)
  const innerOpenRef = useRef(false)
  const innerCloseRef = useRef<() => void>(() => {})
  const innerFinalizeRef = useRef<() => void>(() => {})
  const shellInnerNav = useMemo(() => ({
    slideProgress: innerSlide,
    setHandlers: (h: { isOpen: boolean; close: () => void; finalizeClose: () => void } | null) => {
      innerOpenRef.current = !!h?.isOpen
      innerOpenSV.value = h?.isOpen ? 1 : 0
      innerCloseRef.current = h?.close ?? (() => {})
      innerFinalizeRef.current = h?.finalizeClose ?? (() => {})
    },
  }), [])
  const finalizeInnerClose = () => { innerFinalizeRef.current() }
  const subPageSwipe = useMemo(() =>
    Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e, _manager) => {
        'worklet'
        const t = e.allTouches[0]
        if (!t) return
        swipeStartX.value = t.absoluteX
        swipeStartY.value = t.absoluteY
      })
      .onTouchesMove((e, manager) => {
        'worklet'
        const t = e.allTouches[0]
        if (!t) return
        const dx = t.absoluteX - swipeStartX.value
        const dy = t.absoluteY - swipeStartY.value
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        if (adx < 6 && ady < 6) return  // wait for clear intent
        if (ady > adx * 0.8) { manager.fail(); return }  // vertical → scroll
        manager.activate()
      })
      .onUpdate(e => {
        'worklet'
        const drag = subPageDir * e.translationX
        if (drag <= 0) return
        const t = 1 - Math.min(1, drag / shellWidth.value)
        // When the section page has an inner sub-page open, the swipe
        // closes the inner level first and the shell sub-page stays put.
        if (innerOpenSV.value === 1) {
          innerSlide.value = t
        } else {
          subPageSlide.value = t
        }
      })
      .onEnd(e => {
        'worklet'
        const drag = subPageDir * e.translationX
        const vx = subPageDir * e.velocityX
        const past = drag > shellWidth.value * 0.3
        const flick = vx > 400
        if (innerOpenSV.value === 1) {
          if (past || flick) {
            innerSlide.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }, (finished) => {
              'worklet'
              if (finished) runOnJS(finalizeInnerClose)()
            })
          } else {
            innerSlide.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })
          }
          return
        }
        if (past || flick) {
          subPageSlide.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }, (finished) => {
            'worklet'
            if (finished) runOnJS(doCloseSubPage)()
          })
        } else {
          subPageSlide.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })
        }
      })
  , [])

  const openSettings = useCallback(() => {
    settingsIsOpenSV.value = 1
    setSettingsIsOpen(true)
    settingsProgress.value = withTiming(1, { duration: 260, easing: Easing.bezier(0.4, 0, 1, 1) })
  }, [])

  const closeSettings = useCallback(() => {
    settingsIsOpenSV.value = 0
    // Flip React state immediately so the open gesture re-enables right away;
    // waiting for the animation to finish (240ms) blocked rapid open-close-open.
    setSettingsIsOpen(false)
    settingsProgress.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.4, 0, 1, 1) })
  }, [])

  const applySettingsOpen = useCallback(() => {
    setSettingsIsOpen(true)
  }, [])
  const applySettingsClosed = useCallback(() => {
    setSettingsIsOpen(false)
  }, [])

  const settingsGestureStartProgress = useSharedValue(1)

  // Close gesture — Settings panel position is RTL-dependent (left in LTR,
  // right in RTL), so the close direction mirrors that: closing pushes the
  // panel back off-screen, i.e. opposite to the open direction.
  const settingsCloseGesture = useMemo(() => {
    const isRTL = I18nManager.isRTL
    return Gesture.Pan()
      .activeOffsetX(isRTL ? 5 : -5)
      .failOffsetX(isRTL ? -12 : 12)
      .failOffsetY([-10, 10])
      .onBegin(() => {
        'worklet'
        cancelAnimation(settingsProgress)
        settingsGestureStartProgress.value = settingsProgress.value
      })
      .onUpdate((e) => {
        'worklet'
        const closeDrag = isRTL ? e.translationX : -e.translationX
        settingsProgress.value = Math.max(0, Math.min(1, settingsGestureStartProgress.value - closeDrag / shellWidth.value))
      })
      .onEnd((e) => {
        'worklet'
        const closeDrag = isRTL ? e.translationX : -e.translationX
        const closeVel = isRTL ? e.velocityX : -e.velocityX
        const shouldClose = closeDrag > shellWidth.value * 0.3 || closeVel > 400
        if (shouldClose) {
          settingsIsOpenSV.value = 0
          runOnJS(applySettingsClosed)()
          // Duration proportional to remaining distance so the slide-out is always visible.
          const duration = Math.max(120, Math.round(settingsProgress.value * 220))
          settingsProgress.value = withTiming(0, { duration, easing: Easing.bezier(0.4, 0, 1, 1) })
        } else {
          settingsProgress.value = withSpring(1, {
            velocity: -closeVel / shellWidth.value,
            stiffness: 300, damping: 40, mass: 1, overshootClamping: true,
          })
        }
      })
  }, [applySettingsClosed])

  // Open gesture — direction depends on RTL, opposite of the PagerView slot-1
  // (Side) navigation direction.
  // - LTR: Side reachable by left-swipe → Settings opens on RIGHT-swipe.
  // - RTL: Side reachable by right-swipe → Settings opens on LEFT-swipe.
  // iOS specific: UIPageViewController's internal UIScrollView pan recognizer
  // is aggressive about claiming horizontal touches. We use manualActivation
  // with a small (3px) directional threshold and pair it with a
  // Gesture.Native() wrapping the PagerView via requireExternalGestureToFail
  // so the native pager pan is forced to wait for ours to fail before it can
  // claim the touch. Without this, RNGH and the native scroll view race for
  // the gesture and ours only wins on a fraction of iOS swipes.
  const settingsOpenPanRef = useRef<import('react-native-gesture-handler').GestureType | undefined>(undefined)
  const settingsOpenGesture = useMemo(() => {
    const isRTL = I18nManager.isRTL
    const openDir = isRTL ? -1 : 1
    return Gesture.Pan()
      .withRef(settingsOpenPanRef)
      .manualActivation(true)
      .onTouchesDown((e, manager) => {
        'worklet'
        if (paneIndexSV.value !== HOME_PANE || settingsIsOpenSV.value > 0) {
          manager.fail()
          return
        }
        const t = e.allTouches[0]
        if (!t) return
        swipeStartX.value = t.absoluteX
        swipeStartY.value = t.absoluteY
      })
      .onTouchesMove((e, manager) => {
        'worklet'
        const t = e.allTouches[0]
        if (!t) return
        const dx = t.absoluteX - swipeStartX.value
        const dy = t.absoluteY - swipeStartY.value
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        if (adx < 3 && ady < 12) return  // wait for clear intent
        if (ady > adx * 2) { manager.fail(); return }  // mostly vertical → ignore
        if (openDir * dx < 0) { manager.fail(); return }  // wrong dir → PagerView handles
        manager.activate()
      })
      .onBegin(() => {
        'worklet'
        cancelAnimation(settingsProgress)
        settingsGestureStartProgress.value = settingsProgress.value
      })
      .onUpdate((e) => {
        'worklet'
        const openDrag = openDir * e.translationX
        settingsProgress.value = Math.max(0, Math.min(1, settingsGestureStartProgress.value + openDrag / shellWidth.value))
      })
      .onEnd((e) => {
        'worklet'
        const openDrag = openDir * e.translationX
        const openVel = openDir * e.velocityX
        const shouldOpen = openDrag > shellWidth.value * 0.25 || openVel > 250
        if (shouldOpen) {
          settingsIsOpenSV.value = 1
          runOnJS(applySettingsOpen)()
        }
        settingsProgress.value = withSpring(shouldOpen ? 1 : 0, {
          velocity: (shouldOpen ? openVel : -openVel) / shellWidth.value,
          stiffness: 300, damping: 40, mass: 1, overshootClamping: true,
        })
      })
  }, [applySettingsOpen])

  // Native gesture wrapping the PagerView. requireExternalGestureToFail makes
  // the PagerView's native pan recognizer wait for the open gesture to fail
  // (which it does immediately on wrong direction or vertical motion) before
  // it can activate. This is the iOS fix — without it the native scroll view
  // races RNGH and frequently wins.
  const pagerNativeGesture = useMemo(
    () => Gesture.Native().requireExternalGestureToFail(settingsOpenPanRef),
    [],
  )

// Resolved when subPageOpen flips to true — lets a button that triggered
  // the open await the moment the slide actually starts and show a loading
  // state until then.
  const subPageOpenResolveRef = useRef<(() => void) | null>(null)

  // Drive sub-page slide from open/closed state.
  useEffect(() => {
    if (subPageOpen) {
      subPageSlide.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
      const resolve = subPageOpenResolveRef.current
      subPageOpenResolveRef.current = null
      resolve?.()
    } else if (subPageConfigRef.current) {
      subPageSlide.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet'
        if (finished) runOnJS(onSubPageClosed)()
      })
    }
  }, [subPageOpen])

  // chatAvailable: state is 'chat'
  const chatAvailable = profile?.state === 'chat'
  const [chatJustStarted, setChatJustStarted] = useState(false)


  const goToPane = (index: PaneIndex) => {
    if (index === paneIndexRef.current) return
    tap()
    paneIndexRef.current = index
    paneIndexSV.value = index
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

  const subPageConfigRef = useRef(subPageConfig)
  useEffect(() => { subPageConfigRef.current = subPageConfig }, [subPageConfig])
  const onPageSelected = (e: { nativeEvent: { position: number } }) => {
    const pane = e.nativeEvent.position as PaneIndex
    if (pane !== paneIndexRef.current) {
      tap()
      paneIndexRef.current = pane
      paneIndexSV.value = pane
      setPaneIndex(pane)
    }
  }


  const [subPageCloseCount, setSubPageCloseCount] = useState(0)
  const onSubPageClosed = useCallback(() => { setSubPageCloseCount(c => c + 1) }, [])
  useEffect(() => {
    if (subPageCloseCount === 0) return
    const cb = afterSlideRef.current
    afterSlideRef.current = null
    setSubPageConfig(null)
    if (cb) Promise.resolve(cb()).catch(console.error)
  }, [subPageCloseCount])

  const openShellSubPage = (config: SubPageConfig): Promise<void> => {
    tap()
    if (config.kind === 'profileSection') {
      setProfileSheetOpen(true)
      profileSheetSlide.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) })
      return Promise.resolve()
    }
    setSubPageConfig(config)
    // setSubPageOpen is triggered by the overlay's onLayout once native
    // finishes laying out the subPage tree — guarantees the slide starts
    // on a free UI thread without a fixed-time wait. The returned promise
    // resolves when the slide actually starts, so callers can show a
    // loading state on the triggering button until then.
    return new Promise<void>(resolve => {
      const prev = subPageOpenResolveRef.current
      subPageOpenResolveRef.current = () => { prev?.(); resolve() }
    })
  }

  const closeShellSubPage = (afterSlide?: () => Promise<void> | void) => {
    tap()
    afterSlideRef.current = afterSlide ?? null
    setSubPageOpen(false)
  }



  // Android hardware back — when on the sub-page, slide it out;
  // when on any other side pane, slide back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (innerOpenRef.current) {
        innerCloseRef.current()
        return true
      }
      if (profileSheetConfigRef.current) {
        closeProfileSheet()
        return true
      }
      if (subPageConfigRef.current) {
        closeShellSubPage()
        return true
      }
      if (settingsIsOpenSV.value > 0.5) {
        closeSettings()
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
  const page2InviteName = (page2InviteObj?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  const rawPage1State = profile?.relations?.page1?.state
  // Server-side v3 page2.state, preserved by deriveCompat. We need the raw
  // value (free / pending / chat / locked) to drive the premium popup's
  // hide/reveal toggle separately from the legacy shimmed page2 shape.
  const page2State = (profile?.relations as { page2State?: 'free'|'pending'|'chat'|'locked' } | undefined)?.page2State
  const isHidden = page2State === 'locked' && !page2InviteObj
  const [premiumPopupOpen, setPremiumPopupOpen] = useState(false)
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
  const addCooldownLabel = (() => {
    if (addEnabled || !lastAddAt) return null
    const remainingMs = Math.max(0, lastAddAt + ADD_COOLDOWN_MS - Date.now())
    const totalSec = Math.ceil(remainingMs / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  })()
  const isMale = profile?.is_male ?? null
  const ready = !!profile

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
      } else if (paneIndexRef.current !== HOME_PANE) {
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
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)
  const [removeWatcherTarget, setRemoveWatcherTarget] = useState<Profile | null>(null)
  const [removeWatcherBusy, setRemoveWatcherBusy] = useState(false)
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const [hasBeenActiveThisSession, setHasBeenActiveThisSession] = useState(false)

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

  const invitedPage1 = profile?.relations?.page1 as { expires_at?: string; invited_at?: string; extended?: boolean } | undefined
  const inviteExpiresAt = invitedPage1?.expires_at
  const inviteInvitedAt = invitedPage1?.invited_at
  const inviteTotalSecs = inviteExpiresAt && inviteInvitedAt
    ? Math.max(60, Math.round((new Date(inviteExpiresAt).getTime() - new Date(inviteInvitedAt).getTime()) / 1000))
    : 3600

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

  const pullEnabled = state === 'watching'
  const cardPan = useMemo(() => {
    // Capture screen height in JS — Dimensions isn't available inside the
    // gesture worklets (UI thread), so we close over a plain number.
    const screenH = Dimensions.get('window').height
    const commitDistance = screenH * 0.5
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
        // Commit if the user pulled past the screen-half mark, OR flicked
        // down with strong velocity. Continue the slide off-screen on the
        // UI thread immediately — without this, pullY stays frozen at the
        // finger's release position for the 1-2 frames it takes the JS
        // thread to handle setDisplayedMatch(null), which reads as the card
        // briefly sticking before SlideOutDown picks it up.
        const pulled = Math.max(0, e.translationY)
        if (pulled >= commitDistance || e.velocityY > 1500) {
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

  const matchButtons = (() => {
    if (!isMatchCardOpen) return null
    if (state === 'watching') {
      return (
        <View style={styles.watchingButtonRow}>
          <View style={styles.buttonCellReject}>
            <Button
              variant="secondary"
              label={t('home.watchingReject')}
              onPress={runIgnore}
              disabled={busy || ignoreLoading}
              loading={ignoreLoading}
              silentDisabled={!ignoreLoading && pendingKey !== 'watching-reject'}
            />
          </View>
          <View style={styles.buttonCellAccept}>
            <Button
              variant="primary"
              tone="positive"
              label={tg('home.watchingAccept', matchIsMale ?? null)}
              iconEnd={<SparklesIcon color={WHITE} />}
              onPress={() => { tap(); setInviteConfirmOpen(true) }}
              disabled={busy}
              silentDisabled
            />
          </View>
        </View>
      )
    }
    if (state === 'waiting') {
      return (
        <Button variant="secondary" label={t('home.cancelWaitingBtn')} onPress={() => { tap(); setCancelConfirmOpen(true) }} disabled={busy} />
      )
    }
    if (state === 'chat') {
      return null
    }
    if (isEndedState) {
      return (
        <Button
          variant="primary"
          label={t('home.endedBack')}
          onPress={() => runAction('app/clear1', 'ended-stop')}
          disabled={busy}
          loading={busy && pendingKey === 'ended-stop'}
          silentDisabled={pendingKey !== 'ended-stop'}
        />
      )
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
    openSettings()
  }

  const page1Event = profile?.relations?.page1?.event
  // v3: synth state is null for both `free` (find ran, no candidate) and `locked`
  // without message (brand-new user, or post-clear). Only the latter is "ready to
  // find" — when state is `free` we surface the no-one-nearby + Search Preferences UI.
  const isReadyToFind = state === null && rawPage1State !== 'free'
  useEffect(() => {
    if (state !== null && state !== undefined && !hasBeenActiveThisSession) {
      setHasBeenActiveThisSession(true)
    }
  }, [state])
  const hiddenButtons = showHiddenPlaceholder
    ? isReadyToFind
      ? (
        <Button
          variant="primary"
          tone="positive"
          label={hasBeenActiveThisSession ? tg('home.readyToContinue', isMale) : t('home.startNow')}
          onPress={runFind}
          disabled={busy || locFetching || startupInflight || focusInflight || searching || !startupCompleted}
          loading={busy && pendingKey === 'hidden-find'}
          silentDisabled={pendingKey !== 'hidden-find'}
        />
      )
      : (
        <Button variant="soft" label={t('home.changePreferences')} onPress={goToPreferences} />
      )
    : null

  const cardButtons = isMatchCardOpen ? matchButtons : null

  // ── Header props ──────────────────────────────────────────────────────
  const endedProfileIsMale = profile?.relations?.page1?.profile?.is_male ?? null
  const headerTitle =
    state === 'chat' ? t('home.chatHeader')
    : state === 'waiting' ? t('push.WAITING')
    : isEndedState ? tg(`home.ended.${state}.${page1Event}` as any, endedProfileIsMale)
    : t('home.hiddenHeader2')

  const headerArrow = undefined

  const headerBadge = undefined
  const headerBadgeColor = undefined

  const handleStatusToggle = async () => {}

  const statusMenuOptions = undefined


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

  return (
    <View style={styles.backdrop}>
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <StatusBar style="dark" />
        {/* Pass pages as an array to avoid React 19 falsy-children issues
            with react-native-pager-view's childrenWithOverriddenStyle. */}
        <GestureDetector gesture={settingsOpenGesture}>
        <View style={{ flex: 1 }}>
        <GestureDetector gesture={pagerNativeGesture}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={initialPaneFromNotif ?? HOME_PANE}
          scrollEnabled={!sliding && !subPageOpen && !settingsIsOpen}
          overdrag={false}
          overScrollMode="never"
          onPageSelected={onPageSelected}
        >
          {[
            // Slot 0: home (page1 — outgoing)
            <View key="home" style={{ flex: 1 }}>
              <View style={[styles.root, { paddingTop: topInset }]}>
                <HomeHeader
                  title={headerTitle}
                  titleColor={isEndedState ? DESTRUCTIVE : undefined}
                  arrow={headerArrow}
                  badge={headerBadge}
                  badgeColor={headerBadgeColor}
                  centered
                  page2Arrow={chatAvailable
                    ? { onPress: () => goToPane(CHAT_PANE), icon: 'chat' as const, count: chatUnread, alerting: chatUnreadAlerting }
                    : { onPress: () => goToPane(PAGE2_PANE), hasInvite: !!page2PendingInvite, hasDead: !!page2DeadInvite, alerting: page2Alerting, count: watchers?.length ?? 0 }
                  }
                  onSettingsPress={openSettings}
                  disabled={busy}
                  loading={busy}
                  dotPulsing={locFetching || busy}
                />
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
                    <View style={styles.permScreen}>
                      <View style={styles.permAvatarSection}>
                        <View style={styles.permAvatarWrap}>
                          <AvatarHaloRings />
                          <RadarRings active={startupCompleted && (focusInflight || searching)} />
                          <Pressable
                            onPress={() => {
                              tap()
                              setProfileSheetOpen(true)
                              profileSheetSlide.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) })
                            }}
                          >
                            {avatarDisplayUrl ? (
                              <Image source={{ uri: avatarDisplayUrl }} placeholder={avatarPlaceholder} style={styles.permAvatar} contentFit="cover" cachePolicy="memory-disk" />
                            ) : (
                              <View style={[styles.permAvatar, styles.permAvatarFallback]} />
                            )}
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.permTextSection}>
                        {startupCompleted && (focusInflight || searching) ? (
                          // Scanning text only after app/start has resolved.
                          // During boot we stay silent so the user doesn't
                          // see a "scanning" state on launch.
                          <Text style={styles.permDesc}>{t('home.locatingDesc')}</Text>
                        ) : !showHiddenPlaceholder || cardExiting ? (
                          // Card visible or sliding down (and no HTTP/GPS in
                          // flight): no text under the avatar — avoids the
                          // "One profile at a time" flickering in/out.
                          null
                        ) : isReadyToFind ? (
                          <Text style={styles.permHeadline}>{t(hasBeenActiveThisSession ? 'home.continueHeadline' : 'home.startHeadline')}</Text>
                        ) : (
                          <>
                            <Text style={styles.permHeadline}>{t('home.noOneNearbyTitle')}</Text>
                            <Text style={[styles.permDesc, { marginTop: 8 }]}>{tg('home.noOneNearbyDesc', isMale)}</Text>
                          </>
                        )}
                      </View>
                      <View style={{ flex: 1 }} />
                      <View style={styles.permActions}>
                        {hiddenButtons}
                      </View>
                    </View>
                  </View>

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
                              <View style={[styles.matchPhoto, !cardButtons && { marginBottom: bottomInset }]}>
                                <MatchCard
                                  match={displayedMatch}
                                  userIsMale={isMale}
                                  units={profile?.units}
                                  viewerFamily={profile?.family ?? null}
                                  bottomInset={0}
                                  hideTime={state === 'chat'}
                                  topBlock={displayedCardMode === 'waiting' && inviteExpiresAt ? (
                                    <CircularTimer expiresAt={inviteExpiresAt} totalSecs={inviteTotalSecs} extended={invitedPage1?.extended} targetIsMale={matchIsMale} />
                                  ) : undefined}
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
                            userIsMale={isMale}
                            units={profile?.units}
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
                  visible={inviteConfirmOpen}
                  title={t('home.inviteConfirmTitle').replace('{name}', matchName)}
                  description={inviteConfirmDesc.replace(/\{name\}/g, matchName)}
                  cancelLabel={t('home.watchingReject')}
                  confirmLabel={t('home.inviteConfirmOk')}
                  tone="positive"
                  onCancel={() => { if (!busy) setInviteConfirmOpen(false) }}
                  onConfirm={() => runAction('app/invite', 'invite-confirm', () => setInviteConfirmOpen(false))}
                  busy={busy}
                  draggable
                />

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

              </View>
            </View>,

            // Slot 2: side — page2 or chat depending on chatAvailable
            <View key="side" style={{ flex: 1 }}>
              {chatAvailable ? (
                <ChatPage
                  key={profile?.relations?.match?.user_id ?? 'no-match'}
                  onBack={() => goToPane(HOME_PANE)}
                  isActive={paneIndex === CHAT_PANE}
                  onUnreadChange={setChatUnread}
                  topInset={topInset}
                  autoFocusInput={chatJustStarted}
                />
              ) : <View style={[styles.root, { paddingTop: topInset }]}>
                <HomeHeader
                  title={
                    page2PendingInvite ? tg('push.REPLYING', page2PendingInvite.is_male ?? null)
                    : page2InviteObj?.message ? tg(`home.page2.${page2InviteObj.message}` as any, page2InviteObj.is_male)
                    : page2InviteObj?.state === 'missed' ? t('push.OTHER_CANCELLED')
                    : page2InviteObj?.state === 'fail' ? t('home.inviteExpired')
                    : isHidden ? t('home.watchingMeHiddenHeader')
                    : t('home.hiddenHeaderTitle')
                  }
                  titleColor={page2InviteObj?.state === 'missed' || page2InviteObj?.state === 'fail' ? DESTRUCTIVE : undefined}
                  centered
                  endIcon="none"
                  startIcon="back"
                  onSettingsPress={() => goToPane(HOME_PANE)}
                  disabled={busy}
                  loading={busy}
                />
                {page2PendingInvite ? (
                  <HomeCard
                    buttons={
                      <View style={styles.waitingActions}>
                        <View style={styles.buttonRow}>
                          <View style={styles.buttonCellReject}>
                            <Button
                              variant="softDestructive"
                              label={t('home.replyingReject')}
                              onPress={() => { tap(); setRefuseConfirmOpen(true) }}
                              disabled={busy}
                              silentDisabled
                            />
                          </View>
                          <View style={styles.buttonCellAccept}>
                            <Button
                              variant="primary"
                              tone="positive"
                              label={t('home.replyingAccept')}
                              iconEnd={<CheckIcon color={WHITE} />}
                              onPress={() => runAction('app/approve', 'replying-accept')}
                              disabled={busy}
                              loading={busy && pendingKey === 'replying-accept'}
                              silentDisabled={pendingKey !== 'replying-accept'}
                            />
                          </View>
                        </View>
                      </View>
                    }
                  >
                    <View style={StyleSheet.absoluteFill}>
                      <DiscoveryReveal
                        key={page2PendingInvite.user_id}
                        enabled={page2Discovery}
                        centerAvatarUrl={profileAvatarUrl}
                        onComplete={() => setPage2Discovery(false)}
                      >
                        {({ onImagesReady }) => (
                          <MatchCard
                            match={page2PendingInvite}
                            userIsMale={isMale}
                            units={profile?.units}
                            viewerFamily={profile?.family ?? null}
                            bottomInset={0}
                            onReady={page2Discovery ? onImagesReady : undefined}
                            topBlock={page2PendingInvite.expires_at ? (
                              <CircularTimer
                                expiresAt={page2PendingInvite.expires_at}
                                totalSecs={page2PendingInvite.invited_at
                                  ? Math.max(60, Math.round((new Date(page2PendingInvite.expires_at).getTime() - new Date(page2PendingInvite.invited_at).getTime()) / 1000))
                                  : 600}
                                extended={page2PendingInvite.extended}
                                targetIsMale={page2PendingInvite.is_male}
                                userIsMale={isMale}
                                mode="invitee"
                              />
                            ) : undefined}
                          />
                        )}
                      </DiscoveryReveal>
                    </View>
                  </HomeCard>
                ) : page2DeadInvite ? (
                  <HomeCard
                    buttons={
                      <Button
                        variant="primary"
                        label={tg('home.tapForMore', isMale)}
                        onPress={() => runAction('app/free2', 'free2')}
                        loading={busy && pendingKey === 'free2'}
                      />
                    }
                  >
                    <View style={StyleSheet.absoluteFill}>
                      <MatchCard
                        match={page2DeadInvite}
                        userIsMale={isMale}
                        units={profile?.units}
                        viewerFamily={profile?.family ?? null}
                        bottomInset={0}
                      />
                    </View>
                  </HomeCard>
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
                        contentContainerStyle={styles.watchingMeContent}
                      >
                        {watchers.map((w) => (
                          <View key={w.user_id} style={styles.watcherCardWrap}>
                            <WatcherCard
                              watcher={w}
                              units={profile?.units}
                              onPress={() => { tap(); setRemoveWatcherTarget(w) }}
                            />
                          </View>
                        ))}
                        <View style={styles.photosHiddenRow}>
                          <LockIcon color={GRAY_400} />
                          <Text style={styles.photosHiddenText}>{t('home.watchingMePhotosHidden')}</Text>
                        </View>
                      </PullScrollView>
                    ) : (
                      <PullScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        scrollEventThrottle={16}
                        contentContainerStyle={styles.watchingMeContent}
                      >
                        <View style={styles.telescopeWrap}>
                          {isHidden ? <HiddenMoonIllustration /> : <TelescopeIllustration />}
                        </View>
                        <Text style={styles.emptyTitle}>
                          {isHidden ? t('home.watchingMeHiddenTitle') : t('home.watchingMeNoOneTitle')}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                          {isHidden ? t('home.watchingMeHiddenSubtitle') : t('home.watchingMeNoOneSubtitle')}
                        </Text>
                      </PullScrollView>
                    )}
                    <View style={styles.watchingMeAddWrap}>
                      <Button
                        variant="primary"
                        label={t('home.premiumOptions')}
                        onPress={() => { tap(); setPremiumPopupOpen(true) }}
                      />
                    </View>
                  </View>
                )}
              </View>}
            </View>,
          ]}
        </PagerView>
        </GestureDetector>
        </View>
        </GestureDetector>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.settingsOverlay, settingsAnimStyle]}
          pointerEvents={settingsIsOpen ? 'auto' : 'none'}
        >
          <GestureDetector gesture={settingsCloseGesture}>
            <View style={{ flex: 1 }}>
              <SettingsPage onBack={closeSettings} focused={settingsIsOpen} onOpenSubPage={openShellSubPage} topInset={topInset} />
            </View>
          </GestureDetector>
        </Animated.View>
        {subPageConfig && (
          <Animated.View
            style={[styles.subPageOverlay, subPageAnimStyle]}
            pointerEvents={subPageOpen ? 'auto' : 'none'}
            onLayout={subPageOpen ? undefined : () => setSubPageOpen(true)}
          >
            <GestureDetector gesture={subPageSwipe}>
              <View style={{ flex: 1 }}>
                <ShellInnerNavContext.Provider value={shellInnerNav}>
                  {subPageConfig.kind === 'ageRange'
                    ? <AgeRangeFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                    : subPageConfig.kind === 'radius'
                      ? <RadiusFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                      : subPageConfig.kind === 'admin'
                        ? <AdminFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                        : subPageConfig.kind === 'account'
                            ? <AccountFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                            : subPageConfig.kind === 'about'
                                ? <AboutFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                                : subPageConfig.kind === 'appSection'
                                      ? <AppSectionPage config={subPageConfig} onBack={closeShellSubPage} />
                                      : <SelectFieldPage config={subPageConfig as SelectFieldConfig} onBack={closeShellSubPage} />}
                </ShellInnerNavContext.Provider>
              </View>
            </GestureDetector>
          </Animated.View>
        )}
        {profileSheetOpen && (
          <Animated.View style={[styles.profileSheetOverlay, profileSheetAnimStyle]}>
            <GestureDetector gesture={profileSheetSwipe}>
              <View style={{ flex: 1 }}>
                <View style={[styles.profileSheetHandle, { paddingTop: topInset + 10 }]} pointerEvents="none">
                  <View style={styles.profileSheetPill} />
                </View>
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
        <PremiumOptionsPopup
          visible={premiumPopupOpen}
          hidden={isHidden}
          addEnabled={addEnabled}
          addCooldownLabel={addCooldownLabel}
          busyKey={busy ? pendingKey : null}
          onDismiss={() => setPremiumPopupOpen(false)}
          onAdd={() => runAction('app/add', 'add', () => setPremiumPopupOpen(false))}
          onToggleHide={() => {
            // Reveal goes through directly (non-destructive). Hide is also
            // non-destructive when nobody is watching, so we skip the
            // confirm in that case and just call lock2. The confirm only
            // surfaces when current viewers would be kicked.
            if (isHidden) {
              runAction('app/free2', 'free2', () => setPremiumPopupOpen(false))
            } else if (watchers.length === 0) {
              runAction('app/lock2', 'lock2', () => setPremiumPopupOpen(false))
            } else {
              setPremiumPopupOpen(false)
              setHideConfirmOpen(true)
            }
          }}
        />

        <ConfirmDialog
          visible={hideConfirmOpen}
          title={t('home.hideConfirmTitle')}
          description={t('home.hideConfirmDesc')}
          confirmLabel={t('home.hideConfirmButton')}
          destructive
          onCancel={() => { if (!(busy && pendingKey === 'lock2')) setHideConfirmOpen(false) }}
          onConfirm={() => runAction('app/lock2', 'lock2', () => setHideConfirmOpen(false))}
          busy={busy && pendingKey === 'lock2'}
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
    backgroundColor: WHITE,
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: WHITE,
  },
  settingsOverlay: {
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 8,
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
  profileSheetOverlay: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  profileSheetHandle: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 10,
    zIndex: 10,
  },
  profileSheetPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  root: {
    flex: 1,
    backgroundColor: WHITE,
  },

  // ── Watching Me page (page2 viewers) ───────────────────────────────────
  watchingMeContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  watchingMeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
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
  watcherCardWrap: {
    marginBottom: 10,
  },
  photosHiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  photosHiddenText: {
    fontSize: 13,
    color: GRAY_400,
  },
  morePeopleText: {
    fontSize: 13,
    color: GRAY_400,
    textAlign: 'center',
    marginTop: 14,
  },
  telescopeWrap: {
    alignItems: 'center',
    marginTop: 80,
    marginBottom: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
    marginTop: 4,
  },
  watchingMeAddWrap: {
    paddingHorizontal: SINGLE,
    paddingTop: 12,
    paddingBottom: 24,
  },
  // Match-card pane wrapper: column layout so the photo and the buttons
  // row stack vertically inside one Animated.View. Side margin matches the
  // old HomeCard cardWrapper.
  matchPaneWrapper: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: SINGLE,
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
  // Photo card surface: white background + rounded corners. Carries the
  // visual chrome that used to live on HomeCard.cardInner.
  matchPhoto: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  // ── Permission screen (no card) ────────────────────────────────────────
  permScreen: {
    flex: 1,
  },
  permAvatarSection: {
    alignItems: 'center',
    paddingTop: 120,
  },
  permTextSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 72,
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
    backgroundColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  permAvatarFallback: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: AVATAR_SIZE / 2,
  },
  permHeadline: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  permDesc: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  permActions: {
    paddingHorizontal: SINGLE,
    paddingBottom: 24,
    paddingTop: 0,
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
  watchingButtonRow: {
    flexDirection: 'row',
    gap: 12,
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
})
