import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Animated, Dimensions, I18nManager, BackHandler, Keyboard } from 'react-native'
import { Text } from '../src/components/AppText'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle, Rect, Ellipse, G } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { t, tg } from '../src/i18n'
import { Button, PrimaryButton } from '../src/components/Button'
import { WatcherCard } from '../src/components/WatcherCard'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { BootScreen } from '../src/components/BootScreen'
import { MatchCard } from '../src/components/MatchCard'
import { IconPressable } from '../src/components/IconPressable'
import { slidingActiveRef, useSlidingActive } from '../src/lib/gesture'
import SettingsPage from './settings'
import ChatPage from './chat'

const isRTL = I18nManager.isRTL

// ── Pane seam ──────────────────────────────────────────────────────────────
// Thin divider living in the gap between the home and settings panes. Lives
// off-screen when either pane is at rest; only becomes visible during the
// swipe transition as the strip slides by.

const SEAM_WIDTH = 1
const SEAM_GAP   = SEAM_WIDTH  // pane-to-pane spacer is just the seam itself
const SEAM_COLOR = 'transparent'

// ── Settings Icon ──────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  )
}

// Small chevron beside the settings gear — mirror of the back arrow on the
// settings screen. Points toward the pane the tap will slide to (right in
// LTR, left in RTL) so the directional affordance matches the swipe gesture.
function SettingsArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 15 6 L 9 12 L 15 18' : 'M 9 6 L 15 12 L 9 18'} />
    </Svg>
  )
}

// Mirror of SettingsArrowIcon for the "Open chat" CTA — points toward the
// chat pane (opposite side from settings), so the directional cue matches
// the swipe that the button triggers. White stroke to read on green fill.
function ChatArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 9 6 L 15 12 L 9 18' : 'M 15 6 L 9 12 L 15 18'} />
    </Svg>
  )
}

// Same chevron as above, black stroke — used inline with the header title
// text so the title reads as a tappable affordance pointing to the chat pane.
function ChatHeaderArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 9 6 L 15 12 L 9 18' : 'M 15 6 L 9 12 L 15 18'} />
    </Svg>
  )
}

// Stroke-only envelope with an arrow above — the inline counterpart of the
// big EnvelopeIcon. Direction mirrors the state it represents: 'down' for
// receiving (arrow drops into the envelope), 'up' for sending.
function EnvelopeStrokeIcon({ color, direction, size = 22 }: { color: string; direction: 'up' | 'down'; size?: number }) {
  const arrow = direction === 'down'
    ? 'M12 2 L12 8 M9 6 L12 9 L15 6'
    : 'M12 9 L12 3 M9 6 L12 3 L15 6'
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d={arrow} />
      <Path d="M3 11 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 z" />
      <Path d="M3.5 11.5 L12 17 L20.5 11.5" />
    </Svg>
  )
}

// Small paper-plane glyph for the big visibility buttons — same silhouette
// as the large EnvelopeIcon state badge, minus the circle backdrop so it
// reads on any button fill. Direction mirrors the state it will switch to.
function ArrowIcon({ color, direction, size = 28 }: { color: string; direction: 'up' | 'down'; size?: number }) {
  const isUp = direction === 'up'
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <G origin="60, 60" scaleY={isUp ? 1 : -1}>
        <Path d="M 17.5 62.5 L 100 25 L 57.5 60 Z" fill={color} />
        <Path d="M 57.5 60 L 100 25 L 73.75 98.75 Z" fill={color} fillOpacity={0.55} />
        <Path d="M 100 25 L 57.5 60" stroke="rgba(0,0,0,0.2)" strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx="30" cy="75" r="3" fill={color} opacity={0.8} />
        <Circle cx="17.5" cy="87.5" r="2.5" fill={color} opacity={0.55} />
        <Circle cx="7.5" cy="100" r="2" fill={color} opacity={0.32} />
      </G>
    </Svg>
  )
}

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
const HIDDEN_ACCENT = '#111'

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
        <Path d="M 26 62 L 92 32 L 58 60 Z" fill="#ffffff" />
        {/* Under fold — same white but dimmed, creating the folded look */}
        <Path d="M 58 60 L 92 32 L 71 91 Z" fill="#ffffff" fillOpacity={0.55} />
        {/* Crease line along the fold for extra definition */}
        <Path
          d="M 92 32 L 58 60"
          stroke={accent}
          strokeWidth={1.5}
          strokeOpacity={0.35}
          strokeLinecap="round"
        />
        {/* Motion trail — three fading dots behind the tail */}
        <Circle cx="36" cy="72" r="2.4" fill="#ffffff" opacity={0.8} />
        <Circle cx="26" cy="82" r="2" fill="#ffffff" opacity={0.55} />
        <Circle cx="18" cy="92" r="1.6" fill="#ffffff" opacity={0.32} />
      </G>
    </Svg>
  )
}

