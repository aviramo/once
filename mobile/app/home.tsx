import { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Dimensions, I18nManager, BackHandler, Keyboard, AppState } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated'
import { Text } from '../src/components/AppText'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Defs, Path, Circle, Rect, Ellipse, G, Pattern } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { t, tg, tgg } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, openLocationSettings, openAppSettings, type LocPermission } from '../src/lib/location'
import { Button, PrimaryButton } from '../src/components/Button'
import { TEXT, WHITE, BLACK } from '../src/colors'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BootScreen } from '../src/components/BootScreen'
import { MatchCard } from '../src/components/MatchCard'
import { CountBadge } from '../src/components/CountBadge'
import { HomeHeader } from '../src/components/HomeHeader'
import { HomeCard, PullScrollView } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SelectFieldConfig, SelectFieldPage, SubPageConfig, AgeRangeFieldPage, RadiusFieldPage, AdminFieldPage, PhotoFieldPage } from './settings'
import ChatPage from './chat'

const isRTL = I18nManager.isRTL
// ── Pane seam ──────────────────────────────────────────────────────────────
// Thin divider living in the gap between the home and settings panes. Lives
// off-screen when either pane is at rest; only becomes visible during the
// swipe transition as the strip slides by.

const SEAM_WIDTH = 1
const SEAM_GAP   = SEAM_WIDTH  // pane-to-pane spacer is just the seam itself
const SEAM_COLOR = 'transparent'

// ── State Icons ────────────────────────────────────────────────────────────
// Large pictographic glyph that anchors the content area. A coherent
// envelope-in-circle pair: up-arrow (sending) for HIDDEN, down-arrow
// (receiving) for VISIBLE — same envelope, opposite arrow direction.

const ICON_SIZE = 220

// Purple accent reserved for the VISIBLE state — signals "live / active /
// discoverable" on the icon + title. Kept close to the components that use
// it so it doesn't drift from the brand palette.
const VISIBLE_ACCENT = '#6d28d9'
// Neutral gray accent for the HIDDEN state — same hue as the incognito
// disc so the icon and the title/subtitle read as one coherent badge.
const HIDDEN_ACCENT = TEXT

function EnvelopeIcon({ accent, direction, size = ICON_SIZE }: { accent: string; direction: 'up' | 'down'; size?: number }) {
  // Paper plane mid-flight. The two triangles — top wing (bright white) and
  // under-fold (dimmed) — meet at a center crease, giving the classic folded
  // paper look. A trio of fading dots behind the tail reads as motion.
  // 'up' (sending): plane flies up-right, dots trail down-left.
  // 'down' (receiving): mirrored — plane flies down-right, dots trail up-left.
  const isUp = direction === 'up'
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="60" fill={accent} />
      <G origin="60, 60" scaleY={isUp ? 1 : -1}>
        {/* Top wing — bright white, the visible side of the paper */}
        <Path d="M 26 62 L 92 32 L 58 60 Z" fill={WHITE} />
        {/* Under fold — same white but dimmed, creating the folded look */}
        <Path d="M 58 60 L 92 32 L 71 91 Z" fill={WHITE} fillOpacity={0.55} />
        {/* Crease line along the fold for extra definition */}
        <Path
          d="M 92 32 L 58 60"
          stroke={accent}
          strokeWidth={1.5}
          strokeOpacity={0.35}
          strokeLinecap="round"
        />
        {/* Motion trail — three fading dots behind the tail */}
        <Circle cx="36" cy="72" r="2.4" fill={WHITE} opacity={0.8} />
        <Circle cx="26" cy="82" r="2" fill={WHITE} opacity={0.55} />
        <Circle cx="18" cy="92" r="1.6" fill={WHITE} opacity={0.32} />
      </G>
    </Svg>
  )
}

