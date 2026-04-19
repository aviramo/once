import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, I18nManager, BackHandler, Keyboard, AppState } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, useFrameCallback, Easing, runOnJS } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Defs, Path, Circle, Rect, Ellipse, G, Pattern } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { hasSeen, markSeen } from '../src/lib/seen'
import { tap } from '../src/lib/haptics'
import { useUserStore, type WatcherInfo } from '../src/stores/userStore'
import { t, tg, tgg } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, enableLocationServices, openLocationSettings, openAppSettings, type LocPermission } from '../src/lib/location'
import { Button, PrimaryButton } from '../src/components/Button'
import { TEXT, WHITE, BLACK, PURPLE, PURPLE_BG, RED } from '../src/colors'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BootScreen } from '../src/components/BootScreen'
import { MatchCard } from '../src/components/MatchCard'
import { CountBadge } from '../src/components/CountBadge'
import { HomeHeader } from '../src/components/HomeHeader'
import { HomeCard, PullScrollView } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SelectFieldConfig, SelectFieldPage, SubPageConfig, AgeRangeFieldPage, RadiusFieldPage, AdminFieldPage, PhotoFieldPage, AccountFieldPage, PreviewFieldPage, type Tab } from './settings'
import ChatPage from './chat'


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

const STAR_TILE = 88 // pattern repeat height

