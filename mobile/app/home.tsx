import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, PanResponder, Dimensions, I18nManager, BackHandler } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { t, tg } from '../src/i18n'
import { PrimaryButton } from '../src/components/Button'
import { ProfilePreviewRow, PROFILE_ASSETS, GALLERY_HEIGHT } from '../src/components/ProfilePreviewRow'
import { BootScreen } from '../src/components/BootScreen'
import { Asset } from 'expo-asset'
import SettingsPage from './settings'

const isRTL = I18nManager.isRTL

// ── Zigzag seam ────────────────────────────────────────────────────────────
// Decorative divider drawn between the home and settings panes. Renders a
// small-amplitude vertical zigzag the full height of the shell so the seam
// is visibly textured rather than a flat hairline.

const SEAM_AMP   = 3      // horizontal amplitude (px) — total width = 2*AMP
const SEAM_SEG   = 16     // pixels per zigzag segment
const SEAM_COLOR = 'rgba(0,0,0,0.22)'
const SEAM_WIDTH = SEAM_AMP * 2

function ZigzagSeam({ height }: { height: number }) {
  const segments = Math.max(1, Math.ceil(height / SEAM_SEG))
  let d = `M ${SEAM_AMP} 0`
  for (let i = 1; i <= segments; i++) {
    const y = Math.min(i * SEAM_SEG, height)
    const x = i % 2 === 1 ? 0 : SEAM_WIDTH
    d += ` L ${x} ${y}`
  }
  return (
    <Svg width={SEAM_WIDTH} height={height} viewBox={`0 0 ${SEAM_WIDTH} ${height}`}>
      <Path d={d} stroke={SEAM_COLOR} strokeWidth={1.2} strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

// ── Settings Icon ──────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  )
}

// ── State Icons ────────────────────────────────────────────────────────────
// Large pictographic glyph that anchors the content area. Swapped per state:
// a plain incognito silhouette when hidden, binoculars when visible.
//
// All icons render on a 120×120 viewBox with solid #111 fills so they read
// clearly at large sizes without stroke-weight tuning.

const ICON_SIZE = 124

function IncognitoIcon() {
  // Classic "incognito" glyph: fedora + thin wide brim + two round sunglasses
  // joined by a short bridge. No head or body — just the hat and glasses float
  // on the background.
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 120 120" fill="none">
      {/* Fedora crown — trapezoid with softly rounded top corners */}
      <Path d="M 28 50 L 36 20 Q 38 16 44 16 L 76 16 Q 82 16 84 20 L 92 50 Z" fill="#111" />
      {/* Brim — thin horizontal bar, wider than the crown */}
      <Rect x="14" y="50" width="92" height="7" rx="3.5" fill="#111" />
      {/* Left lens */}
      <Circle cx="32" cy="84" r="24" fill="#111" />
      {/* Right lens */}
      <Circle cx="88" cy="84" r="24" fill="#111" />
      {/* Bridge between lenses */}
      <Rect x="56" y="80" width="8" height="8" fill="#111" />
    </Svg>
  )
}

function BinocularsIcon() {
  // Two round barrels with large lens cutouts, joined by a center bridge, with
  // tilted "horn" eyepieces rising from each barrel and leaving a V-notch
  // between them at the top — matches the reference glyph shape.
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 120 120" fill="none">
      {/* Left eyepiece — tilted oval leaning toward center */}
      <Ellipse cx="32" cy="38" rx="15" ry="24" fill="#111" transform="rotate(-14 32 38)" />
      {/* Right eyepiece — mirror */}
      <Ellipse cx="88" cy="38" rx="15" ry="24" fill="#111" transform="rotate(14 88 38)" />

      {/* Left barrel */}
      <Circle cx="32" cy="80" r="28" fill="#111" />
      {/* Right barrel */}
      <Circle cx="88" cy="80" r="28" fill="#111" />

      {/* Bridge — rounded bar joining the two barrels through the middle */}
      <Rect x="50" y="58" width="20" height="32" rx="3" fill="#111" />

      {/* Lens cutouts — large white circles read as glass */}
      <Circle cx="32" cy="80" r="14" fill="#fafafa" />
      <Circle cx="88" cy="80" r="14" fill="#fafafa" />
      {/* Focus-wheel dot on the bridge */}
      <Circle cx="60" cy="80" r="3" fill="#fafafa" />
    </Svg>
  )
}