function StateIcon({ state }: { state: string }) {
  if (state === 'VISIBLE') return <EnvelopeIcon accent={VISIBLE_ACCENT} direction="down" />
  return <EnvelopeIcon accent={HIDDEN_ACCENT} direction="up" />
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

// Board-game card back — playful, like Djeco: colored background with
// texture, a big rounded SVG question mark, and the brand name with each
// letter tilted at a different angle for a whimsical look.
const BRAND_LETTERS = [
  { ch: 'S', rot: -8 },
  { ch: 'y', rot: 5 },
  { ch: 'n', rot: -3 },
  { ch: 'c', rot: 7 },
  { ch: 'W', rot: -6 },
  { ch: 'i', rot: 4 },
  { ch: 's', rot: -5 },
  { ch: 'h', rot: 8 },
]

// SyncWish star paths in 0–48 coordinate space — extracted from SyncWishLogo.
const STAR_PATH_1 = "M16.8712 33.0436L15.9976 44.7036C15.9362 45.5229 16.6646 46.0872 17.3161 45.722C21.9289 43.1382 36.3783 33.6479 43.7017 12.7899C44.0376 11.8331 43.1352 10.9697 42.3646 11.5094C38.0387 14.539 28.5846 20.8006 22.7421 21.9934C22.7421 21.9934 26.4836 19.3946 28.7231 15.4053C28.9426 15.0143 28.9244 14.5136 28.6796 14.1606L20.5127 2.38925C20.0287 1.69147 19.0354 1.98057 18.8606 2.87002L16.3181 15.8073L4.38437 26.2226C3.78602 26.7446 3.90808 27.7996 4.5989 28.079L16.8712 33.0436Z"
const STAR_PATH_2 = "M37.9745 28.448C37.2188 29.5025 35.5908 31.6717 34.0876 32.9974C33.7871 33.2624 33.8276 33.7068 34.1724 33.9234L42.1145 38.909C42.5926 39.2091 43.2384 38.8529 43.1576 38.3323C42.7882 35.9496 41.7237 30.9818 39.0328 28.3741C38.7322 28.083 38.2142 28.1136 37.9745 28.448Z"
// Two stars per tile: one at top-left, one at centre — creates a natural
// diagonal layout when tiled (no patternTransform rotation needed).
const STAR_SCALE = 38 / 48
const STAR_T1 = `translate(4, 4) scale(${STAR_SCALE})`
const STAR_T2 = `translate(48, 48) scale(${STAR_SCALE})`

function CardBack() {
  return (
    <View style={cardBackStyles.wrap}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="cbTex" width={88} height={88} patternUnits="userSpaceOnUse">
              <Path d={STAR_PATH_1} transform={STAR_T1} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_2} transform={STAR_T1} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_1} transform={STAR_T2} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_2} transform={STAR_T2} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#cbTex)" />
        </Svg>
      </View>
      <Svg width={180} height={240} viewBox="0 0 180 240">
        <Path
          d="M50 60 C50 20, 130 20, 130 60 C130 95, 100 100, 100 135"
          fill="none"
          stroke="#fff"
          strokeWidth={32}
          strokeLinecap="round"
        />
        <Circle cx={100} cy={185} r={18} fill="#fff" />
      </Svg>
      <View style={cardBackStyles.brandRow}>
        {BRAND_LETTERS.map((l, i) => (
          <Text
            key={i}
            style={[
              cardBackStyles.brandLetter,
              { transform: [{ rotate: `${l.rot}deg` }] },
            ]}
          >
            {l.ch}
          </Text>
        ))}
      </View>
    </View>
  )
}

const cardBackStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6d28d9',
    borderRadius: 24,
    overflow: 'hidden',
  },
  brandRow: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    direction: 'ltr',
    gap: 2,
  },
  brandLetter: {
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
    includeFontPadding: false,
  },
})

// ── Notification card faces ───────────────────────────────────────────────
// Same purple card style as CardBack but with bell icons instead of "?".
// Shown during the startup notification permission flow.

