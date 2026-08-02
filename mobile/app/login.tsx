import { View, StyleSheet, Platform, Linking } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useBottomInset } from '../src/hooks/useBottomInset'
import { PullScrollView } from '../src/components/PullPane'
import { AppStatusBar } from '../src/components/AppStatusBar'
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../src/lib/supabase'
import { t, lang } from '../src/i18n'
import { LoginForm } from '../src/components/LoginForm'
import { PAGE, INK, INK_BODY, INK_HINT } from '../src/colors'
import { XS, SM, MD, TEXT, WEIGHT, lh, bottomGap } from '../src/tokens'
import { getMagicLinkRedirect } from '../src/lib/authRedirect'
import { legalUrl } from '../src/lib/links'

// ── Auth setup (unchanged) ─────────────────────────────────────────────────

GoogleSignin.configure({
  webClientId: '243101157812-7c1prvpn281b88oqnstdjbefecsid8q2.apps.googleusercontent.com',
  iosClientId: '243101157812-39cu77j7o0ukr8vvnl59mshsdelne3he.apps.googleusercontent.com',
})

async function signInWithGoogle(): Promise<boolean> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const response = await GoogleSignin.signIn()
  if (response.type === 'cancelled') return false
  const idToken = response.data.idToken
  if (!idToken) throw new Error('No idToken from Google')
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
  if (error) throw error
  return true
}

async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })
  if (!credential.identityToken) throw new Error('No identity token returned')
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })
  if (error) throw error
}

// The store-review sign-in that stood here is deleted (2026-08-03) — see the
// note in LoginForm.tsx. There are three ways in and all three are the
// platform's own: Google, Apple, and a magic link.

async function sendMagicLink(email: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: getMagicLinkRedirect() },
  })
  if (error) {
    console.error('Magic link send error:', error)
    return false
  }
  return true
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const bottomInset = useBottomInset()

  // Each provider throws on failure / cancellation so the form can clear
  // its in-flight state. On success, the auth state change causes
  // _layout.tsx to navigate away and unmount this screen.

  const handleGoogle = async () => {
    const signedIn = await signInWithGoogle()
    if (!signedIn) throw new Error('cancelled')
  }

  const handleApple = async () => {
    try { await signInWithApple() }
    catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') console.error('Apple sign-in error:', e)
      throw e
    }
  }

  const handleEmail = async (email: string) => sendMagicLink(email)

  return (
    <View style={styles.root}>
      {/* The shared purple band with white glyphs, as on every other screen. */}
      <AppStatusBar />
      <SafeAreaView style={styles.content} edges={['top', 'left', 'right']}>
        <View style={styles.flex}>
          <PullScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <Text style={styles.brandName}>Once</Text>
              <Text style={styles.brandSlogan}>{lang === 'en' ? 'Just one. now!' : 'רק אחד. עכשיו!'}</Text>
            </View>

            <View style={styles.form}>
              <LoginForm
                onGoogle={handleGoogle}
                onApple={handleApple}
                onEmail={handleEmail}
                showApple={Platform.OS === 'ios'}
              />
            </View>
          </PullScrollView>

          <View style={[styles.bottom, { paddingBottom: bottomGap(bottomInset, MD + XS) }]}>
            <Text style={styles.legalText}>
              {t('auth.legalPrefix')}{'\n'}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(legalUrl('terms', lang))} accessibilityRole="link">
                {t('auth.legalConnTerms')}{t('auth.legalTerms')}
              </Text>
              {t('auth.legalSep')}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(legalUrl('privacy', lang))} accessibilityRole="link">
                {t('auth.legalConnPrivacy')}{t('auth.legalPrivacy')}
              </Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE,
  },
  content: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollBody: {
    flexGrow: 1,
    paddingHorizontal: SM + 4,
  },

  // ── Brand ──────────────────────────────────────────────────────────────
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: TEXT.xxl,
    fontWeight: WEIGHT.medium,
    color: INK,
    letterSpacing: -1.4,
  },
  brandSlogan: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.medium,
    color: INK_BODY,
    letterSpacing: -0.2,
    marginTop: XS,
  },

  // ── Form ───────────────────────────────────────────────────────────────
  form: {
    paddingBottom: MD,
  },

  // ── Bottom ─────────────────────────────────────────────────────────────
  bottom: {
    paddingHorizontal: SM + XS,
    paddingTop: MD,
    gap: SM,
  },
  legalText: {
    fontSize: TEXT.md,
    color: INK_HINT,
    textAlign: 'center',
  },
  legalLink: {
    textDecorationLine: 'underline',
    color: INK,
  },
})
