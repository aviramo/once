import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { View, StyleSheet, I18nManager, BackHandler, Keyboard, AppState, Dimensions, Pressable, Platform, useColorScheme } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, withSequence, withDelay, cancelAnimation, interpolateColor, useFrameCallback, Easing, runOnJS } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'
import { Text } from '../src/components/AppText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle } from 'react-native-svg'
import { invoke, markStartupComplete, publicImageUrl } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore, type Profile, type Page2Invite } from '../src/stores/userStore'
import { t, tg, tgg, lang } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, getInitialNotificationType, clearInitialNotification, openNotifSettings, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openLocPermSettings, type LocPermission } from '../src/lib/location'
import * as Network from 'expo-network'
import { Button } from '../src/components/Button'
import { TEXT_PRIMARY, WHITE, BLACK, PRIMARY, PRIMARY_BG, DESTRUCTIVE, GRAY_50, GRAY_100, GRAY_400 } from '../src/colors'
import { SINGLE, DOUBLE } from '../src/fonts'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { MatchCard } from '../src/components/MatchCard'
import { DiscoveryReveal } from '../src/components/DiscoveryReveal'
import { CountBadge } from '../src/components/CountBadge'
import { HomeHeader } from '../src/components/HomeHeader'
import { HomeCard, PullScrollView } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SelectFieldConfig, SelectFieldPage, SubPageConfig, AgeRangeFieldPage, RadiusFieldPage, AdminFieldPage, AccountFieldPage, AboutFieldPage, PreviewFieldPage, AppSectionPage, ShellInnerNavContext } from './settings'
import ChatPage from './chat'
import { OnceLogo } from '../src/components/OnceLogo'
import { Image } from 'expo-image'
import { localPhotoUriCache } from '../src/components/PhotoEditor'


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
    borderRadius: 20,
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
    borderRadius: 16,
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
  const initialPaneFromNotif = useMemo<PaneIndex | null>(() => {
    const type = getInitialNotificationType()
    if (!type) return null
    if (type === 'chat' || type === 'match') return CHAT_PANE
    if (type === 'invite-in' || type === 'extended') return PAGE2_PANE
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
    settingsProgress.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.4, 0, 1, 1) }, (finished) => {
      'worklet'
      if (finished) runOnJS(setSettingsIsOpen)(false)
    })
  }, [])

  const applySettingsOpen = useCallback(() => {
    setSettingsIsOpen(true)
  }, [])
  const applySettingsClosed = useCallback(() => {
    setSettingsIsOpen(false)
  }, [])

  const settingsGestureStartProgress = useSharedValue(1)

  // Close gesture — lives inside the settings overlay, so it's only reachable
  // when settings is visible. No conflict with PagerView.
  const settingsCloseGesture = useMemo(() => {
    const isRTL = I18nManager.isRTL
    return Gesture.Pan()
      .activeOffsetX(isRTL ? 5 : -5)
      .failOffsetX(isRTL ? -5 : 5)
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

  // Open gesture — covers the full home pane area; enabled only when settings is
  // closed and the user is on HOME_PANE (same as original Drawer swipeEnabled logic).
  // activeOffsetX/failOffsetX do direction detection immediately, so the gesture
  // fails fast on wrong-direction swipes and lets PagerView / ScrollView handle them.
  const settingsOpenGesture = useMemo(() => {
    const isRTL = I18nManager.isRTL
    return Gesture.Pan()
      .activeOffsetX(isRTL ? -5 : 5)
      .failOffsetX(isRTL ? 5 : -5)
      .failOffsetY([-5, 5])
      .enabled(paneIndex === HOME_PANE && !settingsIsOpen)
      .onBegin(() => {
        'worklet'
        cancelAnimation(settingsProgress)
        settingsGestureStartProgress.value = settingsProgress.value
      })
      .onUpdate((e) => {
        'worklet'
        const openDrag = isRTL ? -e.translationX : e.translationX
        settingsProgress.value = Math.max(0, Math.min(1, settingsGestureStartProgress.value + openDrag / shellWidth.value))
      })
      .onEnd((e) => {
        'worklet'
        const openDrag = isRTL ? -e.translationX : e.translationX
        const openVel = isRTL ? -e.velocityX : e.velocityX
        const shouldOpen = openDrag > shellWidth.value * 0.3 || openVel > 400
        if (shouldOpen) {
          settingsIsOpenSV.value = 1
          runOnJS(applySettingsOpen)()
        }
        settingsProgress.value = withSpring(shouldOpen ? 1 : 0, {
          velocity: (shouldOpen ? openVel : -openVel) / shellWidth.value,
          stiffness: 300, damping: 40, mass: 1, overshootClamping: true,
        })
      })
  }, [paneIndex, settingsIsOpen, applySettingsOpen])

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
    setPaneIndex(index)
    pagerRef.current?.setPage(index)
  }

  // ── Notification tap handler ────────────────────────────────────────────
  // Route to the right pane when the user taps a push notification.
  const goToPaneRef = useRef(goToPane)
  goToPaneRef.current = goToPane
  useEffect(() => {
    return addNotificationTapListener(type => {
      if (type === 'chat' || type === 'match') goToPaneRef.current(CHAT_PANE)
      else if (type === 'invite-in' || type === 'extended') goToPaneRef.current(PAGE2_PANE)
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
  // v3: `page2.state = 'locked'` without a `message` means the user is
  // off-market and needs `free2` to become discoverable again. Lands here
  // for brand-new users, post-clear2, and after leave/logout/cron.
  // Suppressed while page1 drives an active flow (waiting/watching/chat) —
  // page2 resolves on its own when that flow resolves.
  const rawPage1State = profile?.relations?.page1?.state
  const rawPage2State = profile?.relations?.page2State
  const rawPage2Message = profile?.relations?.page2Message
  const page1InFlow = rawPage1State === 'waiting' || rawPage1State === 'watching' || rawPage1State === 'chat'
  const page2NeedsFree2 = rawPage2State === 'locked' && !rawPage2Message && !page1InFlow
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
  // Runs once on first mount after profile is ready. Shows a card-based
  // prompt (undetermined) or blocked message (denied) until granted.
  const [notifPerm, setNotifPerm] = useState<NotifPermission | null>(null)
  const notifCheckedRef = useRef(false)

  useEffect(() => {
    if (!ready || notifCheckedRef.current) return
    notifCheckedRef.current = true
    getNotifPermission().then(setNotifPerm)
  }, [ready])

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
  const [locPerm, setLocPerm] = useState<LocPermission | null>(null)
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

  // While we're still checking or the user hasn't granted permission,
  // the notification card overlay takes over the home pane content.
  const showNotifOverlay = notifPerm !== null && notifPerm !== 'granted'

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
      invoke('app/start', {
        ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
        ...(pushChanged ? { push_token: { type: 'expo', token } } : {}),
        os: Platform.OS,
        lang,
        appearance: colorScheme ?? 'light',
      }).catch(() => {})
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

  const showLocOverlay = locPerm !== null && locPerm !== 'granted'

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
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return
      const np = await getNotifPermission()
      setNotifPerm(np)
      // Re-check location using the fresh notif result, not a stale closure value
      if (np === 'granted') getLocPermission().then(setLocPerm)
      // Send app/focus with last known location (only after initial startup completed, max once per 30s)
      if (startupSentRef.current && Date.now() - lastFocusRef.current > 30_000) {
        lastFocusRef.current = Date.now()
        const location = await getLastKnownLocation()
        invoke('app/focus', location ? { location: { latitude: location.lat, longitude: location.lng } } : {}).catch(() => {})
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
        paneOpacity.value = 0
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
  // ignoreLoading stays true from the ignore tap until the next card finishes
  // its cross-fade (or until null-state cleanup fires). Keeps the skip button
  // in loading state across the full latency: API round-trip + image load + animation.
  const [ignoreLoading, setIgnoreLoadingState] = useState(false)
  const ignoreLoadingRef = useRef(false)
  const setIgnoreLoading = (v: boolean) => { ignoreLoadingRef.current = v; setIgnoreLoadingState(v) }

  // Two-slot system: A and B alternate as active/incoming.
  // The incoming slot loads invisibly on top (via topSlot zIndex), then
  // cross-fades over the active slot. finishTransition swaps roles and
  // clears the old slot — no remount of an already-measured MatchCard.
  type SlotId = 'A' | 'B'
  const [matchA, setMatchA] = useState<Profile | null>(profile?.relations?.match ?? null)
  const [matchB, setMatchB] = useState<Profile | null>(null)
  const activeSlotRef = useRef<SlotId>('A')
  const [topSlot, setTopSlot] = useState<SlotId>('B')
  const animRunning = useRef(false)
  // Discovery animation flags — set when slot transitions from null→profile.
  // Cleared when the DiscoveryReveal sequence completes.
  const [discoveryA, setDiscoveryA] = useState(false)
  const [discoveryB, setDiscoveryB] = useState(false)

  const opacityA = useSharedValue(profile?.relations?.match ? 1 : 0)
  const opacityB = useSharedValue(0)

  const cardStyleA = useAnimatedStyle(() => ({ opacity: opacityA.value }))
  const cardStyleB = useAnimatedStyle(() => ({ opacity: opacityB.value }))

  const matchARef = useRef(matchA)
  const matchBRef = useRef(matchB)
  useEffect(() => { matchARef.current = matchA }, [matchA])
  useEffect(() => { matchBRef.current = matchB }, [matchB])

  // The home pane wraps both panes in opacity-driven Animated.Views, so the
  // match card stays visually hidden when state is null without needing to
  // clear matchA/matchB synchronously. We keep the last known match in its
  // slot so brief null blips (e.g. ordering quirks between invoke responses
  // and realtime events) don't unmount the card.
  //
  // For genuine null states (cancel, leave, decline) we *do* want to clear
  // — otherwise a subsequent new match would cross-fade from the stale
  // card. Defer the clear by 250ms (just longer than the pane cross-fade);
  // quick blips never trigger it, but a real "back to empty" state does.
  const clearMatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const next = profile?.relations?.match ?? null
    const active = activeSlotRef.current
    const activeMatch = active === 'A' ? matchARef.current : matchBRef.current
    if (clearMatchTimeoutRef.current) {
      clearTimeout(clearMatchTimeoutRef.current)
      clearMatchTimeoutRef.current = null
    }
    if (!next) {
      clearMatchTimeoutRef.current = setTimeout(() => {
        if (ignoreLoadingRef.current) setIgnoreLoading(false)
        setMatchA(null)
        setMatchB(null)
        opacityA.value = 0
        opacityB.value = 0
        setDiscoveryA(false)
        setDiscoveryB(false)
        clearMatchTimeoutRef.current = null
      }, 250)
      return
    }
    if (next.user_id === activeMatch?.user_id) {
      if (active === 'A') setMatchA(next)
      else setMatchB(next)
      return
    }
    // Inactive slot already holds this profile (animation in progress) — don't interrupt.
    const inactiveMatch = active === 'A' ? matchBRef.current : matchARef.current
    if (next.user_id === inactiveMatch?.user_id) return
    if (active === 'A') {
      if (!activeMatch) {
        // Fresh appear — DiscoveryReveal owns the visual entrance.
        opacityB.value = 1
        setDiscoveryB(true)
      } else {
        opacityB.value = 0
      }
      setTopSlot('B')
      setMatchB(next)
    } else {
      if (!activeMatch) {
        opacityA.value = 1
        setDiscoveryA(true)
      } else {
        opacityA.value = 0
      }
      setTopSlot('A')
      setMatchA(next)
    }
  }, [profile?.relations?.match])

  const finishTransition = useCallback((newActive: SlotId) => {
    activeSlotRef.current = newActive
    if (newActive === 'B') {
      setMatchA(null)
      opacityA.value = 0
    } else {
      setMatchB(null)
      opacityB.value = 0
    }
    animRunning.current = false
    if (ignoreLoadingRef.current) setIgnoreLoading(false)
  }, [])

  const handleSlotReady = useCallback((slot: SlotId) => {
    if (slot === activeSlotRef.current) return
    if (animRunning.current) return
    animRunning.current = true
    // Skip cross-fade when the active slot is empty — just appear.
    const hasPrev = slot === 'B' ? !!matchARef.current : !!matchBRef.current
    const cfg = { duration: hasPrev ? 420 : 150 }
    if (slot === 'B') {
      opacityA.value = withTiming(0, cfg)
      opacityB.value = withTiming(1, cfg, (finished) => {
        'worklet'
        if (finished) runOnJS(finishTransition)('B')
      })
    } else {
      opacityB.value = withTiming(0, cfg)
      opacityA.value = withTiming(1, cfg, (finished) => {
        'worklet'
        if (finished) runOnJS(finishTransition)('A')
      })
    }
  }, [finishTransition])

  const handleSlotReadyA = useCallback(() => handleSlotReady('A'), [handleSlotReady])
  const handleSlotReadyB = useCallback(() => handleSlotReady('B'), [handleSlotReady])

  const watchers = profile?.relations?.watchers
    ? [...profile.relations.watchers].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    : []

  const showHiddenPlaceholder = !!profile && displayedCardMode === null
  // Both home-pane sections (empty placeholder and match card) are always
  // mounted. paneOpacity drives a cross-fade between them so brief state
  // transitions (e.g. invoke↔realtime races on invite) can't unmount the
  // match card. 0 = match visible, 1 = empty visible.
  const paneOpacity = useSharedValue(showHiddenPlaceholder ? 1 : 0)
  useEffect(() => {
    paneOpacity.value = withTiming(showHiddenPlaceholder ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) })
  }, [showHiddenPlaceholder])
  const emptyPaneStyle = useAnimatedStyle(() => ({ opacity: paneOpacity.value }))
  const matchPaneStyle = useAnimatedStyle(() => ({ opacity: 1 - paneOpacity.value }))
  const firstPhoto = profile?.images?.[0]
  const firstProfileImage = firstPhoto?.normal
  const profileAvatarUrl = firstProfileImage
    ? publicImageUrl(profile.user_id, 'normal', firstProfileImage)
    : null
  // While the photo is uploading to storage (deferred), use the local device URI
  // so the circle is filled immediately after onboarding. Once the upload is done
  // (localPhotoUriCache cleared), fall back to the remote URL with the blurhash
  // as a placeholder so there's no blank flash while the remote image downloads.
  const localAvatarUri = firstProfileImage ? (localPhotoUriCache.get(firstProfileImage) ?? null) : null
  const avatarDisplayUrl = localAvatarUri ?? profileAvatarUrl
  const avatarPlaceholder = !localAvatarUri && firstPhoto?.hash ? { blurhash: firstPhoto.hash } : undefined

  // If any watchers are listed when the user goes hidden, confirm first —
  // switching removes them all, which is destructive.
  const cardPullRef = useRef<(() => void) | null>(null)
  // Deferred resolve — keeps the card held at PULL_HOLD_Y until the
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

  const matchButtons = (() => {
    if (!isMatchCardOpen) return null
    if (state === 'watching') {
      return (
        <View style={styles.watchingButtonRow}>
          <View style={styles.buttonCellReject}>
            <Button
              variant="secondary"
              label={t('home.watchingReject')}
              onPress={() => {
                if (busy || ignoreLoading) return
                tap()
                setBusy(true)
                setPendingKey('watching-reject')
                setIgnoreLoading(true)
                invoke('app/ignore', {})
                  .then(() => { setBusy(false); setPendingKey(null) })
                  .catch(err => { console.error(err); setBusy(false); setPendingKey(null); setIgnoreLoading(false) })
              }}
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
          variant="soft"
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
          onPress={() => runAction('app/find', 'hidden-find')}
          disabled={busy}
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
    : state === 'watching' ? t('home.watchingTitle')
    : state === 'waiting' ? t('push.WAITING')
    : isEndedState ? tg(`home.ended.${state}.${page1Event}` as any, endedProfileIsMale)
    : t('home.hiddenHeader2')

  const headerArrow = undefined

  const headerBadge = undefined
  const headerBadgeColor = undefined

  const cardOnPull = undefined

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

  const booting = !ready || notifPerm === null || (notifPerm === 'granted' && locPerm === null)

  useEffect(() => {
    if (!booting) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [booting])

  return (
    <View style={styles.backdrop}>
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <StatusBar style="dark" />
        {/* Pass pages as an array to avoid React 19 falsy-children issues
            with react-native-pager-view's childrenWithOverriddenStyle. */}
        <GestureDetector gesture={settingsOpenGesture}>
        <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={initialPaneFromNotif ?? HOME_PANE}
          scrollEnabled={!sliding && !subPageOpen}
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
                  {/* Empty / no-match pane — always mounted, opacity-driven */}
                  <Animated.View
                    style={[StyleSheet.absoluteFill, emptyPaneStyle]}
                    pointerEvents={showHiddenPlaceholder ? 'auto' : 'none'}
                  >
                    <View style={styles.permScreen}>
                      <View style={styles.permAvatarSection}>
                        <View style={styles.permAvatarWrap}>
                          <AvatarHaloRings />
                          <RadarRings active={showHiddenPlaceholder && locFetching} />
                          {avatarDisplayUrl ? (
                            <Image source={{ uri: avatarDisplayUrl }} placeholder={avatarPlaceholder} style={styles.permAvatar} contentFit="cover" />
                          ) : (
                            <View style={[styles.permAvatar, styles.permAvatarFallback]} />
                          )}
                        </View>
                      </View>
                      <View style={styles.permTextSection}>
                        {locFetching ? (
                          <Text style={styles.permDesc}>{t('home.locatingDesc')}</Text>
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
                  </Animated.View>

                  {/* Match-card pane — always mounted, opacity-driven */}
                  <Animated.View
                    style={[StyleSheet.absoluteFill, matchPaneStyle]}
                    pointerEvents={showHiddenPlaceholder ? 'none' : 'auto'}
                  >
                    <HomeCard
                      onPull={cardOnPull}
                      pullRef={cardPullRef}
                      buttons={cardButtons}
                    >
                      {/* Slots stay mounted while a match exists, regardless of
                          state — visibility is driven by paneOpacity above. */}
                      <View style={StyleSheet.absoluteFill}>
                        {matchA && (
                          <Animated.View style={[StyleSheet.absoluteFill, cardStyleA, { zIndex: topSlot === 'A' ? 2 : 1 }]}>
                            <DiscoveryReveal
                              key={matchA.user_id}
                              enabled={discoveryA}
                              centerAvatarUrl={profileAvatarUrl}
                              onComplete={() => {
                                if (discoveryA) {
                                  finishTransition('A')
                                  setDiscoveryA(false)
                                }
                              }}
                            >
                              {({ onImagesReady, revealPhase }) => (
                                <MatchCard
                                  match={matchA}
                                  userIsMale={isMale}
                                  units={profile?.units}
                                  bottomInset={0}
                                  hideTime={state === 'chat'}
                                  onReady={discoveryA ? onImagesReady : handleSlotReadyA}
                                  revealPhase={revealPhase}
                                  topBlock={displayedCardMode === 'waiting' && inviteExpiresAt ? (
                                    <CircularTimer expiresAt={inviteExpiresAt} totalSecs={inviteTotalSecs} extended={invitedPage1?.extended} targetIsMale={matchIsMale} />
                                  ) : undefined}
                                />
                              )}
                            </DiscoveryReveal>
                          </Animated.View>
                        )}
                        {matchB && (
                          <Animated.View style={[StyleSheet.absoluteFill, cardStyleB, { zIndex: topSlot === 'B' ? 2 : 1 }]}>
                            <DiscoveryReveal
                              key={matchB.user_id}
                              enabled={discoveryB}
                              centerAvatarUrl={profileAvatarUrl}
                              onComplete={() => {
                                if (discoveryB) {
                                  finishTransition('B')
                                  setDiscoveryB(false)
                                }
                              }}
                            >
                              {({ onImagesReady, revealPhase }) => (
                                <MatchCard
                                  match={matchB}
                                  userIsMale={isMale}
                                  units={profile?.units}
                                  bottomInset={0}
                                  hideTime={state === 'chat'}
                                  onReady={discoveryB ? onImagesReady : handleSlotReadyB}
                                  revealPhase={revealPhase}
                                  topBlock={displayedCardMode === 'waiting' && inviteExpiresAt ? (
                                    <CircularTimer expiresAt={inviteExpiresAt} totalSecs={inviteTotalSecs} extended={invitedPage1?.extended} targetIsMale={matchIsMale} />
                                  ) : undefined}
                                />
                              )}
                            </DiscoveryReveal>
                          </Animated.View>
                        )}
                      </View>
                    </HomeCard>
                  </Animated.View>
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
                  onConfirm={() => runAction('app/cancel', 'cancel-confirm', () => setCancelConfirmOpen(false))}
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
                    page2PendingInvite ? t('push.REPLYING')
                    : page2InviteObj?.message ? tg(`home.page2.${page2InviteObj.message}` as any, page2InviteObj.is_male)
                    : page2InviteObj?.state === 'missed' ? t('push.OTHER_CANCELLED')
                    : page2InviteObj?.state === 'fail' ? t('home.inviteExpired')
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
                        {({ onImagesReady, revealPhase }) => (
                          <MatchCard
                            match={page2PendingInvite}
                            userIsMale={isMale}
                            units={profile?.units}
                            bottomInset={0}
                            onReady={page2Discovery ? onImagesReady : undefined}
                            revealPhase={revealPhase}
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
                        variant="soft"
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
                        bottomInset={0}
                      />
                    </View>
                  </HomeCard>
                ) : page2NeedsFree2 ? (
                  <PullScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.watchingMeContent}
                  >
                    <View style={styles.telescopeWrap}>
                      <TelescopeIllustration />
                    </View>
                    <Text style={styles.emptyTitle}>{t('home.watchingMeNoOneTitle')}</Text>
                    <Text style={styles.emptySubtitle}>{t('home.watchingMeNoOneSubtitle')}</Text>
                  </PullScrollView>
                ) : watchers.length > 0 ? (
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
                      <TelescopeIllustration />
                    </View>
                    <Text style={styles.emptyTitle}>{t('home.watchingMeNoOneTitle')}</Text>
                    <Text style={styles.emptySubtitle}>{t('home.watchingMeNoOneSubtitle')}</Text>
                  </PullScrollView>
                )}
              </View>}
            </View>,
          ]}
        </PagerView>
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
        </View>
        </GestureDetector>
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
                <View style={styles.profileSheetHandle} pointerEvents="none">
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
    paddingHorizontal: 24,
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