function PermissionCardFace({ icon, denied }: { icon: 'bell' | 'location'; denied?: boolean }) {
  const PAT = 28
  return (
    <View style={permCardStyles.wrap}>
      {/* Texture — SyncWish stars in a diagonal offset tile */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="pcTex" width={88} height={88} patternUnits="userSpaceOnUse">
              <Path d={STAR_PATH_1} transform={STAR_T1} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_2} transform={STAR_T1} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_1} transform={STAR_T2} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
              <Path d={STAR_PATH_2} transform={STAR_T2} fillRule="evenodd" fill="rgba(255,255,255,0.17)" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#pcTex)" />
        </Svg>
      </View>
      {/* Icon — bold, wide, matches the CardBack ? style */}
      <Svg width={180} height={240} viewBox="0 0 180 240" fill="none">
        {icon === 'bell' ? (
          <>
            {/* Bell dome — narrows to smooth apex, widens toward body */}
            <Path
              d="M 30 152 C 28 90 60 28 90 28 C 120 28 152 90 150 152"
              stroke="#fff"
              strokeWidth={28}
              strokeLinecap="round"
            />
            {/* Bottom rim — wider than the body */}
            <Path
              d="M 10 162 L 170 162"
              stroke="#fff"
              strokeWidth={24}
              strokeLinecap="round"
            />
            {/* Clapper */}
            <Circle cx={90} cy={196} r={14} fill="#fff" />
          </>
        ) : (
          <>
            {/* Map pin outline */}
            <Path
              d="M 90 205 C 32 162 22 115 22 78 C 22 38 52 16 90 16 C 128 16 158 38 158 78 C 158 115 148 162 90 205 Z"
              stroke="#fff"
              strokeWidth={28}
              strokeLinejoin="round"
            />
            {/* Center circle */}
            <Circle
              cx={90}
              cy={78}
              r={26}
              stroke="#fff"
              strokeWidth={28}
            />
          </>
        )}
        {denied && (
          <Path
            d="M 20 20 L 160 220"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={24}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={permCardStyles.brandRow}>
        {BRAND_LETTERS.map((l, i) => (
          <Text
            key={i}
            style={[
              permCardStyles.brandLetter,
              { transform: [{ rotate: `${l.rot}deg` }] },
            ]}
          >
            {l.ch}
          </Text>
        ))}
      </View>
    </View>
  )
}

const permCardStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6d28d9',
    borderRadius: 24,
    overflow: 'hidden',
  },
  brandRow: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    direction: 'ltr',
    gap: 2,
  },
  brandLetter: {
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
    includeFontPadding: false,
  },
})

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
  hideIcon,
  hideDesc,
  badgeCount,
  titleColorOverride,
}: {
  state: string
  title?: string
  subtitle?: string
  desc: string
  // Suppress the icon when watcher cards take over as the visual anchor
  // below the message (VISIBLE state with at least one watcher).
  hideIcon?: boolean
  // Suppress the desc when it's rendered separately below the watchers.
  hideDesc?: boolean
  // Optional count pill rendered next to the title. Used for the
  // "watching you" title in visible-with-watchers mode.
  badgeCount?: number
  titleColorOverride?: string
}) {
  const titleColor = titleColorOverride ?? (
    state === 'VISIBLE' ? VISIBLE_ACCENT :
    state === 'HIDDEN' ? HIDDEN_ACCENT : undefined)
  const titleNode = title ? (
    <Text style={[messageStyles.title, titleColor ? { color: titleColor } : null]}>
      {title}
    </Text>
  ) : null
  return (
    <View style={messageStyles.wrap}>
      {!hideIcon && (
        <View style={[messageStyles.icon, messageStyles.iconFaded]}>
          <StateIcon state={state} />
        </View>
      )}
      {badgeCount != null && badgeCount !== 0 ? (
        <View style={messageStyles.titleRow}>
          {titleNode}
          <CountBadge value={badgeCount} color={titleColor ?? TEXT} />
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
  icon: {
    marginTop: 28,
    marginBottom: 24,
    alignSelf: 'center',
  },
  // Faded so the glyph reads as a decorative status marker, not a tappable
  // affordance.
  iconFaded: {
    opacity: 0.35,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
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
    color: TEXT,
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

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { profile } = useUserStore()
  // ── Horizontal pager shell ──────────────────────────────────────────────
  // Three panes laid side-by-side: [0]=chat, [1]=home (middle, default),
  // [2]=settings. In LTR that places chat to the left of home and settings
  // to the right; RTL mirrors. Chat is only reachable while state===CHAT —
  // the gesture to pane 0 refuses otherwise.
  type PaneIndex = 0 | 1 | 2 | 3
  const HOME_PANE: PaneIndex = 1
  const CHAT_PANE: PaneIndex = 0
  const SETTINGS_PANE: PaneIndex = 2
  const SUBPAGE_PANE: PaneIndex = 3
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(HOME_PANE)
  const [subPageConfig, setSubPageConfig] = useState<SubPageConfig | null>(null)
  // Unread message count reported by ChatPage — shown as a badge next to the
  // "Chat" title while we're on the home pane.
  const [chatUnread, setChatUnread] = useState(0)
  const [shellW, setShellW] = useState(() => Dimensions.get('window').width)
  const [shellH, setShellH] = useState(0)
  // SettingsPage reports when the user is editing photos (iOS-style jiggle).
  // While that's active, the shell pan must not claim horizontal drags —
  // otherwise dragging a photo to reorder it slides the whole pane instead.
  const sliding = useSlidingActive()
  const shellTranslate = useSharedValue(0)
  // Card flip — animates the main card between VISIBLE/HIDDEN/WATCHING transitions.
  // Value range: -1 = edge-on from back, 0 = face-on, 1 = edge-on from front.
  // Runs on the UI thread via Reanimated so it stays smooth even under JS load.
  const paneIndexRef = useRef(paneIndex)
  const paneIndexSV = useSharedValue(paneIndex)
  const shellWRef = useRef(shellW)
  const shellWSV = useSharedValue(shellW)
  useEffect(() => { paneIndexRef.current = paneIndex; paneIndexSV.value = paneIndex }, [paneIndex])
  // Dismiss any open keyboard on every pane transition so it never lingers
  // visually over a pane that doesn't own the focused input (chat input,
  // settings text fields, etc.).
  useEffect(() => { Keyboard.dismiss() }, [paneIndex])
  useEffect(() => { shellWRef.current = shellW; shellWSV.value = shellW }, [shellW])

  // Direction sign: LTR lays panes left-to-right in render order (0,1,2),
  // so showing pane i means translating the strip by -i*step. RTL mirrors.
  const DIR = isRTL ? 1 : -1

  // One pane-step includes the seam gap so the gap slides completely off the
  // opposite edge — the seam never bleeds into a resting pane.
  const paneStep = (w: number) => {
    'worklet'
    return w + SEAM_GAP
  }

  const animateShellToIndex = (index: PaneIndex) => {
    shellTranslate.value = withTiming(DIR * index * paneStep(shellWRef.current), {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    })
  }

  const goToPane = (index: PaneIndex) => {
    if (index === paneIndexRef.current) return
    tap()
    setPaneIndex(index)
    animateShellToIndex(index)
  }

  const openShellSubPage = (config: SubPageConfig) => {
    setSubPageConfig(config)                       // 2. render sub-page
    requestAnimationFrame(() => goToPane(SUBPAGE_PANE))  // 3. slide after render
  }

  const closeShellSubPage = (afterSlide?: () => Promise<void> | void) => {
    goToPane(SETTINGS_PANE)                        // 4. slide back
    setTimeout(async () => {
      if (afterSlide) {                            // 5. server update
        try { await afterSlide() } catch (e) { console.error(e) }
      }
      setSubPageConfig(null)                       // 6. delete page
    }, 400)
  }

  // Snap shell to current pane when the width first resolves.
  useEffect(() => {
    if (!shellW) return
    shellTranslate.value = DIR * paneIndexRef.current * paneStep(shellW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellW])

  // Android hardware back — when on a side pane, slide back to home instead
  // of letting the router pop.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const idx = paneIndexRef.current
      if (idx === SUBPAGE_PANE) {
        goToPane(SETTINGS_PANE)
        return true
      }
      if (idx !== HOME_PANE) {
        goToPane(HOME_PANE)
        return true
      }
      return false
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = profile?.state ?? 'HIDDEN'
  const isMale = profile?.is_male ?? null
  const ready = !!profile
  const isVisible = state === 'VISIBLE'


  // Desc block animation: 1 = normal, 0 = zoomed-in + faded (during server request).
  // Animates to 0 on button press; animates back to 1 after server responds.

  // ── Notification permission flow ────────────────────────────────────────
  // Runs once on first mount after profile is ready. Shows a card-based
  // prompt (undetermined) or blocked message (denied) until granted.
  const [notifPerm, setNotifPerm] = useState<NotifPermission | null>(null)
  const [notifBusy, setNotifBusy] = useState(false)
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

  const handleNotifRequest = async () => {
    if (notifBusy) return
    setNotifBusy(true)
    try {
      const result = await requestNotifPermission()
      setNotifPerm(result)
    } finally {
      setNotifBusy(false)
    }
  }

  // While we're still checking or the user hasn't granted permission,
  // the notification card overlay takes over the home pane content.
  const showNotifOverlay = notifPerm !== null && notifPerm !== 'granted'

  // ── Location permission flow ───────────────────────────────────────────
  // Runs after notifications are granted. Same pattern: card overlay until
  // the user grants location access.
  const [locPerm, setLocPerm] = useState<LocPermission | null>(null)
  const [locBusy, setLocBusy] = useState(false)

  useEffect(() => {
    if (notifPerm !== 'granted') return
    getLocPermission().then(setLocPerm)
  }, [notifPerm])

  // ── Startup completion ────────────────────────────────────────────────
  // Both permissions granted → get location + push token, send app/start.
  const startupSentRef = useRef(false)
  useEffect(() => {
    if (notifPerm !== 'granted' || locPerm !== 'granted') return
    if (startupSentRef.current) return
    startupSentRef.current = true
    ;(async () => {
      const [location, token] = await Promise.all([
        getLocation(),
        pushTokenRef.current
          ? Promise.resolve(pushTokenRef.current)
          : ensurePushToken(),
      ])
      // Location + subscription are applied before the switch statement,
      // then 'start' runs a nearby search. Location must be { latitude, longitude }.
      const calls: Promise<unknown>[] = [
        invoke('app/start', {
          ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
        }),
      ]
      if (token) calls.push(invoke('app/data', { data: { subscription: { type: 'expo', token } } }))
      Promise.all(calls).catch(() => {})
    })()
  }, [notifPerm, locPerm])

  const handleLocRequest = async () => {
    if (locBusy) return
    setLocBusy(true)
    try {
      const result = await requestLocPermission()
      setLocPerm(result)
    } finally {
      setLocBusy(false)
    }
  }

  const showLocOverlay = !showNotifOverlay && locPerm !== null && locPerm !== 'granted'

  // Unified card mode — derived synchronously so the header title never
  // flashes a stale value between state changes and the next render.
  const displayedCardMode = showNotifOverlay ? 'notif' : showLocOverlay ? 'loc' : state

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

  // Gesture reads `state` via a ref: the PanResponder captures its callbacks
  // once (useRef), so a direct closure would freeze the initial state value
  // and never unlock chat-pane access when the user later transitions to
  // CHAT.
  const chatAvailableRef = useRef(state === 'CHAT')
  const chatAvailableSV = useSharedValue(state === 'CHAT')
  useEffect(() => { chatAvailableRef.current = state === 'CHAT'; chatAvailableSV.value = state === 'CHAT' }, [state])

  // Anchor pane on state transitions. Entering CHAT auto-navigates to the
  // chat pane so the user lands directly in the conversation; other
  // transitions snap back to the home pane so the user isn't stranded on a
  // side pane after a match status flip.
  const prevStateRef = useRef(state)
  useEffect(() => {
    if (prevStateRef.current !== state) {
      const prev = prevStateRef.current
      prevStateRef.current = state
      if (state === 'CHAT' && prev !== 'CHAT') goToPane(CHAT_PANE)
      else if (paneIndexRef.current !== HOME_PANE) goToPane(HOME_PANE)
    }
  }, [state])

  // One-time migration: populate the `data` jsonb column for users who
  // pre-date the data-field architecture. Fires once after the profile is
  // first loaded. If data is already set we skip to avoid a redundant write.
  useEffect(() => {
    if (!profile) return
    const d = (profile as unknown as { data?: Record<string, unknown> }).data
    if (d && Object.keys(d).length > 0) return
    invoke('app/data', {
      data: { bio: profile.bio ?? null, images: profile.images, units: profile.units ?? null }
    }).catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!profile])

  // Coexistence rules with inner gestures:
  //   • On pane 1 (home): forward → settings (always), backward → chat
  //     (only if state===CHAT).
  //   • On pane 0 (chat) or pane 2 (settings): claim gestures pointing
  //     back toward home. Inner sub-pagers surrender at their edges so this
  //     handler only receives them then.
  //
  // activeOffsetX/failOffsetY tell gesture-handler to declaratively wait for
  // a clear horizontal intent (>=10px) before claiming, and to bail out if
  // the user's finger moves vertically first (>=20px) — which is what lets
  // inner ScrollViews own vertical drags unambiguously.
  //
  // Narrow activeOffsetX to the directions where a neighbor pane actually
  // exists. Without this, swiping toward a blocked side still claims the
  // gesture and the JS clamp leaves a brief elastic feel before snapping
  // back. A one-sided threshold (99999) makes gesture-handler refuse to
  // activate in that direction entirely — no claim, no elasticity.
  const chatAvailable = state === 'CHAT'
  const shellCanGoBack = paneIndex > 0 && !(paneIndex === HOME_PANE && !chatAvailable)
  const shellCanGoFwd = paneIndex < 2
  const shellActiveOffsetX: [number, number] = isRTL
    ? [shellCanGoBack ? -10 : -99999, shellCanGoFwd ? 10 : 99999]
    : [shellCanGoFwd ? -10 : -99999, shellCanGoBack ? 10 : 99999]
  const shellPan = useMemo(() =>
    Gesture.Pan()
      .enabled(!sliding)
      .activeOffsetX(shellActiveOffsetX)
      .failOffsetY([-20, 20])
      .onUpdate(e => {
        'worklet'
        const w = shellWSV.value
        if (!w) return
        const step = paneStep(w)
        const idx = paneIndexSV.value
        const base = DIR * idx * step
        const canGoBack = idx > 0 && !(idx === HOME_PANE && !chatAvailableSV.value)
        const canGoFwd  = idx < 2
        const minIdx = canGoBack ? (idx - 1) : idx
        const maxIdx = canGoFwd  ? (idx + 1) : idx
        const t1 = DIR * minIdx * step
        const t2 = DIR * maxIdx * step
        const lo = t1 < t2 ? t1 : t2
        const hi = t1 < t2 ? t2 : t1
        const next = Math.max(lo, Math.min(hi, base + e.translationX))
        shellTranslate.value = next
      })
      .onEnd(e => {
        'worklet'
        const w = shellWSV.value
        if (!w) return
        const idx = paneIndexSV.value
        const forward = DIR < 0 ? e.translationX < 0 : e.translationX > 0
        const vx = e.velocityX / 1000
        const flick = Math.abs(vx) > 0.4
        const past = Math.abs(e.translationX) > w * 0.3
        if (idx === HOME_PANE && !forward && !chatAvailableSV.value) {
          shellTranslate.value = withTiming(DIR * idx * paneStep(w), { duration: 300, easing: Easing.out(Easing.cubic) })
          return
        }
        let target = idx
        if ((past || flick) && forward && idx < 2) target = idx + 1
        else if ((past || flick) && !forward && idx > 0) {
          if (!(idx === HOME_PANE && !chatAvailableSV.value))
            target = idx - 1
        }
        shellTranslate.value = withTiming(DIR * target * paneStep(w), { duration: 300, easing: Easing.out(Easing.cubic) })
        if (target !== idx) {
          runOnJS(tap)()
          runOnJS(setPaneIndex)(target as PaneIndex)
        }
      })
  , [sliding, shellActiveOffsetX[0], shellActiveOffsetX[1]])

  const shellStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shellTranslate.value }],
  }))

  // Button stays disabled from click until the server round-trip resolves.
  // `pendingKey` identifies which button initiated the in-flight action so
  // only that one shows the disabled visual — all other buttons stay
  // visually normal but non-interactive via `silentDisabled`.
  const [busy, setBusy] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const setVisibility = (next: 'VISIBLE' | 'HIDDEN'): Promise<void> => {
    if (busy) return Promise.resolve()
    if (next === (isVisible ? 'VISIBLE' : 'HIDDEN')) return Promise.resolve()
    setBusy(true)
    tap()
    return invoke('app/visibility', { state: next })
      .then(() => {
        setBusy(false)
        setHideConfirmOpen(false)
      })
      .catch(err => {
        console.warn('visibility toggle failed:', String(err).slice(0, 120))
        setBusy(false)
        setHideConfirmOpen(false)
      })
  }

  const watchers = profile?.watchers ? Object.values(profile.watchers) : []

  // Use displayedCardMode so card content only swaps at the flip midpoint.
  const showWatchers = !!profile && displayedCardMode === 'VISIBLE'
  const showHiddenPlaceholder = !!profile && displayedCardMode === 'HIDDEN'

  // If any watchers are listed when the user goes hidden, confirm first —
  // switching removes them all, which is destructive.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const [revealConfirmOpen, setRevealConfirmOpen] = useState(false)
  const cardPullRef = useRef<(() => void) | null>(null)
  // Deferred resolve — keeps the card held at PULL_HOLD_Y until the
  // confirm dialog flow completes (confirm+server or cancel).
  const pullResolveRef = useRef<(() => void) | null>(null)
  const releasePull = () => { pullResolveRef.current?.(); pullResolveRef.current = null }

  const onSwitchToHidden = (): Promise<void> => {
    tap()
    if (watchers.length > 0) {
      return new Promise<void>(resolve => {
        pullResolveRef.current = resolve
        setHideConfirmOpen(true)
      })
    }
    return setVisibility('HIDDEN')
  }
  const hideConfirmDesc =
    (watchers.length === 1
      ? t('home.hideConfirmOnePerson')
      : t('home.hideConfirmPeople').replace('{n}', String(watchers.length)))
    + ' ' + tg('home.hideConfirmDesc', isMale)

  // Match name (strip trailing ", age") and gendered invite confirm desc.
  const matchName = (profile?.match?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  const matchIsMale = profile?.match?.is_male
  const inviteConfirmDesc = tgg('home.inviteConfirmDesc' as any, isMale, matchIsMale)

  // The match card surfaces both for live interaction states and for
  // terminal/ended states (MISSED, CANCELLED, REFUSED, LEFT). The ended
  // states show the same match + a single dismiss button that clears the
  // record on the server and drops back to the HIDDEN shell.
  const isEndedState =
    state === 'MISSED' || state === 'CANCELLED' || state === 'REFUSED' || state === 'LEFT'
  const isMatchCardOpen =
    state === 'WATCHING' || state === 'WAITING' || state === 'REPLYING' || state === 'CHAT' ||
    isEndedState
  // Displayed versions — drive card rendering (lag during flip).
  const displayedIsEndedState =
    displayedCardMode === 'MISSED' || displayedCardMode === 'CANCELLED' || displayedCardMode === 'REFUSED' || displayedCardMode === 'LEFT'
  const displayedIsMatchCardOpen =
    displayedCardMode === 'WATCHING' || displayedCardMode === 'WAITING' || displayedCardMode === 'REPLYING' || displayedCardMode === 'CHAT' ||
    displayedIsEndedState

  // ── Match-state actions ────────────────────────────────────────────────
  // The pinned bottom slot swaps in per-state buttons when the match card
  // is open, replacing the visibility toggle. Destructive actions route
  // through a ConfirmDialog first.
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)

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

  const matchButtons = (() => {
    if (!isMatchCardOpen) return null
    if (state === 'WATCHING') {
      return (
        <View style={styles.buttonRow}>
          <View style={styles.buttonCellReject}>
            <Button
              variant="soft"
              label={t('home.watchingReject')}
              onPress={() => runAction('app/ignore', 'watching-reject')}
              disabled={busy}
              silentDisabled={pendingKey !== 'watching-reject'}
            />
          </View>
          <View style={styles.buttonCellAccept}>
            <Button
              variant="primary"
              tone="visible"
              label={t('home.watchingAccept')}
              onPress={() => { tap(); setInviteConfirmOpen(true) }}
              disabled={busy}
              silentDisabled
            />
          </View>
        </View>
      )
    }
    if (state === 'WAITING') {
      return (
        <Button
          variant="destructive"
          label={t('home.cancelWaitingBtn')}
          onPress={() => { tap(); setCancelConfirmOpen(true) }}
          disabled={busy}
        />
      )
    }
    if (state === 'REPLYING') {
      return (
        <View style={styles.buttonRow}>
          <View style={styles.buttonCellReject}>
            <Button
              variant="destructive"
              label={t('home.replyingReject')}
              onPress={() => { tap(); setRefuseConfirmOpen(true) }}
              disabled={busy}
              silentDisabled
            />
          </View>
          <View style={styles.buttonCellAccept}>
            <Button
              variant="primary"
              tone="visible"
              label={t('home.replyingAccept')}
              onPress={() => runAction('app/approve', 'replying-accept')}
              disabled={busy}
              silentDisabled={pendingKey !== 'replying-accept'}
            />
          </View>
        </View>
      )
    }
    if (state === 'CHAT') {
      return null
    }
    if (isEndedState) {
      return (
        <Button
          variant="soft"
          label={tg('home.tapForMore', isMale)}
          onPress={() => runAction('app/ok', 'ended-ok')}
          disabled={busy}
        />
      )
    }
    return null
  })()

  const notifButtons = notifPerm === 'undetermined'
    ? <PrimaryButton label={t('home.notifPromptButton')} onPress={handleNotifRequest} disabled={notifBusy} tone="visible" />
    : notifPerm === 'denied'
      ? <PrimaryButton label={t('home.openAppSettings')} onPress={openAppSettings} tone="visible" />
      : null

  const locButtons = locPerm === 'undetermined'
    ? <PrimaryButton label={t('home.locationPromptButton')} onPress={handleLocRequest} disabled={locBusy} tone="visible" />
    : locPerm === 'services-off'
      ? <PrimaryButton label={t('home.openLocationSettings')} onPress={openLocationSettings} tone="visible" />
      : locPerm === 'denied'
        ? <PrimaryButton label={t('home.openAppSettings')} onPress={openAppSettings} tone="visible" />
        : null

  const cardButtons = showNotifOverlay
    ? notifButtons
    : showLocOverlay
      ? locButtons
      : isMatchCardOpen ? matchButtons : null

  // ── Header props ──────────────────────────────────────────────────────
  const pushKey = `push.${state}`
  const pushLabel = isMatchCardOpen ? t(pushKey as any) : ''
  const headerTitle =
    showNotifOverlay ? t('home.notifHeaderTitle')
    : showLocOverlay ? t('home.locHeaderTitle')
    : showHiddenPlaceholder ? tg('home.hiddenPullHint', isMale)
    : state === 'WATCHING' ? 'SyncWish'
    : state === 'CHAT' ? t('home.chatHeader')
    : pushLabel && pushLabel !== pushKey ? pushLabel
    : isVisible ? t('home.hiddenFlippedTitle')
    : tg('home.hiddenHeaderTitle', isMale)

  const headerArrow = (() => {
    if (state === 'CHAT') return { direction: 'side' as const, onPress: () => goToPane(CHAT_PANE) }
    if (showHiddenPlaceholder || state === 'WATCHING' || showWatchers || isVisible)
      return { direction: 'down' as const, onPress: () => cardPullRef.current?.() }
    return undefined
  })()

  const headerBadge = state === 'CHAT' ? chatUnread : undefined

  // ── Card props ────────────────────────────────────────────────────────
  const cardOnPull = (() => {
    if (showWatchers) return onSwitchToHidden
    if (showHiddenPlaceholder) return () => new Promise<void>(resolve => {
      pullResolveRef.current = resolve
      setRevealConfirmOpen(true)
    })
    if (state === 'WATCHING') return () => setVisibility('VISIBLE')
    return undefined
  })()

  const cardDescription = (() => {
    if (displayedCardMode === 'notif') {
      return (
        <Message
          state="HIDDEN"
          title={notifPerm === 'denied' ? t('home.emptyNotifBlockedTitle') : t('home.notifPromptTitle')}
          desc={notifPerm === 'denied' ? t('home.emptyNotifBlockedDesc') : t('home.notifPromptDesc')}
          hideIcon
        />
      )
    }
    if (displayedCardMode === 'loc') {
      return (
        <Message
          state="HIDDEN"
          title={
            locPerm === 'services-off' ? t('home.locationUnavailableTitle')
            : locPerm === 'denied' ? t('home.emptyLocationBlockedTitle')
            : t('home.locationPromptTitle')
          }
          desc={
            locPerm === 'services-off' ? t('home.locationServicesOffDesc')
            : locPerm === 'denied' ? t('home.emptyLocationBlockedDesc')
            : t('home.locationPromptDesc')
          }
          hideIcon
        />
      )
    }
    return undefined
  })()

  if (!ready) {
    return (
      <>
        <StatusBar style="dark" />
        <BootScreen />
      </>
    )
  }

  return (
    <View style={styles.backdrop}>
      <GestureDetector gesture={shellPan}>
      <Animated.View
        style={styles.shell}
        onLayout={e => {
          setShellW(e.nativeEvent.layout.width)
          setShellH(e.nativeEvent.layout.height)
        }}
      >
        <StatusBar style="dark" />
        {/* Strip width must span all three panes; otherwise children at
            start > shellW sit outside the strip's intrinsic bounds and
            Android drops their touch events (vertical scrolls on the home
            pane stop responding). flex:1 alone gives the strip the shell's
            width, which only covers pane 0. */}
        <Animated.View style={[styles.shellStrip, { width: 4 * shellW + 3 * SEAM_GAP }, shellStripStyle]}>

          {/* Pane 0 — chat (left of home in LTR, right in RTL) */}
          <View
            style={[styles.shellPane, { start: 0, width: shellW }]}
            pointerEvents={paneIndex === CHAT_PANE ? 'auto' : 'none'}
          >
            <ChatPage
              onBack={() => goToPane(HOME_PANE)}
              isActive={paneIndex === CHAT_PANE}
              onUnreadChange={setChatUnread}
            />
          </View>

          {/* Pane 1 — home (middle, default) */}
          <View
            style={[styles.shellPane, { start: shellW + SEAM_GAP, width: shellW }]}
            pointerEvents={paneIndex === HOME_PANE ? 'auto' : 'none'}
          >
            <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
              <HomeHeader
                title={headerTitle}
                arrow={headerArrow}
                badge={headerBadge}
                onSettingsPress={() => goToPane(SETTINGS_PANE)}
                disabled={busy}
                loading={busy}
              />
              <HomeCard
                onPull={cardOnPull}
                pullRef={cardPullRef}
                buttons={cardButtons}
                description={cardDescription}
              >
                {displayedIsMatchCardOpen && (
                  profile?.match ? (
                    <MatchCard
                      key={profile.match.user_id}
                      match={profile.match}
                      userIsMale={isMale}
                      bottomInset={0}
                      hideTime={state === 'CHAT'}
                    />
                  ) : null
                )}

                {showWatchers && (
                  <PullScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                  >
                    <View style={styles.watchersDescRow}>
                      <Text style={styles.watchersDescText}>{tg(watchers.length > 0 ? 'home.nowVisibleWithWatchersDesc' : 'home.nowVisibleDesc', isMale)}</Text>
                    </View>
                    {watchers.map((w, i) => (
                      <View key={w.user_id}>
                        {i > 0 && <View style={styles.watchersRowDivider} />}
                        <WatcherCard watcher={w} units={profile?.units} flat />
                      </View>
                    ))}
                    {Array.from({ length: watchers.length >= 5 ? 0 : watchers.length <= 1 ? 3 - watchers.length : 1 }).map((_, i) => (
                      <View key={`ph-${i}`}>
                        {(watchers.length > 0 || i > 0) && <View style={styles.watchersRowDivider} />}
                        <View style={styles.watcherPlaceholder}>
                          <View style={styles.watcherPlaceholderAvatar} />
                          <View style={styles.watcherPlaceholderBody}>
                            <View style={styles.watcherPlaceholderTitleRow}>
                              <View style={styles.watcherPlaceholderTitle} />
                            </View>
                            <View style={styles.watcherPlaceholderChips}>
                              <View style={[styles.watcherPlaceholderChip, { width: 64 }]} />
                              <View style={[styles.watcherPlaceholderChip, { width: 80 }]} />
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                  </PullScrollView>
                )}

                {showHiddenPlaceholder && (
                  <CardBack />
                )}

                {displayedCardMode === 'notif' && (
                  <PermissionCardFace icon="bell" denied={notifPerm === 'denied'} />
                )}

                {displayedCardMode === 'loc' && (
                  <PermissionCardFace icon="location" />
                )}
              </HomeCard>

              <ConfirmDialog
                visible={revealConfirmOpen}
                title={t('home.revealConfirmTitle')}
                description={tg('home.revealConfirmDesc', isMale)}
                cancelLabel={t('home.revealConfirmCancel')}
                confirmLabel={t('home.revealConfirmConfirm')}
                tone="visible"
                onCancel={() => { if (!busy) { setRevealConfirmOpen(false); releasePull() } }}
                onConfirm={() => { setVisibility('VISIBLE').finally(() => { setRevealConfirmOpen(false); releasePull() }) }}
                busy={busy}
              />

              <ConfirmDialog
                visible={hideConfirmOpen}
                title={t('home.hideConfirmTitle')}
                description={hideConfirmDesc}
                cancelLabel={t('home.hideConfirmCancel')}
                confirmLabel={tg('home.hideConfirmConfirm', isMale)}
                destructive
                onCancel={() => { if (!busy) { setHideConfirmOpen(false); releasePull() } }}
                onConfirm={() => { setVisibility('HIDDEN').finally(releasePull) }}
                busy={busy}
              />

              <ConfirmDialog
                visible={inviteConfirmOpen}
                title={t('home.inviteConfirmTitle').replace('{name}', matchName)}
                description={inviteConfirmDesc.replace(/\{name\}/g, matchName)}
                cancelLabel={t('home.inviteConfirmCancel')}
                confirmLabel={t('home.inviteConfirmOk')}
                tone="visible"
                onCancel={() => { if (!busy) setInviteConfirmOpen(false) }}
                onConfirm={() => runAction('app/invite', 'invite-confirm', () => setInviteConfirmOpen(false))}
                busy={busy}
              />

              <ConfirmDialog
                visible={cancelConfirmOpen}
                title={t('home.cancelWaitingTitle').replace('{name}', matchName)}
                description={t('home.cancelWaitingDesc')}
                cancelLabel={t('home.cancelWaitingBack')}
                confirmLabel={t('home.cancelWaitingConfirm')}
                destructive
                onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                onConfirm={() => runAction('app/cancel', 'cancel-confirm', () => setCancelConfirmOpen(false))}
                busy={busy}
              />

              <ConfirmDialog
                visible={refuseConfirmOpen}
                title={t('home.refuseReplyTitle')}
                description={t('home.refuseReplyDesc')}
                cancelLabel={t('home.refuseReplyBack')}
                confirmLabel={t('home.refuseReplyConfirm')}
                destructive
                onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                onConfirm={() => runAction('app/refuse', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
                busy={busy}
              />
            </SafeAreaView>
          </View>

          {/* Pane 2 — settings (right of home in LTR, left in RTL) */}
          <View
            style={[styles.shellPane, { start: 2 * (shellW + SEAM_GAP), width: shellW }]}
            pointerEvents={paneIndex === SETTINGS_PANE ? 'auto' : 'none'}
          >
            <SettingsPage onBack={() => goToPane(HOME_PANE)} focused={paneIndex === SETTINGS_PANE} onOpenSubPage={openShellSubPage} />
          </View>

          {/* Pane 3 — field sub-page (select, age range, or radius) */}
          <View
            style={[styles.shellPane, { start: 3 * (shellW + SEAM_GAP), width: shellW }]}
            pointerEvents={paneIndex === SUBPAGE_PANE ? 'auto' : 'none'}
          >
            {subPageConfig && (
              subPageConfig.kind === 'ageRange'
                ? <AgeRangeFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                : subPageConfig.kind === 'radius'
                  ? <RadiusFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                  : subPageConfig.kind === 'admin'
                    ? <AdminFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                    : subPageConfig.kind === 'photos'
                      ? <PhotoFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                      : <SelectFieldPage config={subPageConfig} onBack={closeShellSubPage} />
            )}
          </View>

          {/* Thin seams between adjacent panes. Parked off-screen when a pane
              is at rest, so they only appear during the swipe transition. */}
          {shellH > 0 && (
            <>
              <View
                pointerEvents="none"
                style={[styles.shellSeam, { start: shellW, width: SEAM_WIDTH }]}
              />
              <View
                pointerEvents="none"
                style={[styles.shellSeam, { start: 2 * shellW + SEAM_GAP, width: SEAM_WIDTH }]}
              />
              <View
                pointerEvents="none"
                style={[styles.shellSeam, { start: 3 * shellW + 2 * SEAM_GAP, width: SEAM_WIDTH }]}
              />
            </>
          )}
        </Animated.View>
      </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  // Outer, always-opaque backdrop behind the shell.
  backdrop: {
    flex: 1,
    backgroundColor: '#eef0f3',
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#eef0f3',
  },
  shellStrip: {
    flex: 1,
  },
  shellPane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  shellSeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: SEAM_COLOR,
  },

  root: {
    flex: 1,
    backgroundColor: '#eef0f3',
  },

  // Inset divider between watcher rows — sits inside the outer card, not
  // flush to its edges, so the list reads as grouped rows rather than
  // edge-to-edge strips.
  watchersRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 12,
  },
  watchersDescRow: {
    padding: 20,
  },
  watchersDescText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
    lineHeight: 21,
    writingDirection: 'rtl',
  },
  // Ghosted slot hinting that more watchers can land here. Dashed border +
  // translucent fills read as "empty space to fill" rather than a real row.
  watcherPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    opacity: 0.55,
  },
  watcherPlaceholderAvatar: {
    width: 66,
    height: 88,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  watcherPlaceholderBody: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
    gap: 10,
  },
  watcherPlaceholderTitleRow: {
    flexDirection: 'row',
  },
  watcherPlaceholderTitle: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  watcherPlaceholderChips: {
    flexDirection: 'row',
    gap: 6,
  },
  watcherPlaceholderChip: {
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  // Two-button horizontal row used by WATCHING/REPLYING. flex:1 cells so
  // both buttons share width evenly regardless of label length.
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonCell: {
    flex: 1,
  },
  // Unequal split for reject/accept pairs: destructive stays compact so
  // the affirmative green action reads as the primary path.
  buttonCellReject: {
    flex: 1,
  },
  buttonCellAccept: {
    flex: 2,
  },
})
