import { useEffect, useState } from 'react'
import { View, StyleSheet, Platform, I18nManager, Linking, ScrollView, Keyboard } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../src/lib/supabase'
import { t, lang } from '../src/i18n'
import { LoginForm } from '../src/components/LoginForm'
import { BLACK, BLACK_MID, BLACK_STRONG, WHITE } from '../src/colors'
import { SINGLE } from '../src/tokens'
import { getMagicLinkRedirect } from '../src/lib/authRedirect'

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

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

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
                showApple={Platform.OS === 'ios'}
              />
            </View>
          </ScrollView>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
            <Text style={styles.legalText}>
              {t('auth.legalPrefix')}{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(`https://aviramo.github.io/once-app/terms?lang=${lang}`)} accessibilityRole="link">
                {t('auth.legalTerms')}
              </Text>
              {' '}{I18nManager.isRTL ? 'ו' : '&'}{' '}
              <Text style={styles.legalLink} onPress={() => Linking.openURL(`https://aviramo.github.io/once-app/privacy?lang=${lang}`)} accessibilityRole="link">
                {t('auth.legalPrivacy')}
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
    backgroundColor: WHITE,
  },
  content: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollBody: {
    flexGrow: 1,
    paddingHorizontal: SINGLE + 4,
  },

  // ── Brand ──────────────────────────────────────────────────────────────
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 56,
    fontWeight: '800',
    color: BLACK,
    letterSpacing: -1.4,
  },
  brandSlogan: {
    fontSize: 18,
    fontWeight: '500',
    color: BLACK_STRONG,
    letterSpacing: -0.2,
    marginTop: 4,
  },

  // ── Form ───────────────────────────────────────────────────────────────
  form: {
    paddingBottom: 16,
  },

  // ── Bottom ─────────────────────────────────────────────────────────────
  bottom: {
    paddingHorizontal: SINGLE + 4,
    paddingTop: 12,
    gap: 10,
  },
  legalText: {
    fontSize: 12,
    color: BLACK_MID,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: 'underline',
    color: BLACK_STRONG,
  },
})
