import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, I18nManager, BackHandler, Keyboard, AppState, Dimensions, Pressable, Modal, Platform, useColorScheme } from 'react-native'
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
import { getNotifPermission, requestNotifPermission, ensurePushToken, addNotificationTapListener, type NotifPermission } from '../src/lib/notifications'
import { getLocPermission, requestLocPermission, getLocation, getLastKnownLocation, watchLocation, enableLocationServices, openLocationSettings, openAppSettings, type LocPermission } from '../src/lib/location'
import { Button } from '../src/components/Button'
import { TEXT, WHITE, BLACK, GREEN, RED, GRAY_50 } from '../src/colors'
import { SINGLE, DOUBLE } from '../src/fonts'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BootScreen } from '../src/components/BootScreen'
import { MatchCard } from '../src/components/MatchCard'
import { CountBadge } from '../src/components/CountBadge'
import { HomeHeader } from '../src/components/HomeHeader'
import { HomeCard, PullScrollView } from '../src/components/HomeCard'
import { useSlidingActive } from '../src/lib/gesture'
import SettingsPage, { SelectFieldConfig, SelectFieldPage, SubPageConfig, AgeRangeFieldPage, RadiusFieldPage, AdminFieldPage, PhotoFieldPage, AccountFieldPage, PreviewFieldPage, AboutFieldPage, ProfileSectionPage, AppSectionPage, ShellInnerNavContext } from './settings'
import ChatPage from './chat'
import { LivoLogo } from '../src/components/LivoLogo'
import { Image } from 'expo-image'


// ── GPS pulse rings ────────────────────────────────────────────────────────

const AVATAR_SIZE = 130
const RING_COUNT = 1
const RING_DURATION = 3000
const RING_STAGGER = 0

function PulseRing({ delay, active }: { delay: number; active: boolean }) {
  const progress = useSharedValue(1)

  useEffect(() => {
    if (active) {
      progress.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(0, { duration: 0 }),
            withTiming(1, { duration: RING_DURATION, easing: Easing.out(Easing.cubic) }),
          ),
          -1,
          false
        )
      )
    } else {
      cancelAnimation(progress)
      progress.value = withTiming(1, { duration: 400 })
    }
  }, [active])

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.75,
    transform: [{ scale: 1 + progress.value * 0.95 }],
    borderColor: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['#767676', '#a0a0a0', '#767676']
    ),
    backgroundColor: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['rgba(118,118,118,0.22)', 'rgba(160,160,160,0.08)', 'rgba(118,118,118,0)']
    ),
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: 3,
      }, style]}
    />
  )
}

function PulseRings({ active }: { active: boolean }) {
  return (
    <>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <PulseRing key={i} delay={i * RING_STAGGER} active={active} />
      ))}
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

// ── Invite timer ──────────────────────────────────────────────────────────

const EXTEND_MINUTES = [10, 30, 60, 120, 240, 480, 1440]

function formatExtendOption(minutes: number): string {
  if (minutes < 60) return `${minutes} ${t('home.extendOptionMin')}`
  if (minutes === 1440) return t('home.extendOptionDay')
  return `${minutes / 60} ${t('home.extendOptionHr')}`
}

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

