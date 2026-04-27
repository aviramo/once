import { useState, useEffect, useRef } from 'react'
import { View, StyleSheet, Platform, Pressable, ScrollView, I18nManager, BackHandler } from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path, Circle } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import PagerView from 'react-native-pager-view'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { t } from '../src/i18n'
import { Button } from '../src/components/Button'
import { LivoLogo } from '../src/components/LivoLogo'
import { TEXT, WHITE, GREEN, GRAY_50, GRAY_100 } from '../src/colors'
import { SINGLE, DOUBLE } from '../src/fonts'

const isRTL = I18nManager.isRTL

// ── Brand icons ────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill={WHITE} d="M43.6 20H24v8h11.3C33.6 33.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z" />
      <Path fill={WHITE} d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.5 29.5 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" />
      <Path fill={WHITE} d="M24 44c5.2 0 9.9-1.8 13.6-4.7l-6.3-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.7 39.6 16.4 44 24 44z" />
      <Path fill={WHITE} d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4-4.2 5.2l6.3 5.2C41.3 35.2 44 30 44 24c0-1.3-.1-2.7-.4-4z" />
    </Svg>
  )
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill={WHITE}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.44c1.32.07 2.24.74 3.01.8.94-.19 1.84-.89 2.9-.95 1.24-.07 2.41.4 3.26 1.3-2.93 1.75-2.21 5.59.54 6.68-.56 1.49-1.3 2.97-1.71 4.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  )
}

function LoginSpinner() {
  const rotation = useSharedValue(0)

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 700, easing: Easing.linear }),
      -1, false,
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  return (
    <Animated.View style={[{ width: 20, height: 20 }, animStyle]}>
      <Svg width={20} height={20} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke="rgba(255,255,255,0.3)" strokeWidth={2.5} fill="none" />
        <Path
          d="M 11 3 A 8 8 0 0 1 19 11"
          stroke={WHITE}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  )
}

// ── Header icons ───────────────────────────────────────────────────────────

function ForwardChevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 15 6 L 9 12 L 15 18' : 'M 9 6 L 15 12 L 9 18'} />
    </Svg>
  )
}

function BackChevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 9 6 L 15 12 L 9 18' : 'M 15 6 L 9 12 L 15 18'} />
    </Svg>
  )
}

// ── Marketing page ─────────────────────────────────────────────────────────

export function WhatsSpecialPage() {
  const features = [
    { title: t('about.feature1.title'), desc: t('about.feature1.desc') },
    { title: t('about.feature2.title'), desc: t('about.feature2.desc') },
    { title: t('about.feature3.title'), desc: t('about.feature3.desc') },
    { title: t('about.feature4.title'), desc: t('about.feature4.desc') },
  ]
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={mktStyles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={mktStyles.hero}>
        <Text style={mktStyles.heroTitle}>{t('about.heroTitle')}</Text>
        <Text style={mktStyles.heroSub}>{t('about.heroSub')}</Text>
      </View>

      {/* Divider */}
      <View style={mktStyles.divider} />

      {/* Features */}
      {features.map((f, i) => (
        <View key={i} style={mktStyles.feature}>
          <Text style={mktStyles.featureLabel}>{f.title}</Text>
          <Text style={mktStyles.featureDesc}>{f.desc}</Text>
          {i < features.length - 1 && <View style={mktStyles.featureDivider} />}
        </View>
      ))}

    </ScrollView>
  )
}

const mktStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
  },
  hero: {
    marginBottom: 32,
    gap: 14,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -1,
    lineHeight: 44,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(0,0,0,0.5)',
    lineHeight: 24,
    textAlign: 'center',
  },
  divider: {
    height: 1.5,
    backgroundColor: GRAY_100,
    marginBottom: 32,
  },
  feature: {
    gap: 10,
  },
  featureLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  featureDesc: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(0,0,0,0.55)',
    lineHeight: 23,
    textAlign: 'center',
  },
  featureDivider: {
    height: 1,
    backgroundColor: GRAY_100,
    marginTop: 22,
    marginBottom: 22,
  },
})

