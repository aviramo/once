import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { t } from '../src/i18n'
import { PrimaryButton } from '../src/components/Button'

// ── Google Sign-In config ──────────────────────────────────────────────────
// webClientId comes from Google Cloud Console → OAuth 2.0 → Web client
// Replace with your actual Web Client ID from Supabase → Auth → Google provider
GoogleSignin.configure({
  webClientId: '734623738972-62iahq9pjtlv9pl78alf86pn4plsbdj8.apps.googleusercontent.com',
  iosClientId: '734623738972-csljo0jmhcioedopq9o591ni506g5o1q.apps.googleusercontent.com',
  scopes: ['email', 'profile'],
})

// ── Logo ───────────────────────────────────────────────────────────────────

function SyncWishLogo({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 50" fill="none">
      <Path
        fillRule="evenodd"
        d="M18.871 33.044L17.998 44.704C17.936 45.523 18.665 46.087 19.316 45.722C23.929 43.138 38.378 33.648 45.702 12.79C46.038 11.833 45.135 10.97 44.365 11.509C40.039 14.539 30.585 20.801 24.742 21.993C24.742 21.993 28.484 19.395 30.723 15.405C30.943 15.014 30.924 14.514 30.68 14.161L22.513 2.389C22.029 1.691 21.035 1.981 20.861 2.87L18.318 15.807L6.384 26.223C5.786 26.745 5.908 27.8 6.599 28.079L18.871 33.044Z"
        fill="#111111"
      />
      <Path
        fillRule="evenodd"
        d="M39.975 28.448C39.219 29.503 37.591 31.672 36.088 32.997C35.787 33.262 35.828 33.707 36.172 33.923L44.115 38.909C44.593 39.209 45.238 38.853 45.158 38.332C44.788 35.95 43.724 30.982 41.033 28.374C40.732 28.083 40.214 28.114 39.975 28.448Z"
        fill="#111111"
      />
    </Svg>
  )
}

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
          />
        ) : (
          <PrimaryButton
            label={t('auth.signInGoogle')}
            onPress={handleGoogle}
            disabled={loadingProvider !== null}
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
    fontSize: 22,
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
    backgroundColor: 'rgba(250,250,250,0.97)',
    gap: 10,
  },
})