// Overlay shown on top of the profile image in the invited state.
function InviteTimerOverlay({ expiresAt, extended }: { expiresAt: string; extended?: boolean }) {
  const secsLeft = useSecsLeft(expiresAt)
  const isExpired = secsLeft === 0
  const isUrgent = secsLeft > 0 && secsLeft < 120
  const pulse = useSharedValue(1)
  const enter = useSharedValue(0)
  const bump = useSharedValue(1)
  const isFirstRender = useRef(true)

  useEffect(() => {
    enter.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
  }, [])

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    bump.value = withSequence(
      withTiming(1.12, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0.94, { duration: 100 }),
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
    )
  }, [expiresAt])

  useEffect(() => {
    if (isExpired) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      )
    } else if (isUrgent) {
      pulse.value = withRepeat(
        withTiming(0.55, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      )
    } else {
      pulse.value = withTiming(1, { duration: 300 })
    }
  }, [isExpired, isUrgent])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (enter.value - 1) * 24 }],
  }))
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }))

  const clockColor = isExpired ? '#ef4444' : isUrgent ? '#fb923c' : '#4ade80'
  const labelColor = isExpired ? 'rgba(239,68,68,0.7)' : isUrgent ? 'rgba(251,146,60,0.7)' : 'rgba(134,239,172,0.72)'

  return (
    <Animated.View style={[overlayStyles.container, enterStyle]}>
      <View style={[overlayStyles.topLine, isExpired && overlayStyles.topLineExpired, isUrgent && overlayStyles.topLineUrgent]} />
      <View style={overlayStyles.band}>
        <Animated.View style={[overlayStyles.content, pulseStyle, bumpStyle]}>
          <Text style={[overlayStyles.label, { color: labelColor }]}>{t(extended ? 'home.inviteTimerLabelExtended' : 'home.inviteTimerLabel')}</Text>
          <Text style={[overlayStyles.clock, { color: clockColor }]}>{formatClock(secsLeft)}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const overlayStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 10,
  },
  topLine: {
    height: 3,
    backgroundColor: '#22c55e',
  },
  topLineExpired: {
    backgroundColor: '#ef4444',
  },
  topLineUrgent: {
    backgroundColor: '#fb923c',
  },
  band: {
    backgroundColor: 'rgba(0, 15, 4, 0.76)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  clock: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
})

