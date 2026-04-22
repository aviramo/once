import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, I18nManager, BackHandler, Keyboard, AppState, Dimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, useFrameCallback, Easing, runOnJS } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle, Ellipse } from 'react-native-svg'
import { invoke, markStartupComplete } from '../src/lib/api'
import { hasSeen, markSeen } from '../src/lib/seen'
import { tap } from '../src/lib/haptics'
import { useUserStore, type Profile } from '../src/stores/userStore'
import { t, tg, tgg } from '../src/i18n'
import { getNotifPermission, requestNotifPermission, ensurePushToken, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openAppSettings, type LocPermission } from '../src/lib/location'
import { Button, PrimaryButton } from '../src/components/Button'
import { TEXT, WHITE, BLACK, GREEN, RED, GRAY, MUTED_TEXT, GRAY_50 } from '../src/colors'
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


// ── State accents ─────────────────────────────────────────────────────────
// Green for VISIBLE, neutral gray for HIDDEN. Used for title coloring.
const VISIBLE_ACCENT = '#15803d'
const HIDDEN_ACCENT = TEXT

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


// ── Permission card faces ─────────────────────────────────────────────────
// Clean, minimal design — white background with a single large icon in brand
// color. Location pin in red (attention-grabbing), bell in green (positive).

function PermissionCardFace({ icon, color, animate }: { icon: 'bell' | 'location'; color: string; animate?: boolean }) {
  const iconColor = color
  const translateY = useSharedValue(0)

  useEffect(() => {
    if (!animate) { translateY.value = 0; return }
    // Gentle bounce: drop 18px then spring back, repeat forever.
    translateY.value = withRepeat(
      withSpring(18, { damping: 3, stiffness: 120, mass: 0.8 }),
      -1,
      true,
    )
  }, [animate])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <View style={permCardStyles.wrap}>
      <Animated.View style={animate ? animStyle : undefined}>
        <Svg width={220} height={270} viewBox="0 0 180 240" fill="none">
          {icon === 'bell' ? (
            <>
              {/* Bell dome — narrows to smooth apex, widens toward body */}
              <Path
                d="M 30 152 C 28 90 60 28 90 28 C 120 28 152 90 150 152"
                stroke={iconColor}
                strokeWidth={22}
                strokeLinecap="round"
              />
              {/* Bottom rim — wider than the body */}
              <Path
                d="M 10 162 L 170 162"
                stroke={iconColor}
                strokeWidth={18}
                strokeLinecap="round"
              />
              {/* Clapper */}
              <Circle cx={90} cy={196} r={13} fill={iconColor} />
            </>
          ) : (
            <>
              {/* Map pin */}
              <Path
                d="M 90 205 C 32 162 22 115 22 78 C 22 38 52 16 90 16 C 128 16 158 38 158 78 C 158 115 148 162 90 205 Z"
                stroke={iconColor}
                strokeWidth={22}
                strokeLinejoin="round"
              />
              {/* Center dot */}
              <Circle cx={90} cy={78} r={18} fill={iconColor} />
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  )
}

const permCardStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
  type PaneIndex = 0 | 1 | 2
  const CHAT_PANE: PaneIndex = 0
  const HOME_PANE: PaneIndex = 1
  const SETTINGS_PANE: PaneIndex = 2
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
  const [pagerIdle, setPagerIdle] = useState(true)
  const pagerRef = useRef<PagerView>(null)
  const paneIndexRef = useRef(paneIndex)
  useEffect(() => { paneIndexRef.current = paneIndex }, [paneIndex])
  // Dismiss any open keyboard on every pane transition so it never lingers
  // visually over a pane that doesn't own the focused input.
  useEffect(() => { requestAnimationFrame(() => Keyboard.dismiss()) }, [paneIndex])

  // SubPage — slides in as an overlay on top of Settings.
  // afterSlideRef holds a callback to run after the sub-page is removed
  // (e.g. SelectFieldPage fires onSelect, then slides back).
  const afterSlideRef = useRef<(() => Promise<void> | void) | null>(null)
  const shellWidth = useSharedValue(Dimensions.get('window').width)
  const subPageSlide = useSharedValue(0)
  const [subPageOpen, setSubPageOpen] = useState(false)
  const subPageDir = I18nManager.isRTL ? -1 : 1
  const subPageAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: subPageDir * (1 - subPageSlide.value) * shellWidth.value }],
  }))
  // Push-style: the PagerView slides out in the opposite direction so both
  // pages move together as if connected.
  const pagerPushStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -subPageDir * subPageSlide.value * shellWidth.value }],
  }))

  // Swipe-to-dismiss: manualActivation so we resolve direction before
  // committing. Activates once horizontal movement is clear; fails on
  // vertical (lets scroll through). Photo drag coexists via long-press
  // threshold on dragPan — quick touches go to swipe, held touches to drag.
  const doCloseSubPage = () => { closeShellSubPage() }
  const swipeStartX = useSharedValue(0)
  const swipeStartY = useSharedValue(0)
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
        subPageSlide.value = 1 - Math.min(1, drag / shellWidth.value)
      })
      .onEnd(e => {
        'worklet'
        const drag = subPageDir * e.translationX
        const vx = subPageDir * e.velocityX
        const past = drag > shellWidth.value * 0.3
        const flick = vx > 400
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

  // Drive sub-page slide from open/closed state.
  useEffect(() => {
    if (subPageOpen) {
      subPageSlide.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    } else if (subPageConfigRef.current) {
      subPageSlide.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet'
        if (finished) runOnJS(onSubPageClosed)()
      })
    }
  }, [subPageOpen])

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
    if (pane !== paneIndexRef.current) {
      tap()
      setPaneIndex(pane)
    }
  }

  const onPageScrollStateChanged = (e: { nativeEvent: { pageScrollState: string } }) => {
    // Only block inner tab gestures during active user drag, not during
    // settling (animation-only). This lets the user swipe inner tabs
    // immediately after arriving at the settings pane.
    setPagerIdle(e.nativeEvent.pageScrollState !== 'dragging')
  }

  const onSubPageClosed = () => {
    const cb = afterSlideRef.current
    afterSlideRef.current = null
    setSubPageConfig(null)
    if (cb) Promise.resolve(cb()).catch(console.error)
  }

  const openShellSubPage = (config: SubPageConfig) => {
    tap()
    setSubPageConfig(config)
    setSubPageOpen(true)
  }

  const closeShellSubPage = (afterSlide?: () => Promise<void> | void) => {
    tap()
    afterSlideRef.current = afterSlide ?? null
    setSubPageOpen(false)
  }

  // PagerView scrollEnabled — disabled on settings pane entirely so the
  // inner tab pan owns all horizontal gestures without competing.
  const scrollEnabled = !sliding && (paneIndex !== SETTINGS_PANE || settingsTabIndex === 0)

  // Android hardware back — when on the sub-page, slide it out;
  // when on any other side pane, slide back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (subPageConfigRef.current) {
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

  const isOff = state === 'OFF'
  const setVisibility = (next: 'VISIBLE' | 'HIDDEN' | 'OFF'): Promise<void> => {
    if (busy) return Promise.resolve()
    const currentBase = isVisible ? 'VISIBLE' : isOff ? 'OFF' : 'HIDDEN'
    if (next === currentBase) return Promise.resolve()
    setBusy(true)
    tap()
    return invoke('app/visibility', { state: next })
      .then(() => {
        setBusy(false)
        setHideConfirmOpen(false)
        setOffConfirmOpen(false)
      })
      .catch(err => {
        console.warn('visibility toggle failed:', String(err).slice(0, 120))
        setBusy(false)
        setHideConfirmOpen(false)
        setOffConfirmOpen(false)
      })
  }

  // Two-slot system: A and B alternate as active/incoming.
  // The incoming slot loads invisibly on top (via topSlot zIndex), then
  // cross-fades over the active slot. finishTransition swaps roles and
  // clears the old slot — no remount of an already-measured MatchCard.
  type SlotId = 'A' | 'B'
  const [matchA, setMatchA] = useState<typeof profile.relations.match>(profile?.relations?.match ?? null)
  const [matchB, setMatchB] = useState<typeof profile.relations.match>(null)
  const activeSlotRef = useRef<SlotId>('A')
  const [topSlot, setTopSlot] = useState<SlotId>('B')
  const animRunning = useRef(false)

  const opacityA = useSharedValue(profile?.relations?.match ? 1 : 0)
  const opacityB = useSharedValue(0)

  const cardStyleA = useAnimatedStyle(() => ({ opacity: opacityA.value }))
  const cardStyleB = useAnimatedStyle(() => ({ opacity: opacityB.value }))

  const matchARef = useRef(matchA)
  const matchBRef = useRef(matchB)
  useEffect(() => { matchARef.current = matchA }, [matchA])
  useEffect(() => { matchBRef.current = matchB }, [matchB])

  useEffect(() => {
    const next = profile?.relations?.match ?? null
    const active = activeSlotRef.current
    const activeMatch = active === 'A' ? matchARef.current : matchBRef.current
    if (!next) return
    if (next.user_id === activeMatch?.user_id) {
      if (active === 'A') setMatchA(next)
      else setMatchB(next)
      return
    }
    // Load new person into inactive slot (on top), reset its transform first
    if (active === 'A') {
      opacityB.value = 0
      setTopSlot('B')
      setMatchB(next)
    } else {
      opacityA.value = 0
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
  }, [])

  const handleSlotReady = useCallback((slot: SlotId) => {
    if (slot === activeSlotRef.current) return
    if (animRunning.current) return
    animRunning.current = true
    const cfg = { duration: 420 }
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
    ? [...profile.relations.watchers].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    : []

  // Use displayedCardMode so card content only swaps at the flip midpoint.
  const showWatchers = !!profile && displayedCardMode === 'VISIBLE'
  const showHiddenPlaceholder = !!profile && displayedCardMode === 'HIDDEN'
  const showOffScreen = !!profile && displayedCardMode === 'OFF'

  // If any watchers are listed when the user goes hidden, confirm first —
  // switching removes them all, which is destructive.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const [offConfirmOpen, setOffConfirmOpen] = useState(false)
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

  const offConfirmDesc =
    (watchers.length === 1
      ? t('home.hideConfirmOnePerson')
      : t('home.hideConfirmPeople').replace('{n}', String(watchers.length)))
    + ' ' + tg('home.offConfirmDesc', isMale)

  // Match name (strip trailing ", age") and gendered invite confirm desc.
  const matchName = (profile?.relations?.match?.title ?? '').replace(/,\s*\d+\s*$/, '').replace(/,\s*$/, '')
  const matchIsMale = profile?.relations?.match?.is_male
  const inviteConfirmDesc = tgg('home.inviteConfirmDesc' as any, isMale, matchIsMale)

  // Status chip shown next to settings button.
  const statusGreen = false
  const statusColor: string | undefined = state === 'VISIBLE' ? GREEN : isOff ? RED : undefined
  const headerStatusLabel = (() => {
    if (state === 'WAITING' || state === 'REPLYING' || state === 'CHAT')
      return tg('home.statusOnlyMatch' as any, isMale).replace('{name}', matchName)
    if (state === 'VISIBLE')
      return t('home.menuVisible')
    if (isOff)
      return t('home.menuInactive')
    return t('home.menuHidden')
  })()

  // The match card surfaces both for live interaction states and for
  // terminal/ended states (OTHER_CANCELLED, OTHER_REFUSED, OTHER_LEFT, etc.). The ended
  // states show the same match + a single dismiss button that clears the
  // record on the server and drops back to the HIDDEN shell.
  const isEndedState =
    state === 'OTHER_CANCELLED' || state === 'OTHER_REFUSED' || state === 'OTHER_LEFT' ||
    state === 'OTHER_REMOVED' || state === 'OTHER_LOGGED_OUT' || state === 'OTHER_INVITED' || state === 'OTHER_HIDDEN' || state === 'OTHER_DELETED'
  const isMatchCardOpen =
    state === 'WATCHING' || state === 'WAITING' || state === 'REPLYING' || state === 'CHAT' ||
    isEndedState
  // Displayed versions — drive card rendering (lag during flip).
  const displayedIsEndedState =
    displayedCardMode === 'OTHER_CANCELLED' || displayedCardMode === 'OTHER_REFUSED' || displayedCardMode === 'OTHER_LEFT' ||
    displayedCardMode === 'OTHER_REMOVED' || displayedCardMode === 'OTHER_LOGGED_OUT' || displayedCardMode === 'OTHER_INVITED' || displayedCardMode === 'OTHER_HIDDEN' || displayedCardMode === 'OTHER_DELETED'
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
  const [removeWatcherTarget, setRemoveWatcherTarget] = useState<Profile | null>(null)
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
              variant="destructive"
              label={t('home.watchingReject')}
              onPress={() => runAction('app/ignore', 'watching-reject')}
              disabled={busy}
              loading={busy && pendingKey === 'watching-reject'}
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
              loading={busy && pendingKey === 'replying-accept'}
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
          loading={busy}
        />
      )
    }
    return null
  })()

  const permissionButton = showNotifOverlay
    ? <PrimaryButton label={t('home.notifPromptButton')} onPress={handlePermissionRequest} loading={permBusy} disabled={notifPerm === null} />
    : showLocOverlay
      ? <PrimaryButton label={t('home.locationPromptButton')} onPress={handlePermissionRequest} loading={permBusy} disabled={locPerm === null} />
      : locFailed
        ? <PrimaryButton label={t('home.locationUnavailableButton')} onPress={handleLocRetry} loading={locBusy} />
        : null

  const goToPreferences = () => {
    settingsChangeTabRef.current?.('preferences')
    goToPane(SETTINGS_PANE)
  }

  const hiddenButtons = showHiddenPlaceholder
    ? (
      <View style={styles.buttonRow}>
        <View style={styles.buttonCellAccept}>
          <Button variant="primary" tone="positive" label={t('home.goAvailable')} onPress={() => setVisibility('VISIBLE')} loading={busy} />
        </View>
        <View style={styles.buttonCellReject}>
          <Button variant="secondary" label={t('home.changePreferences')} onPress={goToPreferences} />
        </View>
      </View>
    )
    : null

  const offButton = showOffScreen
    ? (
      <View style={styles.buttonRow}>
        <View style={styles.buttonCellAccept}>
          <Button variant="primary" tone="positive" label={t('home.btnAvailable')} onPress={() => setVisibility('VISIBLE')} loading={busy} />
        </View>
        <View style={styles.buttonCellReject}>
          <Button variant="secondary" label={t('home.btnWatching')} onPress={() => setVisibility('HIDDEN')} loading={busy} />
        </View>
      </View>
    )
    : null

  const cardButtons = showNotifOverlay || showLocOverlay || locFailed
    ? permissionButton
    : isMatchCardOpen ? matchButtons
    : null

  // ── Header props ──────────────────────────────────────────────────────
  const headerTitle =
    showNotifOverlay ? t('home.notifHeaderTitle')
    : showLocOverlay ? t('home.locHeaderTitle')
    : locFailed ? t('home.locHeaderTitle')
    : state === 'CHAT' ? t('home.chatHeader')
    : state === 'WATCHING' ? t('push.WATCHING')
    : state === 'WAITING' ? t('push.WAITING')
    : state === 'REPLYING' ? t('push.REPLYING')
    : state === 'OTHER_CANCELLED' ? t('push.OTHER_CANCELLED')
    : state === 'OTHER_REFUSED' ? t('push.OTHER_REFUSED')
    : state === 'OTHER_LEFT' ? t('push.OTHER_LEFT')
    : state === 'OTHER_REMOVED' ? tg('push.OTHER_REMOVED' as any, matchIsMale)
    : state === 'OTHER_LOGGED_OUT' ? tg('push.OTHER_LOGGED_OUT' as any, matchIsMale)
    : state === 'OTHER_INVITED' ? tg('push.OTHER_INVITED' as any, matchIsMale)
    : state === 'OTHER_HIDDEN' ? tg('push.OTHER_HIDDEN' as any, matchIsMale)
    : state === 'OTHER_DELETED' ? tg('push.OTHER_DELETED' as any, matchIsMale)
    : isVisible ? t('home.visibleHeader')
    : isOff ? t('home.offHeader')
    : t('home.hiddenHeader2')

  const headerArrow = (() => {
    if (state === 'CHAT') return { direction: 'side' as const, onPress: () => goToPane(CHAT_PANE) }
    // Pull-based arrow disabled — status chip is now the toggle.
    // Original: if (showHiddenPlaceholder || state === 'WATCHING' || showWatchers || isVisible)
    //   return { direction: 'down' as const, onPress: () => cardPullRef.current?.() }
    return undefined
  })()

  const headerBadge = displayedCardMode === 'CHAT' ? (chatUnread || undefined) : undefined
  const headerBadgeColor = undefined

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

  // Status dropdown menu — fixed order: צופה → נצפה → כיבוי. Active item marked.
  const statusMenuOptions = (() => {
    if (state !== 'VISIBLE' && state !== 'HIDDEN' && state !== 'WATCHING' && !isOff) return undefined
    const isHidden = state === 'HIDDEN' || state === 'WATCHING'
    return [
      {
        label: t('home.menuHidden'),
        color: MUTED_TEXT,
        active: isHidden,
        onPress: isHidden ? () => {} : isOff ? () => setVisibility('HIDDEN') : () => onSwitchToHidden(),
      },
      {
        label: t('home.menuVisible'),
        color: GREEN,
        active: isVisible,
        onPress: isVisible ? () => {} : () => setVisibility('VISIBLE'),
      },
    ]
  })()

  const cardDescription = (() => {
    if (displayedCardMode === 'notif') {
      return (
        <Message
          state="HIDDEN"
          title={notifPerm === 'denied' ? t('home.emptyNotifBlockedTitle') : t('home.notifPromptTitle')}
          desc={notifPerm === 'denied' ? t('home.emptyNotifBlockedDesc') : t('home.notifPromptDesc')}

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

        />
      )
    }
    if (displayedCardMode === 'locFailed') {
      return (
        <Message
          state="HIDDEN"
          title={t('home.locationUnavailableTitle')}
          desc={t('home.locationUnavailableDesc')}

        />
      )
    }
    return undefined
  })()

  const isPermMode = showNotifOverlay || showLocOverlay || locFailed

  const permTitle = showNotifOverlay
    ? (notifPerm === 'denied' ? t('home.emptyNotifBlockedTitle') : t('home.notifPromptTitle'))
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationUnavailableTitle') : locPerm === 'denied' ? t('home.emptyLocationBlockedTitle') : t('home.locationPromptTitle'))
      : t('home.locationUnavailableTitle')

  const permDesc = showNotifOverlay
    ? (notifPerm === 'denied' ? t('home.emptyNotifBlockedDesc') : t('home.notifPromptDesc'))
    : showLocOverlay
      ? (locPerm === 'services-off' ? t('home.locationServicesOffDesc') : locPerm === 'denied' ? t('home.emptyLocationBlockedDesc') : t('home.locationPromptDesc'))
      : t('home.locationUnavailableDesc')

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
      <View style={styles.shell} onLayout={e => { shellWidth.value = e.nativeEvent.layout.width }}>
        <StatusBar style="dark" />
        {/* react-native-pager-view's childrenWithOverriddenStyle casts
            every Children.map entry to ReactElement and accesses .props.
            Under React 19, falsy children (false/null) are no longer
            stripped before the callback, so the conditional chat page
            must be excluded from the array entirely — not rendered as
            `{cond && <View>}`. We build the pages array here and pass
            it via the children prop. */}
        <Animated.View style={[{ flex: 1 }, pagerPushStyle]}>
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
                {!isPermMode && (
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
                    dotPulsing={locFetching || busy}
                  />
                )}
                {isPermMode ? (
                  <View style={styles.permScreen}>
                    <View style={styles.permIconArea}>
                      <PermissionCardFace
                        icon={showNotifOverlay ? 'bell' : 'location'}
                        color={
                          showNotifOverlay
                            ? (notifPerm === 'denied' ? RED : GRAY)
                            : showLocOverlay
                              ? (locPerm === 'denied' || locPerm === 'services-off' ? RED : GRAY)
                              : GRAY
                        }
                        animate={locFetching}
                      />
                    </View>
                    <View style={styles.permText}>
                      <Text style={styles.permTitle}>{permTitle}</Text>
                      <Text style={styles.permDesc}>{renderWithEmphasis(permDesc)}</Text>
                    </View>
                    <View style={styles.permActions}>
                      {permissionButton}
                    </View>
                  </View>
                ) : showHiddenPlaceholder ? (
                  <View style={styles.permScreen}>
                    <View style={styles.permIconArea}>
                      <Svg width={220} height={250} viewBox="0 0 220 250" fill="none">
                        <Path d="M 110 155 C 60 155 20 175 5 220 L 5 250 L 215 250 L 215 220 C 200 175 160 155 110 155 Z" fill={GRAY} />
                        <Path d="M 110 155 L 55 125 L 15 210 L 5 220 C 20 175 60 155 110 155 Z" fill={GRAY} />
                        <Path d="M 110 155 L 165 125 L 205 210 L 215 220 C 200 175 160 155 110 155 Z" fill={GRAY} />
                        <Path d="M 110 155 L 68 130 L 60 135 L 110 175 L 160 135 L 152 130 Z" fill="#4b5563" />
                        <Path d="M 55 88 C 55 45 75 20 110 20 C 145 20 165 45 165 88 Z" fill={GRAY} />
                        <Path d="M 20 92 C 20 82 60 72 110 72 C 160 72 200 82 200 92 C 200 102 160 108 110 108 C 60 108 20 102 20 92 Z" fill={GRAY} />
                        <Path d="M 58 88 C 58 84 80 78 110 78 C 140 78 162 84 162 88 C 162 90 140 86 110 86 C 80 86 58 90 58 88 Z" fill="#4b5563" opacity={0.3} />
                        <Ellipse cx={85} cy={118} rx={22} ry={16} fill="#000" />
                        <Ellipse cx={135} cy={118} rx={22} ry={16} fill="#000" />
                        <Path d="M 105 118 C 107 113 113 113 115 118" stroke="#000" strokeWidth={3} opacity={0.6} />
                      </Svg>
                    </View>
                    <View style={styles.permText}>
                      <Text style={styles.permTitle}>{t('home.hiddenInfoTitle')}</Text>
                      <Text style={styles.permDesc}>{renderWithEmphasis(tg('home.hiddenInfoDesc', isMale))}</Text>
                    </View>
                    <View style={styles.permActions}>
                      {hiddenButtons}
                    </View>
                  </View>
                ) : showOffScreen ? (
                  <View style={styles.permScreen}>
                    <View style={styles.permIconArea}>
                      <View style={{ opacity: 0.25 }}>
                        <Svg width={200} height={200} viewBox="0 0 100 100" fill="none">
                          <Path d="M 34 30 A 30 30 0 1 0 66 30" stroke={RED} strokeWidth={11} strokeLinecap="round" fill="none" />
                          <Path d="M 50 12 L 50 50" stroke={RED} strokeWidth={11} strokeLinecap="round" />
                        </Svg>
                      </View>
                    </View>
                    <View style={styles.permText}>
                      <Text style={styles.permTitle}>{t('home.offTitle')}</Text>
                      <Text style={styles.permDesc}>{renderWithEmphasis(tg('home.offDesc', isMale))}</Text>
                    </View>
                    <View style={styles.permActions}>
                      {offButton}
                    </View>
                  </View>
                ) : (
                  <HomeCard
                    onPull={cardOnPull}
                    pullRef={cardPullRef}
                    buttons={cardButtons}
                    description={cardDescription}
                  >
                    {displayedIsMatchCardOpen && (
                      <View style={StyleSheet.absoluteFill}>
                        {matchA && (
                          <Animated.View style={[StyleSheet.absoluteFill, cardStyleA, { zIndex: topSlot === 'A' ? 2 : 1 }]}>
                            <MatchCard
                              key={matchA.user_id}
                              match={matchA}
                              userIsMale={isMale}
                              units={profile?.units}
                              bottomInset={0}
                              hideTime={state === 'CHAT'}
                              onReady={handleSlotReadyA}
                            />
                          </Animated.View>
                        )}
                        {matchB && (
                          <Animated.View style={[StyleSheet.absoluteFill, cardStyleB, { zIndex: topSlot === 'B' ? 2 : 1 }]}>
                            <MatchCard
                              key={matchB.user_id}
                              match={matchB}
                              userIsMale={isMale}
                              units={profile?.units}
                              bottomInset={0}
                              hideTime={state === 'CHAT'}
                              onReady={handleSlotReadyB}
                            />
                          </Animated.View>
                        )}
                      </View>
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

                    {/* HIDDEN is now rendered as a flat screen above, not inside the card */}

                    {/* OFF is now rendered as a flat screen above, not inside the card */}
                  </HomeCard>
                )}

                <ConfirmDialog
                  visible={revealConfirmOpen}
                  title={t('home.revealConfirmTitle')}
                  description={tg('home.revealConfirmDesc', isMale)}
                  confirmLabel={t('home.revealConfirmConfirm')}
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
                  confirmLabel={tg('home.hideConfirmConfirm', isMale)}
                  destructive
                  onCancel={() => { if (!busy) { setHideConfirmOpen(false); releasePull() } }}
                  onConfirm={() => { setVisibility('HIDDEN').finally(releasePull) }}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={offConfirmOpen}
                  title={t('home.hideConfirmTitle')}
                  description={offConfirmDesc}
                  confirmLabel={tg('home.hideConfirmConfirm', isMale)}
                  destructive
                  onCancel={() => { if (!busy) { setOffConfirmOpen(false); releasePull() } }}
                  onConfirm={() => { setVisibility('OFF').finally(releasePull) }}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={inviteConfirmOpen}
                  title={t('home.inviteConfirmTitle').replace('{name}', matchName)}
                  description={inviteConfirmDesc.replace(/\{name\}/g, matchName)}
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
                  confirmLabel={t('home.cancelWaitingConfirm')}
                  destructive
                  onCancel={() => { if (!busy) setCancelConfirmOpen(false) }}
                  onConfirm={() => runAction('app/cancel', 'cancel-confirm', () => setCancelConfirmOpen(false))}
                  busy={busy}
                />

                <ConfirmDialog
                  visible={refuseConfirmOpen}
                  title={t('home.refuseReplyTitle')}
                  description={tg('home.refuseReplyDesc', matchIsMale)}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  destructive
                  onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                  onConfirm={() => runAction('app/refuse', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
                  busy={busy}
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
                />
              </SafeAreaView>
            </View>,

            <View key="settings" style={{ flex: 1 }}>
              <SettingsPage onBack={() => goToPane(HOME_PANE)} focused={paneIndex === SETTINGS_PANE} pagerIdle={pagerIdle} onOpenSubPage={openShellSubPage} changeTabRef={settingsChangeTabRef} onTabChange={setSettingsTabIndex} />
            </View>,
          ]}
        </PagerView>
        </Animated.View>
        {subPageConfig && (
          <Animated.View style={[styles.subPageOverlay, subPageAnimStyle]} pointerEvents={subPageOpen ? 'auto' : 'none'}>
            <GestureDetector gesture={subPageSwipe}>
              <View style={{ flex: 1 }}>
                {subPageConfig.kind === 'ageRange'
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
                            : <SelectFieldPage config={subPageConfig} onBack={closeShellSubPage} />}
              </View>
            </GestureDetector>
          </Animated.View>
        )}
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
    backgroundColor: GRAY_50,
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: GRAY_50,
  },
  subPageOverlay: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: GRAY_50,
  },
  root: {
    flex: 1,
    backgroundColor: GRAY_50,
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
  // ── Permission screen (no card) ────────────────────────────────────────
  permScreen: {
    flex: 1,
  },
  permIconArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permText: {
    paddingHorizontal: 32,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 10,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  permDesc: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  permActions: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 8,
  },
  // Two-button horizontal row used by WATCHING/REPLYING. flex:1 cells so
  // both buttons share width evenly regardless of label length.
  buttonRow: {
    flexDirection: 'row',
    gap: 20,
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
