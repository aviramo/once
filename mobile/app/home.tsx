import { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { t, tg } from '../src/i18n'

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

function Message({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={messageStyles.wrap}>
      <Text style={messageStyles.title}>{title}</Text>
      <Text style={messageStyles.desc}>{desc}</Text>
    </View>
  )
}

const messageStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  desc: {
    marginTop: 14,
    fontSize: 18,
    lineHeight: 26,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
})

// ── Primary Button ─────────────────────────────────────────────────────────
// Bottom call-to-action button. The home screen shows 0-N of these depending
// on the user's state. Shares the press feedback language with the toggle
// buttons in settings: a quick scale-down followed by a spring-back bump,
// driven natively so it stays smooth even when the JS thread is busy with
// the in-flight invoke that the press kicks off.

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 90,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={({ pressed }) => [btnStyles.btn, pressed && btnStyles.pressed]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        <Text style={btnStyles.text}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

const btnStyles = StyleSheet.create({
  btn: {
    backgroundColor: '#111',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
})

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const { profile, update } = useUserStore()

  const state = profile?.state ?? 'HIDDEN'
  const isMale = profile?.is_male ?? null

  // Visibility toggle — optimistically update the local profile so the UI
  // reacts instantly, then fire the server event. The server response
  // broadcasts the authoritative state back via the user-update channel.
  // Payload shape matches the old web app: { event: 'visibility', state: ... }.
  const setVisibility = (next: 'VISIBLE' | 'HIDDEN') => {
    tap()
    update({ state: next })
    invoke('app', { event: 'visibility', state: next }).catch(console.error)
  }

  // Per-state content — the content block and the button set are chosen
  // together. Additional states will slot in here as they're designed.
  const renderContent = () => {
    switch (state) {
      case 'HIDDEN':
        return <Message title={tg('home.hiddenModeTitle', isMale)} desc={tg('home.hiddenModeDesc', isMale)} />
      case 'VISIBLE':
        return <Message title={tg('home.nowVisible', isMale)} desc={tg('home.nowVisibleDesc', isMale)} />
      default:
        return <Message title={tg('home.hiddenModeTitle', isMale)} desc={tg('home.hiddenModeDesc', isMale)} />
    }
  }

  const renderButtons = () => {
    switch (state) {
      case 'HIDDEN':
        return <PrimaryButton label={t('home.switchToVisible')} onPress={() => setVisibility('VISIBLE')} />
      case 'VISIBLE':
        return <PrimaryButton label={t('home.switchToHidden')} onPress={() => setVisibility('HIDDEN')} />
      default:
        return null
    }
  }

  const buttons = renderButtons()

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.logo}>SyncWish</Text>
        <Pressable
          style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
          onPress={() => { tap(); router.push('/settings') }}
        >
          <SettingsIcon />
        </Pressable>
      </View>

      {/* ── Content (flex:1, centered) ── */}
      <View style={styles.content}>
        <View style={styles.stateIcon}>
          <StateIcon state={state} />
        </View>
        {renderContent()}
      </View>

      {/* ── Buttons (optional; collapses when null) ── */}
      {buttons && <View style={styles.buttons}>{buttons}</View>}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
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

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIcon: {
    marginBottom: 32,
  },

  buttons: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
})