function ExtendButton({ busy, pendingKey, onOpen }: {
  busy: boolean; pendingKey: string | null; onOpen: () => void
}) {
  return (
    <Button
      variant="primary"
      label={t('home.extendBtn')}
      onPress={onOpen}
      disabled={busy}
      loading={busy && pendingKey === 'extend'}
    />
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { top: topInset } = useSafeAreaInsets()
  const { profile } = useUserStore()
  const colorScheme = useColorScheme()
  // ── Horizontal pager shell ──────────────────────────────────────────────
  // 3-page layout: [settings(0), home(1), side(2)]
  // Slot 2 renders page2 or chat depending on chatAvailable — no slot added/removed.
  // RTL right→left: Settings | Home | Side(page2/chat)
  type PaneIndex = 0 | 1 | 2
  const SETTINGS_PANE: PaneIndex = 0
  const HOME_PANE: PaneIndex = 1
  const PAGE2_PANE: PaneIndex = 2
  const CHAT_PANE: PaneIndex = 2  // same slot as PAGE2_PANE
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(HOME_PANE)
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
  const subPageDir = I18nManager.isRTL ? 1 : -1
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

  // chatAvailable: state is 'chat'
  const chatAvailable = profile?.state === 'chat'


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



  // Android hardware back — when on the sub-page, slide it out;
  // when on any other side pane, slide back to home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (innerOpenRef.current) {
        innerCloseRef.current()
        return true
      }
      if (subPageConfigRef.current) {
        closeShellSubPage()
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
  const isMale = profile?.is_male ?? null
  const ready = !!profile

  const [page2Alerting, setPage2Alerting] = useState(false)
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

  const showLocOverlay = locPerm !== 'granted'

  // Unified card mode — derived synchronously so the header title never
  // flashes a stale value between state changes and the next render.
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
      setExtendPickerOpen(false)
    }
  }, [state])

  useEffect(() => {
    const prev = prevPage2InviteUserIdRef.current
    prevPage2InviteUserIdRef.current = page2InviteUserId
    if (prev === undefined) return
    if (prev === null && page2InviteUserId !== null && paneIndexRef.current !== PAGE2_PANE) {
      setPage2Alerting(true)
      const timer = setTimeout(() => setPage2Alerting(false), 4900)
      return () => { clearTimeout(timer); setPage2Alerting(false) }
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
  const [extendPickerOpen, setExtendPickerOpen] = useState(false)
  const [extendModalVisible, setExtendModalVisible] = useState(false)
  const extendSheetY = useSharedValue(400)
  const extendSheetHeight = useRef(400)
  const extendSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: extendSheetY.value }],
  }))
  useEffect(() => {
    if (extendPickerOpen) {
      extendSheetY.value = extendSheetHeight.current
      setExtendModalVisible(true)
      requestAnimationFrame(() => {
        extendSheetY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      })
    } else {
      extendSheetY.value = withTiming(extendSheetHeight.current, { duration: 250, easing: Easing.in(Easing.cubic) }, () => {
        runOnJS(setExtendModalVisible)(false)
      })
    }
  }, [extendPickerOpen])



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
    if (!next) {
      opacityA.value = 0
      opacityB.value = 0
      setMatchA(null)
      setMatchB(null)
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
        // No current card — show incoming slot immediately so the placeholder is visible
        opacityB.value = 1
      } else {
        opacityB.value = 0
      }
      setTopSlot('B')
      setMatchB(next)
    } else {
      if (!activeMatch) {
        opacityA.value = 1
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
    ? [...profile.relations.watchers].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    : []

  const showHiddenPlaceholder = !!profile && displayedCardMode === null
  const firstProfileImage = profile?.images?.[0]?.normal
  const profileAvatarUrl = firstProfileImage
    ? publicImageUrl(profile.user_id, 'normal', firstProfileImage)
    : null

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
  // Displayed versions — drive card rendering (lag during flip).
  const displayedIsEndedState = displayedCardMode === 'missed' || displayedCardMode === 'fail'
  const displayedIsMatchCardOpen =
    displayedCardMode === 'watching' || displayedCardMode === 'waiting' || displayedCardMode === 'chat' ||
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

  const runExtend = (minutes: number) => {
    if (busy) return
    tap()
    setBusy(true)
    setPendingKey('extend')
    setExtendPickerOpen(false)
    invoke('app/extend', { minutes })
      .then(() => { setBusy(false); setPendingKey(null) })
      .catch(err => { console.error(err); setBusy(false); setPendingKey(null) })
  }

  const invitedPage1 = profile?.relations?.page1 as { expires_at?: string; extended?: boolean } | undefined
  const inviteExpiresAt = invitedPage1?.expires_at
  const inviteCanExtend = !!(inviteExpiresAt && !invitedPage1?.extended)
  const page2CanExtend = !!(page2PendingInvite?.expires_at && !page2PendingInvite?.extended)

  const matchButtons = (() => {
    if (!isMatchCardOpen) return null
    if (state === 'watching') {
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
    if (state === 'waiting') {
      return (
        <View style={styles.buttonRow}>
          <View style={styles.buttonCellReject}>
            <Button variant="destructive" label={t('home.cancelWaitingBtn')} onPress={() => { tap(); setCancelConfirmOpen(true) }} disabled={busy} />
          </View>
          {inviteCanExtend && (
            <View style={styles.buttonCellAccept}>
              <ExtendButton busy={busy} pendingKey={pendingKey} onOpen={() => { tap(); setExtendPickerOpen(true) }} />
            </View>
          )}
        </View>
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

  const permConfirmLabel = showNotifOverlay
    ? t('home.notifPromptButton')
    : showLocOverlay
      ? t('home.locationPromptButton')
      : t('home.locationUnavailableButton')

  const permOnConfirm = locFailed ? handleLocRetry : handlePermissionRequest
  const permBusyState = locFailed ? locBusy : permBusy

  const goToPreferences = () => {
    goToPane(SETTINGS_PANE)
  }

  const page1Event = profile?.relations?.page1?.event
  const hiddenButtons = showHiddenPlaceholder
    ? (page1Event === 'clear1' || page1Event === 'cancel' || page1Event === 'leave')
      ? (
        <Button
          variant="primary"
          tone="positive"
          label={tg('home.tapForMore', isMale)}
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
    : state === 'watching' ? t('push.WATCHING')
    : state === 'waiting' ? t('push.WAITING')
    : isEndedState ? tg(`home.ended.${state}.${page1Event}` as any, endedProfileIsMale)
    : t('home.hiddenHeader2')

  const headerArrow = undefined

  const headerBadge = undefined
  const headerBadgeColor = undefined

  const cardOnPull = undefined

  const handleStatusToggle = async () => {}

  const statusMenuOptions = undefined


  const isPermMode = showNotifOverlay || (state !== 'chat' && (showLocOverlay || locFailed))

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
        {/* Pass pages as an array to avoid React 19 falsy-children issues
            with react-native-pager-view's childrenWithOverriddenStyle. */}
        <Animated.View style={[{ flex: 1 }, pagerPushStyle]}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={chatAvailable ? CHAT_PANE : HOME_PANE}
          scrollEnabled={!sliding && !subPageOpen}
          overdrag={false}
          overScrollMode="never"
          onPageSelected={onPageSelected}
        >
          {[
            // Slot 0: settings
            <View key="settings" style={{ flex: 1 }}>
              <SettingsPage onBack={() => goToPane((paneIndexRef.current + 1) as PaneIndex)} focused={paneIndex === SETTINGS_PANE} onOpenSubPage={openShellSubPage} topInset={topInset} />
            </View>,

            // Slot 1: home (page1 — outgoing)
            <View key="home" style={{ flex: 1 }}>
              <View style={[styles.root, { paddingTop: topInset }]}>
                <HomeHeader
                  title={headerTitle}
                  arrow={headerArrow}
                  badge={headerBadge}
                  badgeColor={headerBadgeColor}
                  centered
                  page2Arrow={chatAvailable
                    ? { onPress: () => goToPane(CHAT_PANE), icon: 'chat' as const, count: chatUnread, alerting: chatUnreadAlerting }
                    : { onPress: () => goToPane(PAGE2_PANE), hasInvite: !!page2PendingInvite, hasDead: !!page2DeadInvite, alerting: page2Alerting, count: watchers?.length ?? 0 }
                  }
                  onSettingsPress={() => goToPane(SETTINGS_PANE)}
                  disabled={busy}
                  loading={busy}
                  dotPulsing={locFetching || busy}
                />
                {showHiddenPlaceholder ? (
                  <View style={styles.permScreen}>
                    <View style={styles.permAvatarSection}>
                      <View style={styles.permAvatarWrap}>
                        <PulseRings active={locFetching} />
                        {profileAvatarUrl ? (
                          <Image source={{ uri: profileAvatarUrl }} style={styles.permAvatar} contentFit="cover" />
                        ) : (
                          <View style={[styles.permAvatar, styles.permAvatarFallback]} />
                        )}
                      </View>
                    </View>
                    <View style={styles.permTextSection}>
                      <Text style={styles.permDesc}>{locFetching ? t('home.locatingDesc') : renderWithEmphasis((page1Event === 'clear1' || page1Event === 'cancel' || page1Event === 'leave') ? tg('home.readyToFindDesc', isMale) : tg('home.hiddenInfoDesc', isMale))}</Text>
                    </View>
                    <View style={styles.permActions}>
                      {hiddenButtons}
                    </View>
                  </View>
                ) : (
                  <HomeCard
                    onPull={cardOnPull}
                    pullRef={cardPullRef}
                    buttons={cardButtons}
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
                              hideTime={state === 'chat'}
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
                              hideTime={state === 'chat'}
                              onReady={handleSlotReadyB}
                            />
                          </Animated.View>
                        )}
                        {displayedCardMode === 'waiting' && inviteExpiresAt && (
                          <InviteTimerOverlay expiresAt={inviteExpiresAt} extended={invitedPage1?.extended} />
                        )}
                      </View>
                    )}

                  </HomeCard>
                )}

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
                  description={tg('home.refuseReplyDesc', page2InviteObj?.is_male ?? null)}
                  confirmLabel={t('home.refuseReplyConfirm')}
                  destructive
                  onCancel={() => { if (!busy) setRefuseConfirmOpen(false) }}
                  onConfirm={() => runAction('app/decline', 'refuse-confirm', () => setRefuseConfirmOpen(false))}
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

                <Modal
                  visible={extendModalVisible}
                  transparent
                  animationType="none"
                  onRequestClose={() => { if (!busy) setExtendPickerOpen(false) }}
                  statusBarTranslucent
                >
                  <View style={styles.extendModalWrap}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!busy) setExtendPickerOpen(false) }} />
                    <Animated.View
                      style={extendSheetStyle}
                      onLayout={e => { extendSheetHeight.current = e.nativeEvent.layout.height }}
                    >
                      <View style={styles.extendModalShadow} pointerEvents="none">
                        {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
                          <View key={i} style={[styles.extendModalShadowLayer, { opacity: o }]} />
                        ))}
                      </View>
                      <View style={styles.extendModalSheet}>
                        <View style={styles.extendModalHandle} />
                        <Text style={styles.extendModalTitle}>{t('home.extendBtn')}</Text>
                        <View style={styles.extendOptions}>
                          {EXTEND_MINUTES.map(m => (
                            <Pressable
                              key={m}
                              style={({ pressed }) => [styles.extendChip, pressed && styles.extendChipPressed]}
                              onPress={() => runExtend(m)}
                              disabled={busy}
                            >
                              <Text style={styles.extendChipText}>{formatExtendOption(m)}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </Animated.View>
                  </View>
                </Modal>
              </View>
            </View>,

            // Slot 2: side — page2 or chat depending on chatAvailable
            <View key="side" style={{ flex: 1 }}>
              {chatAvailable ? (
                <ChatPage
                  onBack={() => goToPane(HOME_PANE)}
                  isActive={paneIndex === CHAT_PANE}
                  onUnreadChange={setChatUnread}
                  topInset={topInset}
                />
              ) : <View style={[styles.root, { paddingTop: topInset }]}>
                <HomeHeader
                  title={
                    page2PendingInvite ? t('push.REPLYING')
                    : page2InviteObj?.state === 'missed' ? t('push.OTHER_CANCELLED')
                    : page2InviteObj?.state === 'fail' ? t('home.inviteExpired')
                    : t('home.hiddenHeaderTitle')
                  }
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
                      </View>
                    }
                  >
                    <View style={StyleSheet.absoluteFill}>
                      <MatchCard
                        match={page2PendingInvite}
                        userIsMale={isMale}
                        units={profile?.units}
                        bottomInset={0}
                      />
                      {page2PendingInvite.expires_at && <InviteTimerOverlay expiresAt={page2PendingInvite.expires_at} extended={page2PendingInvite.extended} />}
                    </View>
                  </HomeCard>
                ) : page2DeadInvite ? (
                  <HomeCard
                    buttons={
                      <Button
                        variant="primary"
                        tone="positive"
                        label={tg('home.tapForMore', isMale)}
                        onPress={() => runAction('app/clear2', 'clear2')}
                        loading={busy && pendingKey === 'clear2'}
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
                ) : (
                  <PullScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                  >
                    <View key="desc" style={styles.watchersDescRow}>
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
              </View>}
            </View>,
          ]}
        </PagerView>
        </Animated.View>
        {subPageConfig && (
          <Animated.View style={[styles.subPageOverlay, subPageAnimStyle]} pointerEvents={subPageOpen ? 'auto' : 'none'}>
            <GestureDetector gesture={subPageSwipe}>
              <View style={{ flex: 1 }}>
                <ShellInnerNavContext.Provider value={shellInnerNav}>
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
                              : subPageConfig.kind === 'about'
                                ? <AboutFieldPage config={subPageConfig} onBack={closeShellSubPage} />
                                : subPageConfig.kind === 'profileSection'
                                    ? <ProfileSectionPage config={subPageConfig} onBack={closeShellSubPage} />
                                    : subPageConfig.kind === 'appSection'
                                      ? <AppSectionPage config={subPageConfig} onBack={closeShellSubPage} />
                                      : <SelectFieldPage config={subPageConfig} onBack={closeShellSubPage} />}
                </ShellInnerNavContext.Provider>
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
    backgroundColor: WHITE,
  },
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: WHITE,
  },
  subPageOverlay: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: WHITE,
  },
  root: {
    flex: 1,
    backgroundColor: WHITE,
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
  permAvatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  permTextSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  permAvatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
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
  permDesc: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  permActions: {
    paddingHorizontal: SINGLE,
    paddingBottom: DOUBLE + SINGLE,
    paddingTop: 0,
  },
  waitingActions: {
    gap: 12,
  },
  extendModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  extendModalShadow: {
    height: 60,
    marginBottom: -1,
  },
  extendModalShadowLayer: {
    flex: 1,
    backgroundColor: BLACK,
  },
  extendModalSheet: {
    backgroundColor: WHITE,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  extendModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignSelf: 'center',
  },
  extendModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  extendOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  extendChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  extendChipPressed: {
    opacity: 0.55,
  },
  extendChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT,
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
  // Unequal split for reject/accept pairs: destructive stays compact so
  // the affirmative green action reads as the primary path.
  buttonCellReject: {
    flex: 1,
  },
  buttonCellAccept: {
    flex: 2,
  },
})
