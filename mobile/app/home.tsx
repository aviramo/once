import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Path, Circle } from 'react-native-svg'
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
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  desc: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
  },
})

// ── Primary Button ─────────────────────────────────────────────────────────
// Bottom call-to-action button. The home screen shows 0-N of these depending
// on the user's state.

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [btnStyles.btn, pressed && btnStyles.pressed]}
      onPress={onPress}
    >
      <Text style={btnStyles.text}>{label}</Text>
    </Pressable>
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

  buttons: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
})
