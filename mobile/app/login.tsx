import { useState, useEffect } from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path, G, Circle, Rect } from 'react-native-svg'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { t } from '../src/i18n'
import { Button } from '../src/components/Button'
import { SyncWishLogo } from '../src/components/SyncWishLogo'
import { TEXT, WHITE } from '../src/colors'

// ── Brand icons ────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.5 29.5 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.6-4.7l-6.3-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.7 39.6 16.4 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4-4.2 5.2l6.3 5.2C41.3 35.2 44 30 44 24c0-1.3-.1-2.7-.4-4z" />
    </Svg>
  )
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill={TEXT}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.44c1.32.07 2.24.74 3.01.8.94-.19 1.84-.89 2.9-.95 1.24-.07 2.41.4 3.26 1.3-2.93 1.75-2.21 5.59.54 6.68-.56 1.49-1.3 2.97-1.71 4.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  )
}

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
      <StatusBar style="light" />
      <View style={styles.center}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.brandName}>SyncWish</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          <View style={styles.logoWrapper}>
            <SyncWishLogo size={128} color={WHITE} />
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
          <Button
            label={t('auth.signInApple')}
            onPress={handleApple}
            disabled={loadingProvider !== null}
            variant="secondary"
            iconStart={<AppleIcon />}
          />
        ) : (
          <Button
            label={t('auth.signInGoogle')}
            onPress={handleGoogle}
            disabled={loadingProvider !== null}
            variant="secondary"
            iconStart={<GoogleIcon />}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#6d28d9',
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
    color: WHITE,
    letterSpacing: -0.5,
    fontFamily: 'NotoSans_400Regular',
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
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
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  messageLine2: {
    fontSize: 22,
    fontWeight: '600',
    color: WHITE,
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