function StateIcon({ state }: { state: string }) {
  if (state === 'VISIBLE') return <BinocularsIcon />
  return <IncognitoIcon />
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

function Message({ state, title, desc }: { state: string; title: string; desc: string }) {
  return (
    <View style={messageStyles.wrap}>
      <View style={messageStyles.icon}>
        <StateIcon state={state} />
      </View>
      <Text style={messageStyles.title}>{title}</Text>
      {/* Only the description scrolls if it overflows — icon + title stay
          pinned. flex:1 inside a height-bounded parent gives the ScrollView
          the constraint it needs to actually scroll instead of growing. */}
      <ScrollView
        style={messageStyles.descScroll}
        contentContainerStyle={messageStyles.descScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={messageStyles.desc}>{renderWithEmphasis(desc)}</Text>
      </ScrollView>
    </View>
  )
}

const messageStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  icon: {
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  descScroll: {
    flex: 1,
    alignSelf: 'stretch',
    marginTop: 14,
  },
  descScrollContent: {
    paddingBottom: 8,
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
  const { profile, update } = useUserStore()

  // ── Horizontal pager shell ──────────────────────────────────────────────
  // Two panes laid side-by-side: [0]=home content, [1]=full Settings page.
  // Same motion model as the Settings tab pager — spring translation + pan
  // responder on the wrapping View. The Settings page is embedded (not
  // routed to) so the swipe feels like moving between siblings rather than
  // pushing a new screen.
  const [paneIndex, setPaneIndex] = useState<0 | 1>(0)
  const [shellW, setShellW] = useState(() => Dimensions.get('window').width)
  const [shellH, setShellH] = useState(0)
  const shellTranslate = useRef(new Animated.Value(0)).current
  const paneIndexRef = useRef(paneIndex)
  const shellWRef = useRef(shellW)
  useEffect(() => { paneIndexRef.current = paneIndex }, [paneIndex])
  useEffect(() => { shellWRef.current = shellW }, [shellW])

  // Direction sign: LTR places pane 1 to the right of pane 0, so showing
  // pane 1 means translating the strip by -width. RTL mirrors that.
  const DIR = isRTL ? 1 : -1

  const animateShellToIndex = (index: 0 | 1, velocity = 0) => {
    Animated.spring(shellTranslate, {
      toValue: DIR * index * shellWRef.current,
      velocity,
      tension: 68,
      friction: 14,
      useNativeDriver: true,
    }).start()
  }

  const goToPane = (index: 0 | 1, velocity = 0) => {
    if (index === paneIndexRef.current) return
    tap()
    setPaneIndex(index)
    animateShellToIndex(index, velocity)
  }

  // Snap shell to current pane when the width first resolves.
  useEffect(() => {
    if (!shellW) return
    shellTranslate.setValue(DIR * paneIndexRef.current * shellW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellW])

  // Android hardware back — when on the settings pane, consume the press
  // and slide back to home instead of letting the router pop (which would
  // take the user out of the app).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (paneIndexRef.current === 1) {
        goToPane(0)
        return true
      }
      return false
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shellPan = useRef(
    PanResponder.create({
      // Coexistence rules with inner pan responders (profile carousel on
      // home, tab pager inside settings):
      //   • On pane 0 (home): any clearly horizontal gesture becomes a
      //     shell swipe to settings.
      //   • On pane 1 (settings): claim backward gestures (toward home).
      //     The inner Settings tab pager surrenders backward swipes when
      //     it's at the first tab, so this handler only ever receives
      //     them in that case — non-first-tab swipes stay with the inner
      //     pager via responder bubbling.
      onMoveShouldSetPanResponder: (_, g) => {
        const horizontal =
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5
        if (!horizontal) return false
        if (paneIndexRef.current === 0) return true
        const backward = isRTL ? g.dx < 0 : g.dx > 0
        return backward
      },
      onPanResponderMove: (_, g) => {
        const w = shellWRef.current
        if (!w) return
        const base = DIR * paneIndexRef.current * w
        const edge = DIR * 1 * w
        const [lo, hi] = DIR < 0 ? [edge, 0] : [0, edge]
        const next = Math.max(lo, Math.min(hi, base + g.dx))
        shellTranslate.setValue(next)
      },
      onPanResponderRelease: (_, g) => {
        const w = shellWRef.current
        if (!w) return
        const index = paneIndexRef.current
        const forward = DIR < 0 ? g.dx < 0 : g.dx > 0
        const flick = Math.abs(g.vx) > 0.4
        const past = Math.abs(g.dx) > w * 0.3
        let target: 0 | 1 = index
        if ((past || flick) && forward && index < 1) target = 1
        else if ((past || flick) && !forward && index > 0) target = 0
        animateShellToIndex(target, g.vx * 1000)
        if (target !== index) {
          tap()
          setPaneIndex(target)
        }
      },
    })
  ).current

  const state = profile?.state ?? 'HIDDEN'
  const isMale = profile?.is_male ?? null

  // Preload the profile carousel images into the asset cache before the
  // screen reveals. Without this the message + icon render a frame before
  // the gallery images finish decoding, producing a visible "pop". We also
  // gate on the profile being loaded so all UI appears at once.
  const [assetsReady, setAssetsReady] = useState(false)
  useEffect(() => {
    Asset.loadAsync(PROFILE_ASSETS as any)
      .then(() => setAssetsReady(true))
      .catch(() => setAssetsReady(true))
  }, [])

  const ready = assetsReady && !!profile

  // Cooldown after a visibility toggle — 5 seconds where the button is
  // disabled (and rendered as such) to prevent rapid toggling while the
  // server round-trip settles. The timer id is held in a ref so we can
  // clear it on unmount if the screen is left mid-cooldown.
  const [cooldown, setCooldown] = useState(false)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
    }
  }, [])

  // Visibility toggle — optimistically update the local profile so the UI
  // reacts instantly, then fire the server event. The server response
  // broadcasts the authoritative state back via the user-update channel.
  // Payload shape matches the old web app: { event: 'visibility', state: ... }.
  const setVisibility = (next: 'VISIBLE' | 'HIDDEN') => {
    if (cooldown) return
    tap()
    setCooldown(true)
    cooldownTimer.current = setTimeout(() => setCooldown(false), 5000)
    update({ state: next })
    invoke('app/visibility', { state: next }).catch(console.error)
  }

  // Per-state message. The gallery is rendered separately below the message
  // area (not inside it) so its vertical spacing from the button is
  // independent of message length.
  const renderContent = () => {
    switch (state) {
      case 'HIDDEN':
        return <Message state={state} title={tg('home.hiddenModeTitle', isMale)} desc={tg('home.hiddenModeDesc', isMale)} />
      case 'VISIBLE':
        return <Message state={state} title={tg('home.nowVisible', isMale)} desc={tg('home.nowVisibleDesc', isMale)} />
      default:
        return <Message state={state} title={tg('home.hiddenModeTitle', isMale)} desc={tg('home.hiddenModeDesc', isMale)} />
    }
  }

  const showGallery = (state === 'HIDDEN' || state === 'VISIBLE') && !!profile

  const renderButtons = () => {
    switch (state) {
      case 'HIDDEN':
        return <PrimaryButton label={t('home.switchToVisible')} onPress={() => setVisibility('VISIBLE')} disabled={cooldown} />
      case 'VISIBLE':
        return <PrimaryButton label={t('home.switchToHidden')} onPress={() => setVisibility('HIDDEN')} disabled={cooldown} />
      default:
        return null
    }
  }

  const buttons = renderButtons()

  // Gate the entire screen on profile fetch + asset preload so nothing
  // pops in piece by piece. Until both are ready, render the same branded
  // boot animation used during the auth check so the two loading phases
  // feel like one continuous start-up.
  if (!ready) {
    return (
      <>
        <StatusBar style="dark" />
        <BootScreen />
      </>
    )
  }

  return (
    <View
      style={styles.shell}
      onLayout={e => {
        setShellW(e.nativeEvent.layout.width)
        setShellH(e.nativeEvent.layout.height)
      }}
      {...shellPan.panHandlers}
    >
      <StatusBar style="dark" />
      <Animated.View style={[styles.shellStrip, { transform: [{ translateX: shellTranslate }] }]}>
        {/* Decorative zigzag seam between the two panes. Centered on the
            boundary (start = shellW - AMP) and drawn full height so the
            divider reads as a stitched edge rather than a flat line. */}
        {shellH > 0 && (
          <View
            pointerEvents="none"
            style={[styles.shellSeam, { start: shellW - SEAM_AMP, width: SEAM_WIDTH }]}
          >
            <ZigzagSeam height={shellH} />
          </View>
        )}

        {/* Pane 0 — home */}
        <View
          style={[styles.shellPane, { start: 0, width: shellW }]}
          pointerEvents={paneIndex === 0 ? 'auto' : 'none'}
        >
    <SafeAreaView style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.logo}>SyncWish</Text>
        <Pressable
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
          onPress={() => goToPane(1)}
        >
          <SettingsIcon />
        </Pressable>
      </View>

      {/* ── Content — icon+message block anchored below the header with a
          fixed top gap, so the vertical position doesn't shift with content
          length across states. ── */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* ── Gallery — sits in its own row between message and button so
          there's a guaranteed gap on both sides regardless of message
          length. ── */}
      {showGallery && profile && (
        <View style={styles.gallery}>
          <ProfilePreviewRow
            userId={profile.user_id}
            isForMale={profile.is_for_male}
            isForFemale={profile.is_for_female}
            ageFrom={profile.age_from}
            ageTo={profile.age_to}
            blur={state === 'VISIBLE'}
          />
        </View>
      )}

      {/* ── Buttons (optional; collapses when null) ── */}
      {buttons && <View style={styles.buttons}>{buttons}</View>}
    </SafeAreaView>
        </View>

        {/* Pane 1 — settings embedded as a sibling */}
        <View
          style={[styles.shellPane, { start: shellW, width: shellW }]}
          pointerEvents={paneIndex === 1 ? 'auto' : 'none'}
        >
          <SettingsPage onBack={() => goToPane(0)} />
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
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
  },

  root: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },

  // Message takes all remaining space between header and the fixed-height
  // gallery row. Inside Message the description is wrapped in a ScrollView
  // so when it doesn't fit, only the desc scrolls — the icon, title, and
  // the gallery's vertical position stay put.
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 48,
  },

  // Fixed height — keeps the gallery anchored at the same Y in every state
  // regardless of how long the message above it ends up being.
  gallery: {
    height: GALLERY_HEIGHT,
    justifyContent: 'center',
    marginVertical: 24,
  },

  buttons: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
})
