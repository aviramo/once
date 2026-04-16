import { useState, useEffect } from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { t } from '../src/i18n'
import { PrimaryButton } from '../src/components/Button'
import { SyncWishLogo } from '../src/components/SyncWishLogo'

// ── Google Sign-In config ──────────────────────────────────────────────────
// webClientId comes from Google Cloud Console → OAuth 2.0 → Web client
// Replace with your actual Web Client ID from Supabase → Auth → Google provider
GoogleSignin.configure({
  webClientId: '734623738972-62iahq9pjtlv9pl78alf86pn4plsbdj8.apps.googleusercontent.com',
  iosClientId: '734623738972-csljo0jmhcioedopq9o591ni506g5o1q.apps.googleusercontent.com',
  scopes: ['email', 'profile'],
})

// ── Auth ───────────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  console.log('Starting Google Sign-In...')
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  console.log('Play Services OK')
  const userInfo = await GoogleSignin.signIn()
  console.log('Sign-in result:', JSON.stringify(userInfo))
  const idToken = userInfo.data?.idToken
  if (!idToken) throw new Error('No ID token returned')
  console.log('Got ID token, signing in with Supabase...')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
  console.log('Supabase sign-in success')
}

async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })
  if (!credential.identityToken) throw new Error('No identity token returned')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  })
  if (error) throw error
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null)
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user) router.replace('/home')
  }, [user])

  const handleGoogle = async () => {
    setLoadingProvider('google')
    try {
      await signInWithGoogle()
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.error('Google sign-in error:', e)
      }
    } finally {
      setLoadingProvider(null)
    }
  }

  const handleApple = async () => {
    setLoadingProvider('apple')
    try {
      await signInWithApple()
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple sign-in error:', e)
      }
    } finally {
      setLoadingProvider(null)
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.brandName}>SyncWish</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          <View style={styles.logoWrapper}>
            <SyncWishLogo size={128} />
          </View>
        </View>

        {/* ── Message ── */}
        <View style={styles.message}>
          <Text style={styles.messageLine1}>{t('auth.msg1')}</Text>
          <Text style={styles.messageLine2}>{t('auth.msg2')}</Text>
        </View>
      </View>

      {/* ── Auth Buttons — pinned to bottom ── */}
      <View style={styles.bottom}>
        {Platform.OS === 'ios' ? (
          <PrimaryButton
            label={t('auth.signInApple')}
            onPress={handleApple}
            disabled={loadingProvider !== null}
            tone="visible"
          />
        ) : (
          <PrimaryButton
            label={t('auth.signInGoogle')}
            onPress={handleGoogle}
            disabled={loadingProvider !== null}
            tone="visible"
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef0f3',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  logoWrapper: {
    marginTop: 20,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 40,
    fontWeight: '300',
    color: '#111',
    letterSpacing: -0.5,
    fontFamily: 'NotoSans_400Regular',
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.35)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontWeight: '500',
    marginTop: 4,
  },

  // Message
  message: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  messageLine1: {
    fontSize: 18,
    fontWeight: '300',
    color: 'rgba(0,0,0,0.4)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  messageLine2: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // Bottom — matches home.tsx's buttons container so the CTA sits at the
  // same inset on both screens.
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 8,
    backgroundColor: 'transparent',
    gap: 10,
  },
})