function StateIcon({ state }: { state: string }) {
  if (state === 'VISIBLE') return <EnvelopeIcon accent={VISIBLE_ACCENT} direction="down" />
  return <EnvelopeIcon accent={HIDDEN_ACCENT} direction="up" />
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
  hideIcon,
  hideDesc,
  badgeCount,
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
}) {
  const titleColor =
    state === 'VISIBLE' ? VISIBLE_ACCENT :
    state === 'HIDDEN' ? HIDDEN_ACCENT : undefined
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
      {badgeCount != null ? (
        <View style={messageStyles.titleRow}>
          {titleNode}
          <View style={[messageStyles.titleBadge, titleColor ? { backgroundColor: titleColor } : null]}>
            <Text style={messageStyles.titleBadgeText}>{badgeCount}</Text>
          </View>
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
    paddingHorizontal: 28,
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
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  descWrap: {
    alignSelf: 'stretch',
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
  const insets = useSafeAreaInsets()

  // ── Horizontal pager shell ──────────────────────────────────────────────
  // Three panes laid side-by-side: [0]=chat, [1]=home (middle, default),
  // [2]=settings. In LTR that places chat to the left of home and settings
  // to the right; RTL mirrors. Chat is only reachable while state===CHAT —
  // the gesture to pane 0 refuses otherwise.
  type PaneIndex = 0 | 1 | 2
  const HOME_PANE: PaneIndex = 1
  const CHAT_PANE: PaneIndex = 0
  const SETTINGS_PANE: PaneIndex = 2
  const [paneIndex, setPaneIndex] = useState<PaneIndex>(HOME_PANE)
  // Unread message count reported by ChatPage — shown as a badge next to the
  // "Chat" title while we're on the home pane.
  const [chatUnread, setChatUnread] = useState(0)
  const [shellW, setShellW] = useState(() => Dimensions.get('window').width)
  const [shellH, setShellH] = useState(0)
  // SettingsPage reports when the user is editing photos (iOS-style jiggle).
  // While that's active, the shell pan must not claim horizontal drags —
  // otherwise dragging a photo to reorder it slides the whole pane instead.
  const [settingsEditing, setSettingsEditing] = useState(false)
  const sliding = useSlidingActive()
  const shellTranslate = useRef(new Animated.Value(0)).current
  const paneIndexRef = useRef(paneIndex)
  const shellWRef = useRef(shellW)
  useEffect(() => { paneIndexRef.current = paneIndex }, [paneIndex])
  // Dismiss any open keyboard on every pane transition so it never lingers
  // visually over a pane that doesn't own the focused input (chat input,
  // settings text fields, etc.).
  useEffect(() => { Keyboard.dismiss() }, [paneIndex])
  useEffect(() => { shellWRef.current = shellW }, [shellW])

  // Direction sign: LTR lays panes left-to-right in render order (0,1,2),
  // so showing pane i means translating the strip by -i*step. RTL mirrors.
  const DIR = isRTL ? 1 : -1

  // One pane-step includes the seam gap so the gap slides completely off the
  // opposite edge — the seam never bleeds into a resting pane.
  const paneStep = (w: number) => w + SEAM_GAP

  const animateShellToIndex = (index: PaneIndex, velocity = 0) => {
    Animated.spring(shellTranslate, {
      toValue: DIR * index * paneStep(shellWRef.current),
      velocity,
      tension: 68,
      friction: 14,
      useNativeDriver: true,
    }).start()
  }

  const goToPane = (index: PaneIndex, velocity = 0) => {
    if (index === paneIndexRef.current) return
    tap()
    setPaneIndex(index)
    animateShellToIndex(index, velocity)
  }

  // Snap shell to current pane when the width first resolves.
  useEffect(() => {
    if (!shellW) return
    shellTranslate.setValue(DIR * paneIndexRef.current * paneStep(shellW))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellW])

  // Android hardware back — when on a side pane, slide back to home instead
  // of letting the router pop.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paneIndexRef.current !== HOME_PANE) {
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

  // Gesture reads `state` via a ref: the PanResponder captures its callbacks
  // once (useRef), so a direct closure would freeze the initial state value
  // and never unlock chat-pane access when the user later transitions to
  // CHAT.
  const chatAvailableRef = useRef(state === 'CHAT')
  useEffect(() => { chatAvailableRef.current = state === 'CHAT' }, [state])

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
  const shellPan = useMemo(() =>
    Gesture.Pan()
      .enabled(!settingsEditing && !sliding)
      .activeOffsetX([-10, 10])
      .failOffsetY([-20, 20])
      .onBegin(() => {
        if (slidingActiveRef.current) return
      })
      .onUpdate(e => {
        if (slidingActiveRef.current) return
        const w = shellWRef.current
        if (!w) return
        const step = paneStep(w)
        const idx = paneIndexRef.current
        const base = DIR * idx * step
        const canGoBack = idx > 0 && !(idx === HOME_PANE && !chatAvailableRef.current)
        const canGoFwd  = idx < 2
        const minIdx: PaneIndex = (canGoBack ? (idx - 1) : idx) as PaneIndex
        const maxIdx: PaneIndex = (canGoFwd  ? (idx + 1) : idx) as PaneIndex
        const t1 = DIR * minIdx * step
        const t2 = DIR * maxIdx * step
        const [lo, hi] = t1 < t2 ? [t1, t2] : [t2, t1]
        const next = Math.max(lo, Math.min(hi, base + e.translationX))
        shellTranslate.setValue(next)
      })
      .onEnd(e => {
        const w = shellWRef.current
        if (!w) return
        const idx = paneIndexRef.current
        const forward = DIR < 0 ? e.translationX < 0 : e.translationX > 0
        const vx = e.velocityX / 1000
        const flick = Math.abs(vx) > 0.4
        const past = Math.abs(e.translationX) > w * 0.3
        // Gate claim direction: on home, only allow chat-ward swipes if chat
        // is available; otherwise snap back in place.
        if (idx === HOME_PANE && !forward && !chatAvailableRef.current) {
          animateShellToIndex(idx, e.velocityX)
          return
        }
        let target: PaneIndex = idx
        if ((past || flick) && forward && idx < 2) target = (idx + 1) as PaneIndex
        else if ((past || flick) && !forward && idx > 0) {
          if (!(idx === HOME_PANE && !chatAvailableRef.current))
            target = (idx - 1) as PaneIndex
        }
        animateShellToIndex(target, e.velocityX)
        if (target !== idx) {
          tap()
          setPaneIndex(target)
        }
      })
      .runOnJS(true)
  , [settingsEditing, sliding])

  // Button stays disabled from click until the server round-trip resolves.
  // `pendingKey` identifies which button initiated the in-flight action so
  // only that one shows the disabled visual — all other buttons stay
  // visually normal but non-interactive via `silentDisabled`.
  const [busy, setBusy] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const setVisibility = (next: 'VISIBLE' | 'HIDDEN') => {
    if (busy) return
    if (next === (isVisible ? 'VISIBLE' : 'HIDDEN')) return
    tap()
    setBusy(true)
    invoke('app/visibility', { state: next })
      .then(() => {
        // `invoke` funnels the server's user record through applyServerUser —
        // no local update() call needed. isVisible will flip on the next render.
        setBusy(false)
        setHideConfirmOpen(false)
        setVisibleConfirmOpen(false)
      })
      .catch(err => {
        // Transient gateway errors (502 on cold start / timeout) surface as
        // HTML in err.message — warn instead of error so LogBox stays quiet;
        // realtime will reconcile state on the next server tick.
        console.warn('visibility toggle failed:', String(err).slice(0, 120))
        setBusy(false)
        setHideConfirmOpen(false)
        setVisibleConfirmOpen(false)
      })
  }

  const watchers = profile?.watchers ? Object.values(profile.watchers) : []

  // Copy swaps while visible: empty-list copy explains the feature, the
  // with-watchers copy orients the user around the list below.
  const visibleDescKey = watchers.length > 0
    ? 'home.nowVisibleWithWatchersDesc'
    : 'home.nowVisibleDesc'
  const visibleSubtitleKey = watchers.length > 0
    ? 'home.nowVisibleWithWatchersSubtitle'
    : 'home.nowVisibleSubtitle'

  const hasWatchers = watchers.length > 0
  const renderContent = () =>
    isVisible
      ? <Message
          state="VISIBLE"
          title={hasWatchers ? t('home.watchersInnerTitle') : t('home.nowVisible')}
          desc={tg(visibleDescKey, isMale)}
          hideIcon={hasWatchers}
          hideDesc={hasWatchers}
          badgeCount={hasWatchers ? watchers.length : undefined}
        />
      : <Message state="HIDDEN" title={t('home.hiddenModeTitle')} desc={tg('home.hiddenModeDesc', isMale)} />

  const showWatchers = !!profile && isVisible && watchers.length > 0

  // If any watchers are listed when the user goes hidden, confirm first —
  // switching removes them all, which is destructive.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const onSwitchToHidden = () => {
    tap()
    if (watchers.length > 0) setHideConfirmOpen(true)
    else setVisibility('HIDDEN')
  }
  const hideConfirmDesc =
    (watchers.length === 1
      ? t('home.hideConfirmOnePerson')
      : t('home.hideConfirmPeople').replace('{n}', String(watchers.length)))
    + ' ' + tg('home.hideConfirmDesc', isMale)

  const visibilityButton = isVisible
    ? <PrimaryButton label={t('home.switchToHidden')} onPress={onSwitchToHidden} disabled={busy} iconStart={<ArrowIcon color="#fff" direction="up" />} />
    : <PrimaryButton label={t('home.switchToVisible')} onPress={() => setVisibility('VISIBLE')} disabled={busy} tone="visible" iconStart={<ArrowIcon color="#fff" direction="down" />} />

  const [headerH, setHeaderH] = useState(0)
  const [buttonsH, setButtonsH] = useState(0)

  // The match card surfaces both for live interaction states and for
  // terminal/ended states (MISSED, CANCELLED, REFUSED, LEFT). The ended
  // states show the same match + a single dismiss button that clears the
  // record on the server and drops back to the HIDDEN shell.
  const isEndedState =
    state === 'MISSED' || state === 'CANCELLED' || state === 'REFUSED' || state === 'LEFT'
  const isMatchCardOpen =
    state === 'WATCHING' || state === 'WAITING' || state === 'REPLYING' || state === 'CHAT' ||
    isEndedState

  // ── Match-state actions ────────────────────────────────────────────────
  // The pinned bottom slot swaps in per-state buttons when the match card
  // is open, replacing the visibility toggle. Destructive actions route
  // through a ConfirmDialog first.
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [refuseConfirmOpen, setRefuseConfirmOpen] = useState(false)
  const [visibleConfirmOpen, setVisibleConfirmOpen] = useState(false)

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
        <PrimaryButton
          label={tg('home.tapForMore', isMale)}
          onPress={() => runAction('app/ok', 'ended-ok')}
          disabled={busy}
        />
      )
    }
    return null
  })()

  const buttons = isMatchCardOpen ? matchButtons : visibilityButton

  // Header title tracks the state machine: the two resting modes show the
  // brand, and any active state swaps in its push-notification label.
  const pushKey = `push.${state}`
  const pushLabel = isMatchCardOpen ? t(pushKey as any) : ''
  const showWatchersTitle = isVisible && watchers.length > 0
  const headerTitle =
    state === 'WATCHING'
      ? 'SyncWish'
      : pushLabel && pushLabel !== pushKey
        ? pushLabel
        : showWatchersTitle
          ? t('home.watchersInnerTitle')
          : !isVisible
            ? tg('home.hiddenHeaderTitle', isMale)
            : tg('home.visibleHeaderTitle', isMale)

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
        <Animated.View style={[styles.shellStrip, { width: 3 * shellW + 2 * SEAM_GAP, transform: [{ translateX: shellTranslate }] }]}>

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

              {/* ── Header ── */}
              <View
                style={styles.header}
                onLayout={e => setHeaderH(e.nativeEvent.layout.height)}
              >
                {state === 'CHAT' ? (
                  <IconPressable
                    style={styles.chatHeaderBtn}
                    pressedStyle={styles.chatHeaderBtnPressed}
                    onPress={() => goToPane(CHAT_PANE)}
                  >
                    <ChatHeaderArrowIcon />
                    <Text style={styles.logo}>{t('home.chatHeader')}</Text>
                    {chatUnread > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
                      </View>
                    )}
                  </IconPressable>
                ) : (
                  <View style={styles.headerTitleRow}>
                    <Text style={[styles.logo, showWatchersTitle && { color: VISIBLE_ACCENT }]}>{headerTitle}</Text>
                    {showWatchersTitle && (
                      <View style={[styles.headerWatcherBadge, { backgroundColor: VISIBLE_ACCENT }]}>
                        <Text style={styles.headerWatcherBadgeText}>{watchers.length}</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.headerActions}>
                  {state === 'WATCHING' && (
                    <Pressable
                      style={({ pressed }) => [styles.receiveBtn, pressed && styles.receiveBtnPressed]}
                      onPress={() => { if (!busy) { tap(); setVisibleConfirmOpen(true) } }}
                      disabled={busy}
                      accessibilityLabel={t('home.receiveInvitesBtn')}
                      collapsable={false}
                    >
                      <ArrowIcon color="#111" direction="down" />
                    </Pressable>
                  )}
                  <IconPressable
                    style={styles.settingsBtn}
                    pressedStyle={styles.settingsBtnPressed}
                    onPress={() => goToPane(SETTINGS_PANE)}
                  >
                    <SettingsIcon />
                    <SettingsArrowIcon />
                  </IconPressable>
                </View>
              </View>

              {/* Visible-with-watchers uses a pinned layout: title + subtitle
                  up top, a flex:1 white card in the middle that owns the
                  scrolling, and the desc pinned below. Everything else (other
                  states) keeps the original scroll-everything ScrollView so
                  short/long content both look right. */}
              {showWatchers ? (
                <View style={{ flex: 1 }} />
              ) : (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexGrow: 1, paddingBottom: buttonsH }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  delaysContentTouches={false}
                >
                  <View style={styles.content}>
                    {renderContent()}
                  </View>
                </ScrollView>
              )}

              <ConfirmDialog
                visible={hideConfirmOpen}
                title={t('home.hideConfirmTitle')}
                description={hideConfirmDesc}
                cancelLabel={t('home.hideConfirmCancel')}
                confirmLabel={tg('home.hideConfirmConfirm', isMale)}
                onCancel={() => { if (!busy) setHideConfirmOpen(false) }}
                onConfirm={() => setVisibility('HIDDEN')}
                busy={busy}
              />

              <ConfirmDialog
                visible={visibleConfirmOpen}
                title={t('home.visibleConfirmTitle')}
                description={tg('home.visibleConfirmDesc', isMale)}
                cancelLabel={t('home.hideConfirmCancel')}
                confirmLabel={tg('home.visibleConfirmConfirm', isMale)}
                onCancel={() => { if (!busy) setVisibleConfirmOpen(false) }}
                onConfirm={() => { setVisibility('VISIBLE'); setVisibleConfirmOpen(false) }}
                busy={busy}
              />

              <ConfirmDialog
                visible={inviteConfirmOpen}
                title={t('home.inviteConfirmTitle')}
                description={t('home.inviteConfirmDesc')}
                cancelLabel={t('home.inviteConfirmCancel')}
                confirmLabel={t('home.inviteConfirmOk')}
                tone="positive"
                onCancel={() => { if (!busy) setInviteConfirmOpen(false) }}
                onConfirm={() => runAction('app/invite', 'invite-confirm', () => setInviteConfirmOpen(false))}
                busy={busy}
              />

              <ConfirmDialog
                visible={cancelConfirmOpen}
                title={t('home.cancelWaitingTitle')}
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

            {/* Match card — covers everything below the header for non-resting
                states. Positioned in pane coordinates (outside SafeAreaView)
                so the top offset is unambiguous. */}
            {isMatchCardOpen && (
              <View style={[styles.matchCard, { top: insets.top + headerH + 6, bottom: state === 'CHAT' ? Math.max(insets.bottom, 8) : buttonsH + 16 }]}>
                {profile?.match ? (
                  <MatchCard key={profile.match.user_id} match={profile.match} userIsMale={isMale} bottomInset={0} hideTime={state === 'CHAT'} />
                ) : null}
              </View>
            )}

            {showWatchers && (
              <View style={[styles.matchCard, { top: insets.top + headerH + 6, bottom: buttonsH + 16 }]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  delaysContentTouches={false}
                >
                  {watchers.map((w, i) => (
                    <View key={w.user_id}>
                      {i > 0 && <View style={styles.watchersRowDivider} />}
                      <WatcherCard watcher={w} units={profile?.units} flat />
                    </View>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - watchers.length) }).map((_, i) => (
                    <View key={`ph-${i}`}>
                      <View style={styles.watchersRowDivider} />
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
                </ScrollView>
              </View>
            )}

            {/* Pinned buttons — rendered at pane level (outside SafeAreaView)
                so Android's elevation stacking compares them against the
                match card as proper siblings. Inside SafeAreaView, the
                card's elevation would cover the entire SafeAreaView
                regardless of the inner button's own elevation. */}
            {buttons && (
              <View
                style={[styles.buttons, { paddingBottom: Math.max(insets.bottom, 8) }]}
                onLayout={e => setButtonsH(e.nativeEvent.layout.height)}
              >
                {buttons}
              </View>
            )}
          </View>

          {/* Pane 2 — settings (right of home in LTR, left in RTL) */}
          <View
            style={[styles.shellPane, { start: 2 * (shellW + SEAM_GAP), width: shellW }]}
            pointerEvents={paneIndex === SETTINGS_PANE ? 'auto' : 'none'}
          >
            <SettingsPage onBack={() => goToPane(HOME_PANE)} focused={paneIndex === SETTINGS_PANE} onEditModeChange={setSettingsEditing} />
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
    backgroundColor: '#eef0f3',
    zIndex: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerWatcherBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWatcherBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 16,
  },
  // Clickable title shown in place of the SyncWish logo when state==='CHAT'.
  // Bare text + chevron, no rounded container — reads as an inline link, not
  // a button. Pressed state fades the whole row.
  chatHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatHeaderBtnPressed: {
    opacity: 0.5,
  },
  // Red unread-count pill beside the "Chat" title. Same 26px height as the
  // watcher-count badge so the row's alignItems:'center' keeps everything on
  // one line.
  unreadBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 16,
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
    // Lock text-box height to match the watcher-count badge (46) so the row's
    // alignItems:'center' lands both on the same centerline across platforms.
    lineHeight: 46,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  watcherCount: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#6d28d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watcherCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    gap: 2,
  },
  settingsBtnPressed: {
    opacity: 0.5,
  },
  // Surfaces the "switch to visible" path from the WATCHING match card.
  receiveBtn: {
    height: 40,
    minWidth: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  receiveBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  receiveBtnDisabled: {
    opacity: 0.5,
  },

  content: {
    alignItems: 'center',
    paddingTop: 48,
  },

  watchersList: {
    paddingHorizontal: 20,
    marginVertical: 24,
    gap: 10,
  },
  // Inset divider between watcher rows — sits inside the outer card, not
  // flush to its edges, so the list reads as grouped rows rather than
  // edge-to-edge strips.
  watchersRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 12,
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
    backgroundColor: 'rgba(0,0,0,0.05)',
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
  // Pinned overlay above the scroll view. paddingBottom merged at render
  // time with the safe-area bottom inset so the button stays clear of the
  // Android gesture pill and the iOS home indicator.
  buttons: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: '#eef0f3',
    zIndex: 3,
  },
  matchCard: {
    position: 'absolute',
    start: 16,
    end: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
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