// ── Auth ───────────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'livo://', skipBrowserRedirect: true },
  })
  if (error || !data.url) throw error ?? new Error('No OAuth URL')

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'livo://')
  if (result.type === 'cancel') return
  if (result.type !== 'success') throw new Error('OAuth failed')

  const fragment = result.url.includes('#')
    ? result.url.split('#')[1]
    : result.url.split('?')[1] ?? ''
  const params = new URLSearchParams(fragment)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) throw new Error('Missing tokens in redirect')

  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token })
  if (sessionError) throw sessionError
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

const LOGO_SIZE = 192

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null)
  const [page, setPage] = useState(0)
  const pagerRef = useRef<PagerView>(null)
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user) router.replace('/home')
  }, [user])

  // Android hardware back: go back to login page when on marketing page
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 1) {
        pagerRef.current?.setPage(0)
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [page])

  const handleGoogle = async () => {
    setLoadingProvider('google')
    try {
      await signInWithGoogle()
    } catch (e: any) {
      console.error('Google sign-in error:', e)
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

  const goToMarketing = () => pagerRef.current?.setPage(1)
  const goToLogin = () => pagerRef.current?.setPage(0)

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* ── Pager — headers live inside each page so they slide with content ── */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        scrollEnabled={false}
        onPageSelected={e => setPage(e.nativeEvent.position)}
      >
        {/* Page 0: Login */}
        <View key="login" style={{ flex: 1 }}>
          {/* Header: left-aligned, [<][title] */}
          <View style={[styles.header, styles.headerLeft]}>
            <Pressable
              style={({ pressed }) => [styles.headerTitleBtn, pressed && styles.headerBtnPressed]}
              onPress={goToMarketing}
            >
              <ForwardChevron />
              <Text style={styles.headerTitle}>{t('settings.about')}</Text>
            </Pressable>
          </View>

          {/* Center content: fills space between header and buttons */}
          <View style={styles.logoCenter}>
            <Text style={styles.brandName}>Livo</Text>
            <LivoLogo size={LOGO_SIZE} />
            <View style={styles.taglineBelow}>
              <Text style={styles.messageLine1}>{t('auth.msg1')}</Text>
              <Text style={styles.messageLine2}>{t('auth.msg2')}</Text>
            </View>
          </View>

          {/* Auth buttons */}
          <View style={styles.bottom}>
            {Platform.OS === 'ios' && (
              <Button
                label={t('auth.signInApple')}
                onPress={handleApple}
                disabled={loadingProvider !== null}
                silentDisabled
                variant="dark"
                iconStart={loadingProvider === 'apple' ? <LoginSpinner /> : <AppleIcon />}
              />
            )}
            <Button
              label={t('auth.signInGoogle')}
              onPress={handleGoogle}
              disabled={loadingProvider !== null}
              silentDisabled
              variant="primary"
              iconStart={loadingProvider === 'google' ? <LoginSpinner /> : <GoogleIcon />}
            />
          </View>
        </View>

        {/* Page 1: Marketing */}
        <View key="marketing" style={{ flex: 1 }}>
          {/* Header: right-aligned, [title][>] */}
          <View style={[styles.header, styles.headerRight]}>
            <Pressable
              style={({ pressed }) => [styles.headerTitleBtn, pressed && styles.headerBtnPressed]}
              onPress={goToLogin}
            >
              <Text style={styles.headerTitle}>התחברות</Text>
              <BackChevron />
            </Pressable>
          </View>

          <WhatsSpecialPage />
        </View>
      </PagerView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GRAY_50,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: SINGLE,
    alignItems: 'center',
  },
  // In RTL row: flex-start = RIGHT side, flex-end = LEFT side
  headerRight: { justifyContent: 'flex-start' },
  headerLeft:  { justifyContent: 'flex-end' },
  // row-reverse in RTL flows left→right: first item on LEFT, second on RIGHT
  headerTitleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    lineHeight: 26,
    includeFontPadding: false,
  },
  headerBtnPressed: {
    opacity: 0.45,
  },

  // ── Login page ────────────────────────────────────────────────────────────

  logoCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 40,
    fontWeight: '300',
    color: TEXT,
    letterSpacing: -0.5,
  },
  taglineBelow: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  messageLine1: {
    fontSize: 17,
    fontWeight: '300',
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  messageLine2: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 32,
  },

  bottom: {
    paddingHorizontal: SINGLE,
    paddingBottom: DOUBLE + SINGLE,
    paddingTop: 8,
    gap: 10,
  },
})