function CardBack() {
  // Stars drift downward — continuous frame-driven loop (no snap-back glitch).
  const starsY = useSharedValue(0)
  // Magnifying glass sways left ↔ right — near card edges.
  const glassX = useSharedValue(0)

  const FALL_SPEED = STAR_TILE / 2000 // px per ms — one tile every 2s
  useFrameCallback((info) => {
    'worklet'
    if (info.timeSincePreviousFrame) {
      starsY.value = (starsY.value + info.timeSincePreviousFrame * FALL_SPEED) % STAR_TILE
    }
  })

  useEffect(() => {
    glassX.value = -60
    glassX.value = withRepeat(
      withTiming(60, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      -1, // infinite
      true, // reverse — ping-pong for seamless loop
    )
  }, [])

  const starsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: starsY.value }],
  }))

  const glassStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glassX.value }],
  }))

  return (
    <View style={cardBackStyles.wrap}>
      {/* Oversized star layer — one extra tile so the loop is seamless */}
      <Animated.View style={[StyleSheet.absoluteFill, { top: -STAR_TILE }, starsStyle]}>
        <Svg width="100%" height="200%">
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
      </Animated.View>
      <Animated.View style={glassStyle}>
        <Svg width={180} height={240} viewBox="0 0 180 240" fill="none">
          {/* Magnifying glass — circle lens + angled handle */}
          <Circle
            cx={82}
            cy={90}
            r={52}
            stroke="#fff"
            strokeWidth={28}
          />
          {/* Handle — along 45° radius from circle center */}
          <Path
            d="M 119 127 L 168 176"
            stroke="#fff"
            strokeWidth={28}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
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

function PermissionCardFace({ icon }: { icon: 'bell' | 'location' }) {
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
  const CHAT_PANE: PaneIndex = 0
  const HOME_PANE: PaneIndex = 1
  const SETTINGS_PANE: PaneIndex = 2
  const SUBPAGE_PANE: PaneIndex = 3
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(HOME_PANE)
  const [subPageConfig, setSubPageConfig] = useState<SubPageConfig | null>(null)
  // Unread message count reported by ChatPage — shown as a badge next to the
  // "Chat" title while we're on the home pane.
  const [chatUnread, setChatUnread] = useState(0)
  const settingsChangeTabRef = useRef<((tab: Tab) => void) | null>(null)
  // Track which settings tab is active so PagerView scrolling is disabled
  // when the inner settings tab pager owns horizontal gestures (tab > 0).
  const [settingsTabIndex, setSettingsTabIndex] = useState(0)
  // SettingsPage reports when the user is editing photos (iOS-style jiggle).
  // While that's active, PagerView scrolling is disabled so dragging a photo
  // to reorder doesn't slide the whole pane.
  const sliding = useSlidingActive()
  const pagerRef = useRef<PagerView>(null)
  const paneIndexRef = useRef(paneIndex)
  useEffect(() => { paneIndexRef.current = paneIndex }, [paneIndex])
  // Dismiss any open keyboard on every pane transition so it never lingers
  // visually over a pane that doesn't own the focused input.
  useEffect(() => { requestAnimationFrame(() => Keyboard.dismiss()) }, [paneIndex])

  // SubPage — rendered as an extra page in PagerView after Settings.
  // afterSlideRef holds a callback to run after the sub-page is removed
  // (e.g. SelectFieldPage fires onSelect, then slides back).
  const afterSlideRef = useRef<(() => Promise<void> | void) | null>(null)

  // Chat page is only rendered when available, so PagerView has 2 or 3 pages.
  // These helpers map between stable logical pane indices and PagerView pages.
  const chatAvailable = (profile?.state ?? 'HIDDEN') === 'CHAT'
  const chatAvailableRef = useRef(chatAvailable)
  useEffect(() => { chatAvailableRef.current = chatAvailable }, [chatAvailable])
  const paneToPage = (pane: PaneIndex): number => chatAvailableRef.current ? pane : pane - 1
  const pageToPane = (page: number): PaneIndex => (chatAvailableRef.current ? page : page + 1) as PaneIndex

  const goToPane = (index: PaneIndex) => {
    if (index === paneIndexRef.current) return
    if (index === CHAT_PANE && !chatAvailableRef.current) return
    tap()
    pagerRef.current?.setPage(paneToPage(index))
    // setPaneIndex fires from onPageSelected
  }

  const subPageConfigRef = useRef(subPageConfig)
  useEffect(() => { subPageConfigRef.current = subPageConfig }, [subPageConfig])
  const onPageSelected = (e: { nativeEvent: { position: number } }) => {
    const pane = pageToPane(e.nativeEvent.position)
    // Prevent swiping into the empty SubPage slot.
    if (pane === SUBPAGE_PANE && !subPageConfigRef.current) {
      pagerRef.current?.setPage(paneToPage(SETTINGS_PANE))
      return
    }
    if (pane !== paneIndexRef.current) {
      tap()
      setPaneIndex(pane)
    }
  }

  const onPageScrollStateChanged = (e: { nativeEvent: { pageScrollState: string } }) => {
    if (e.nativeEvent.pageScrollState !== 'idle') return
    // Once the scroll settles, check if we ended up away from the sub-page.
    // If so, tear it down. Children count stays constant (SubPage is always
    // in PagerView, just empty), so no spurious events.
    if (paneIndexRef.current !== SUBPAGE_PANE && subPageConfigRef.current) {
      const cb = afterSlideRef.current
      afterSlideRef.current = null
      setSubPageConfig(null)
      if (cb) Promise.resolve(cb()).catch(console.error)
    }
  }

  // Navigate to the sub-page once it has mounted in PagerView.
  const pendingSubPageNav = useRef(false)
  useEffect(() => {
    if (subPageConfig && pendingSubPageNav.current) {
      pendingSubPageNav.current = false
      requestAnimationFrame(() => {
        pagerRef.current?.setPage(paneToPage(SUBPAGE_PANE))
      })
    }
  }, [subPageConfig])

  const openShellSubPage = (config: SubPageConfig) => {
    tap()
    pendingSubPageNav.current = true
    setSubPageConfig(config)
  }

  const closeShellSubPage = (afterSlide?: () => Promise<void> | void) => {
    tap()
    afterSlideRef.current = afterSlide ?? null
    goToPane(SETTINGS_PANE)
    // Cleanup happens in onPageSelected when the transition completes.
  }

  // PagerView scrollEnabled — disabled when photo reorder is active or when
  // the settings inner tab pager owns horizontal gestures (tab > 0).
  const scrollEnabled = !sliding && !(paneIndex === SETTINGS_PANE && settingsTabIndex > 0)

  // Android hardware back — when on the sub-page, go back to settings;
  // when on any other side pane, slide back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paneIndexRef.current === SUBPAGE_PANE) {
        closeShellSubPage()
        return true
      }
      const idx = paneIndexRef.current
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
        setNotifPerm(result)
        if (result === 'denied') openAppSettings()
        return
      }
      const result = await requestLocPermission()
      setLocPerm(result)
      if (result === 'denied') openAppSettings()
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
  const showNotifOverlay = notifPerm !== 'granted'

  useEffect(() => {
    if (notifPerm !== 'granted') return
    getLocPermission().then(setLocPerm)
  }, [notifPerm])

  // ── Startup completion ────────────────────────────────────────────────
  // Both permissions granted → send app/start + try to get location.
  const startupSentRef = useRef(false)
  const [locFailed, setLocFailed] = useState(false)
  const [locBusy, setLocBusy] = useState(false)
  useEffect(() => {
    if (notifPerm !== 'granted' || locPerm !== 'granted') return
    if (startupSentRef.current) return
    startupSentRef.current = true
    ;(async () => {
      // Get location + push token in parallel, then send app/start.
      const [location, token] = await Promise.all([
        getLocation(),
        pushTokenRef.current
          ? Promise.resolve(pushTokenRef.current)
          : ensurePushToken().catch(() => null),
      ])
      // Only include push_token if it changed from what the server has.
      const pushChanged = token && token !== profile?.data?.push_token?.token
      invoke('app/start', {
        ...(location ? { location: { latitude: location.lat, longitude: location.lng } } : {}),
        ...(pushChanged ? { push_token: { type: 'expo', token } } : {}),
      }).catch(() => {})
      if (!location) setLocFailed(true)
    })()
  }, [notifPerm, locPerm])

  const handleLocRetry = async () => {
    if (locBusy) return
    setLocBusy(true)
    try {
      const location = await getLocation()
      if (location) {
        setLocFailed(false)
        invoke('app/location', { location: { latitude: location.lat, longitude: location.lng } }).catch(() => {})
      }
    } finally {
      setLocBusy(false)
    }
  }

  const showLocOverlay = locPerm !== 'granted'

  // Unified card mode — derived synchronously so the header title never
  // flashes a stale value between state changes and the next render.
  const displayedCardMode = showNotifOverlay ? 'notif' : showLocOverlay ? 'loc' : locFailed ? 'locFailed' : state

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

  // Anchor pane on state transitions. Entering CHAT auto-navigates to the
  // chat pane; leaving CHAT snaps back to home. Because PagerView children
  // change (2↔3 pages), we need to adjust page indices after render.
  const prevStateRef = useRef(state)
  useEffect(() => {
    if (prevStateRef.current !== state) {
      const prev = prevStateRef.current
      prevStateRef.current = state
      const enteringChat = state === 'CHAT' && prev !== 'CHAT'
      const leavingChat = state !== 'CHAT' && prev === 'CHAT'

      if (enteringChat) {
        // Children changed from [Home,Settings] → [Chat,Home,Settings].
        // PagerView still shows the old page index — fix it, then slide to Chat.
        requestAnimationFrame(() => {
          pagerRef.current?.setPageWithoutAnimation(1) // Home is now page 1
          requestAnimationFrame(() => {
            pagerRef.current?.setPage(0) // animate to Chat
            setPaneIndex(CHAT_PANE)
          })
        })
      } else if (leavingChat) {
        // Children changed from [Chat,Home,Settings] → [Home,Settings].
        // Snap to Home (now page 0) without animation.
        requestAnimationFrame(() => {
          pagerRef.current?.setPageWithoutAnimation(0)
          setPaneIndex(HOME_PANE)
        })
      } else if (paneIndexRef.current !== HOME_PANE) {
        goToPane(HOME_PANE)
      }
    }
  }, [state])

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

  const watchers = profile?.watchers
    ? Object.values(profile.watchers).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    : []

  // Use displayedCardMode so card content only swaps at the flip midpoint.
  const showWatchers = !!profile && displayedCardMode === 'VISIBLE'
  const showHiddenPlaceholder = !!profile && displayedCardMode === 'HIDDEN'

  // If any watchers are listed when the user goes hidden, confirm first —
  // switching removes them all, which is destructive.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const [revealConfirmOpen, setRevealConfirmOpen] = useState(false)
  // Tracks whether the reveal dialog was opened from WATCHING state (skip toggle only shown then).
  const [revealIsForWatching, setRevealIsForWatching] = useState(false)
  const [skipRevealChecked, setSkipRevealChecked] = useState(false)
  const cardPullRef = useRef<(() => void) | null>(null)
  // Deferred resolve — keeps the card held at PULL_HOLD_Y until the
  // confirm dialog flow completes (confirm+server or cancel).
  const pullResolveRef = useRef<(() => void) | null>(null)
  const releasePull = () => { pullResolveRef.current?.(); pullResolveRef.current = null }

  const openRevealConfirm = (forWatching: boolean, resolve: () => void) => {
    pullResolveRef.current = resolve
    setRevealIsForWatching(forWatching)
    setSkipRevealChecked(false)
    setRevealConfirmOpen(true)
  }
  const closeRevealConfirm = () => {
    setRevealConfirmOpen(false)
    setRevealIsForWatching(false)
  }

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

  // Status chip shown next to settings button.
  const statusGreen = false
  const statusColor: string | undefined = state === 'VISIBLE' ? PURPLE : undefined
  const headerStatusLabel = (() => {
    if (state === 'WAITING' || state === 'REPLYING' || state === 'CHAT')
      return tg('home.statusOnlyMatch' as any, isMale).replace('{name}', matchName)
    if (state === 'VISIBLE')
      return tg('home.statusVisible' as any, isMale)
    return tg('home.statusHidden' as any, isMale)
  })()

  // The match card surfaces both for live interaction states and for
  // terminal/ended states (MISSED, CANCELLED, REFUSED, LEFT). The ended
  // states show the same match + a single dismiss button that clears the
  // record on the server and drops back to the HIDDEN shell.
  const isEndedState =
    state === 'MISSED' || state === 'CANCELLED' || state === 'REFUSED' || state === 'LEFT' ||
    state === 'REMOVED' || state === 'LOGGED_OUT' || state === 'INVITED' || state === 'HID' || state === 'DELETED'
  const isMatchCardOpen =
    state === 'WATCHING' || state === 'WAITING' || state === 'REPLYING' || state === 'CHAT' ||
    isEndedState
  // Displayed versions — drive card rendering (lag during flip).
  const displayedIsEndedState =
    displayedCardMode === 'MISSED' || displayedCardMode === 'CANCELLED' || displayedCardMode === 'REFUSED' || displayedCardMode === 'LEFT' ||
    displayedCardMode === 'REMOVED' || displayedCardMode === 'LOGGED_OUT' || displayedCardMode === 'INVITED' || displayedCardMode === 'HID' || displayedCardMode === 'DELETED'
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
  const [removeWatcherTarget, setRemoveWatcherTarget] = useState<WatcherInfo | null>(null)
  const [removeWatcherBusy, setRemoveWatcherBusy] = useState(false)

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
              tone="positive"
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
              tone="positive"
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

  const permissionButton = showNotifOverlay
    ? <PrimaryButton label={t('home.notifPromptButton')} onPress={handlePermissionRequest} disabled={permBusy || notifPerm === null} />
    : showLocOverlay
      ? <PrimaryButton label={t('home.locationPromptButton')} onPress={handlePermissionRequest} disabled={permBusy || locPerm === null} />
      : locFailed
        ? <PrimaryButton label={t('home.locationUnavailableButton')} onPress={handleLocRetry} disabled={locBusy} />
        : null

  const goToPreferences = () => {
    settingsChangeTabRef.current?.('preferences')
    goToPane(SETTINGS_PANE)
  }

  const hiddenButtons = showHiddenPlaceholder
    ? <Button variant="secondary" label={t('home.changePreferences')} onPress={goToPreferences} />
    : null

  const cardButtons = showNotifOverlay || showLocOverlay || locFailed
    ? permissionButton
    : isMatchCardOpen ? matchButtons : hiddenButtons

  // ── Header props ──────────────────────────────────────────────────────
  const headerTitle =
    showNotifOverlay ? t('home.notifHeaderTitle')
    : showLocOverlay ? t('home.locHeaderTitle')
    : locFailed ? t('home.locHeaderTitle')
    : state === 'CHAT' ? t('home.chatHeader')
    : state === 'WATCHING' ? t('push.WATCHING')
    : state === 'WAITING' ? t('push.WAITING')
    : state === 'REPLYING' ? t('push.REPLYING')
    : state === 'MISSED' ? t('push.MISSED')
    : state === 'CANCELLED' ? t('push.CANCELLED')
    : state === 'REFUSED' ? t('push.REFUSED')
    : state === 'LEFT' ? t('push.LEFT')
    : state === 'REMOVED' ? tg('push.REMOVED' as any, matchIsMale)
    : state === 'LOGGED_OUT' ? tg('push.LOGGED_OUT' as any, matchIsMale)
    : state === 'INVITED' ? t('push.INVITED')
    : state === 'HID' ? tg('push.HID' as any, matchIsMale)
    : state === 'DELETED' ? tg('push.DELETED' as any, matchIsMale)
    : isVisible ? t('home.watchersInnerTitle')
    : t('home.scanningHeader')

  const headerArrow = (() => {
    if (state === 'CHAT') return { direction: 'side' as const, onPress: () => goToPane(CHAT_PANE) }
    // Pull-based arrow disabled — status chip is now the toggle.
    // Original: if (showHiddenPlaceholder || state === 'WATCHING' || showWatchers || isVisible)
    //   return { direction: 'down' as const, onPress: () => cardPullRef.current?.() }
    return undefined
  })()

  const headerBadge = state === 'CHAT' ? (chatUnread || undefined) : isVisible ? watchers.length : undefined
  const headerBadgeColor = isVisible ? (watchers.length > 0 ? VISIBLE_ACCENT : 'rgba(0,0,0,0.25)') : undefined

  // ── Card props ────────────────────────────────────────────────────────
  // Pull gesture disabled — status chip is now the toggle.
  // Original cardOnPull kept for easy revert:
  // const cardOnPull = (() => {
  //   if (showWatchers) return onSwitchToHidden
  //   if (showHiddenPlaceholder) return () => new Promise<void>(resolve => {
  //     openRevealConfirm(false, resolve)
  //   })
  //   if (state === 'WATCHING') return async () => {
  //     if (await hasSeen('reveal_confirm')) return setVisibility('VISIBLE')
  //     return new Promise<void>(resolve => { openRevealConfirm(true, resolve) })
  //   }
  //   return undefined
  // })()
  const cardOnPull = undefined

  // Status chip toggle — opens confirm dialogs directly (no pull animation).
  const handleStatusToggle = async () => {
    if (busy) return
    if (isVisible) {
      onSwitchToHidden()
    } else if (state === 'HIDDEN') {
      setRevealIsForWatching(false)
      setSkipRevealChecked(false)
      setRevealConfirmOpen(true)
    } else if (state === 'WATCHING') {
      if (await hasSeen('reveal_confirm')) {
        setVisibility('VISIBLE')
      } else {
        setRevealIsForWatching(true)
        setSkipRevealChecked(false)
        setRevealConfirmOpen(true)
      }
    }
  }

  // Status dropdown menu — shows options the user can switch to (excludes current state).
  const statusMenuOptions = (() => {
    if (state !== 'VISIBLE' && state !== 'HIDDEN' && state !== 'WATCHING') return undefined
    const opts: Array<{ label: string; color?: string; onPress: () => void }> = []
    if (!isVisible) {
      opts.push({
        label: t('home.menuVisible'),
        color: PURPLE,
        onPress: () => setVisibility('VISIBLE'),
      })
    }
    if (state !== 'HIDDEN' && state !== 'WATCHING') {
      opts.push({
        label: t('home.menuHidden'),
        onPress: () => onSwitchToHidden(),
      })
    }
    // "Inactive" — placeholder, not wired to backend yet.
    opts.push({
      label: t('home.menuInactive'),
      color: RED,
      onPress: () => {},
    })
    return opts
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
    if (displayedCardMode === 'locFailed') {
      return (
        <Message
          state="HIDDEN"
          title={t('home.locationUnavailableTitle')}
          desc={t('home.locationUnavailableDesc')}
          hideIcon
        />
      )
    }
    if (displayedCardMode === 'HIDDEN') {
      return (
        <Message
          state="HIDDEN"
          title={t('home.hiddenInfoTitle')}
          desc={tg('home.hiddenInfoDesc', isMale)}
          hideIcon
        />
      )
    }
    return undefined
  })()

  const booting = !ready || notifPerm === null || (notifPerm === 'granted' && locPerm === null)
  const bootOpacity = useSharedValue(1)
  const [bootVisible, setBootVisible] = useState(true)

  useEffect(() => {
    if (!booting && bootVisible) {
      bootOpacity.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) }, (finished) => {
        'worklet'
        if (finished) runOnJS(setBootVisible)(false)
      })
    }
  }, [booting])

  const bootOverlayStyle = useAnimatedStyle(() => ({
    opacity: bootOpacity.value,
  }))

  if (booting) {
    return (
      <>
        <StatusBar style="dark" />
        <BootScreen />
      </>
    )
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.shell}>
        <StatusBar style="dark" />
        {/* react-native-pager-view's childrenWithOverriddenStyle casts
            every Children.map entry to ReactElement and accesses .props.
            Under React 19, falsy children (false/null) are no longer
            stripped before the callback, so the conditional chat page
            must be excluded from the array entirely — not rendered as
            `{cond && <View>}`. We build the pages array here and pass
            it via the children prop. */}
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={chatAvailable ? 1 : 0}
          scrollEnabled={scrollEnabled}
          overdrag={false}
          overScrollMode="never"
          onPageSelected={onPageSelected}
          onPageScrollStateChanged={onPageScrollStateChanged}
        >
          {[
            ...(chatAvailable ? [
              <View key="chat" style={{ flex: 1 }}>
                <ChatPage
                  onBack={() => goToPane(HOME_PANE)}
                  isActive={paneIndex === CHAT_PANE}
                  onUnreadChange={setChatUnread}
                />
              </View>,
            ] : []),

            <View key="home" style={{ flex: 1 }}>
              <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
                <HomeHeader
                  title={headerTitle}
                  statusLabel={headerStatusLabel}
                  statusGreen={statusGreen}
                  statusColor={statusColor}
                  arrow={headerArrow}
                  badge={headerBadge}
                  badgeColor={headerBadgeColor}
                  statusMenu={statusMenuOptions}
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
                        <Text style={styles.watchersDescText}>{
                          watchers.length === 0
                            ? tg('home.nowVisibleDesc', isMale)
                            : watchers.length === 1
                              ? tgg('home.nowVisibleWithOneWatcherDesc', isMale, watchers[0].is_male)
                              : tg('home.nowVisibleWithWatchersDesc', isMale)
                        }</Text>
                      </View>
                      {watchers.map((w, i) => (
                        <View key={w.user_id}>
                          {i > 0 && <View style={styles.watchersRowDivider} />}
                          <WatcherCard watcher={w} units={profile?.units} flat onPress={() => { tap(); setRemoveWatcherTarget(w) }} />
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
                    <PermissionCardFace icon="bell" />
                  )}

                  {(displayedCardMode === 'loc' || displayedCardMode === 'locFailed') && (
                    <PermissionCardFace icon="location" />
                  )}
                </HomeCard>

                <ConfirmDialog
                  visible={revealConfirmOpen}
                  title={t('home.revealConfirmTitle')}
                  description={tg('home.revealConfirmDesc', isMale)}
                  cancelLabel={t('home.revealConfirmCancel')}
                  confirmLabel={t('home.revealConfirmConfirm')}
                  cancelFlex={0.6}
                  onCancel={() => { if (!busy) { closeRevealConfirm(); releasePull() } }}
                  onConfirm={() => {
                    setVisibility('VISIBLE').finally(() => { closeRevealConfirm(); releasePull() })
                  }}
                  busy={busy}
                  skipToggle={revealIsForWatching ? {
                    label: t('home.revealConfirmSkip'),
                    checked: skipRevealChecked,
                    onToggle: () => setSkipRevealChecked(v => !v),
                  } : undefined}
                />

                <ConfirmDialog
                  visible={hideConfirmOpen}
                  title={t('home.hideConfirmTitle')}
                  description={hideConfirmDesc}
                  cancelLabel={t('home.hideConfirmCancel')}
                  confirmLabel={tg('home.hideConfirmConfirm', isMale)}
                  confirmFlex={0.6}
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
                  cancelFlex={0.6}
                  confirmLabel={t('home.inviteConfirmOk')}
                  tone="positive"
                  onCancel={() => { if (!busy) setInviteConfirmOpen(false) }}
                  onConfirm={() => runAction('app/invite', 'invite-confirm', () => setInviteConfirmOpen(false))}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={cancelConfirmOpen}
                  title={t('home.cancelWaitingTitle')}
                  description={tg('home.cancelWaitingDesc', matchIsMale).replace(/\{name\}/g, matchName)}
                  cancelLabel={t('home.cancelWaitingBack')}
                  confirmLabel={t('home.cancelWaitingConfirm')}
                  confirmFlex={0.6}
                  destructive
                  onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                  onConfirm={() => runAction('app/cancel', 'cancel-confirm', () => setCancelConfirmOpen(false))}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={refuseConfirmOpen}
                  title={t('home.refuseReplyTitle')}
                  description={tg('home.refuseReplyDesc', matchIsMale)}
                  cancelLabel={t('home.refuseReplyBack')}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  confirmFlex={0.6}
                  destructive
                  onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                  onConfirm={() => runAction('app/refuse', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={!!removeWatcherTarget}
                  title={t('home.removeWatcherTitle')}
                  description={tg('home.removeWatcherDesc' as any, removeWatcherTarget?.is_male ?? null).replace('{name}', removeWatcherTarget?.name ?? '')}
                  cancelLabel={t('home.removeWatcherCancel')}
                  cancelFlex={0.6}
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
                />
              </SafeAreaView>
            </View>,

            <View key="settings" style={{ flex: 1 }}>
              <SettingsPage onBack={() => goToPane(HOME_PANE)} focused={paneIndex === SETTINGS_PANE} onOpenSubPage={openShellSubPage} changeTabRef={settingsChangeTabRef} onTabChange={setSettingsTabIndex} />
            </View>,

            <View key="subpage" style={{ flex: 1, backgroundColor: '#eef0f3' }}>
              {subPageConfig && (
                subPageConfig.kind === 'ageRange'
                  ? <AgeRangeFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                  : subPageConfig.kind === 'radius'
                    ? <RadiusFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                    : subPageConfig.kind === 'admin'
                      ? <AdminFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                      : subPageConfig.kind === 'photos'
                        ? <PhotoFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                        : subPageConfig.kind === 'account'
                          ? <AccountFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                          : subPageConfig.kind === 'preview'
                            ? <PreviewFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                            : <SelectFieldPage config={subPageConfig} onBack={closeShellSubPage} />
              )}
            </View>,
          ]}
        </PagerView>
      </View>
      {bootVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, bootOverlayStyle]} pointerEvents="none">
          <BootScreen />
        </Animated.View>
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  watchersDescText: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
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
