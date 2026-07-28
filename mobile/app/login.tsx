import { useEffect, useState } from 'react'
import { View, StyleSheet, Platform, Linking, ScrollView, Keyboard } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
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

// Store-review sign-in. The app is passwordless and access-gated by group
// membership, so a reviewer signing up fresh is gated. This fixed
// email + code hits the `review-login` edge function, which mints a one-time
// OTP for a dedicated, pre-approved review account (member of the enabled
// "בדיקה" group). The email is intentionally one a real user would never
// type; the code gate lives server-side.
const REVIEW_EMAIL = 'review@once.app'
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

async function signInWithReview(code: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/review-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ email: REVIEW_EMAIL, code: code.trim() }),
  })
  if (!res.ok) throw new Error('review_failed')
  const { otp } = await res.json()
  if (!otp) throw new Error('review_failed')
  const { error } = await supabase.auth.verifyOtp({ email: REVIEW_EMAIL, token: otp, type: 'email' })
  if (error) throw error
}

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
  const insets = useSafeAreaInsets()
  // RN's KeyboardAvoidingView doesn't cope with Android edge-to-edge here
  // (form sits behind the keyboard on focus). Drive bottom padding manually,
  // matching the pattern used in chat.tsx / onboarding.tsx / settings.tsx.
  const [kbHeight, setKbHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => {
      setKbHeight(Math.max(0, e.endCoordinates.height - insets.bottom))
    })
    const hide = Keyboard.addListener(hideEvent, () => setKbHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [insets.bottom])

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

  const handleReview = async (code: string) => {
    await signInWithReview(code)
  }

  return (
    <View style={styles.root}>
      {/* The shared purple band with white glyphs, as on every other screen. */}
      <AppStatusBar />
      <SafeAreaView style={styles.content} edges={['top', 'left', 'right']}>
        <View style={[styles.flex, { paddingBottom: kbHeight }]}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
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
                onReview={handleReview}
                reviewEmail={REVIEW_EMAIL}
                showApple={Platform.OS === 'ios'}
              />
            </View>
          </ScrollView>

          <View style={[styles.bottom, { paddingBottom: bottomGap(insets.bottom, MD + XS) }]}>
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
    fontWeight: WEIGHT.semibold,
    color: INK,
    letterSpacing: -1.4,
  },
  brandSlogan: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.semibold,
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
    lineHeight: lh(TEXT.md),
  },
  legalLink: {
    textDecorationLine: 'underline',
    color: INK,
  },
})
