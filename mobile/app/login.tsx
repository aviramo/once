import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, Platform, Pressable, I18nManager,
  Linking, FlatList, Image, useWindowDimensions, Animated as RNAnimated,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native'
import { Text } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path, Circle } from 'react-native-svg'
import ReAnimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../src/lib/supabase'
import { t, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { OnceLogo } from '../src/components/OnceLogo'
import { TEXT_PRIMARY, WHITE, PRIMARY, PRIMARY_PRESS, GRAY_50 } from '../src/colors'
import { SINGLE } from '../src/fonts'

// ── Constants ──────────────────────────────────────────────────────────────

const SLIDE_COUNT = 9
const AUTOPLAY_MS = 6000

const CAROUSEL_DATA = [...Array(SLIDE_COUNT).keys()] as number[]

const SLIDE_IMAGES = [
  require('../assets/photos/1.jpg'),
  require('../assets/photos/2.jpg'),
  require('../assets/photos/3.jpg'),
  require('../assets/photos/4.jpg'),
  require('../assets/photos/5.jpg'),
  require('../assets/photos/6.jpg'),
  require('../assets/photos/7.jpg'),
  require('../assets/photos/8.jpg'),
  require('../assets/photos/9.jpg'),
]

type SlideLocale = { title: string; subtitle: string }
type Slide = { he: SlideLocale; en: SlideLocale }

const SLIDES: Slide[] = [
  {
    he: { title: 'כשיש חיבור,\nזה רק אתם', subtitle: 'מפגש אחד מקבל את כל המקום. בלי רעש, בלי הסחות.' },
    en: { title: 'When it clicks,\nit\'s just you', subtitle: 'One connection gets the whole space. No noise, no distractions.' },
  },
  {
    he: { title: 'יותר מדי אנשים.\nפחות מדי נוכחות', subtitle: 'כשכולם פתוחים במקביל, קשה להרגיש משהו אמיתי.' },
    en: { title: 'Too many people.\nToo little presence', subtitle: 'When everything is open at once, it\'s hard to feel something real.' },
  },
  {
    he: { title: 'חיבור אמיתי\nמתחיל בפוקוס', subtitle: 'אדם אחד. קשב אחד.' },
    en: { title: 'Real connection\nstarts with focus', subtitle: 'One person. One clear attention.' },
  },
  {
    he: { title: 'שולחים\nהזמנה אחת', subtitle: 'בכל רגע אפשר לבחור אדם אחד ולהושיט יד.' },
    en: { title: 'Send\none invitation', subtitle: 'At any moment, choose one person and reach out.' },
  },
  {
    he: { title: 'או מקבלים\nהזמנה אחת', subtitle: 'רגע אחד קטן שמבקש תשובה אמיתית.' },
    en: { title: 'Or receive\none invitation', subtitle: 'One small moment asking for a real answer.' },
  },
  {
    he: { title: 'כשיש חיבור,\nנפתח צ׳אט אחד', subtitle: 'מרגע שנכנסים, השיחה היא רק שלכם.' },
    en: { title: 'When there\'s a match,\none chat opens', subtitle: 'Once you enter, the conversation is only yours.' },
  },
  {
    he: { title: 'בועה\nלשניים', subtitle: 'אף אחד אחר לא בפנים. רק אתם והמפגש.' },
    en: { title: 'A bubble\nfor two', subtitle: 'No one else inside. Just you and the moment.' },
  },
  {
    he: { title: 'בלייב.\nבזמן אמת', subtitle: 'לא אחר כך. מה שקורה, קורה עכשיו.' },
    en: { title: 'Live.\nIn real time', subtitle: 'Not later. What happens, happens now.' },
  },
  {
    he: { title: 'כאן מתחיל\nמשהו אמיתי', subtitle: 'פחות רעש. יותר נוכחות. מפגש אחד בזמן אמת.' },
    en: { title: 'Something real\nstarts here', subtitle: 'Less noise. More presence. One connection in real time.' },
  },
]

// ── Auth setup (unchanged) ─────────────────────────────────────────────────

GoogleSignin.configure({
  webClientId: '243101157812-7c1prvpn281b88oqnstdjbefecsid8q2.apps.googleusercontent.com',
  iosClientId: '243101157812-39cu77j7o0ukr8vvnl59mshsdelne3he.apps.googleusercontent.com',
})

async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const response = await GoogleSignin.signIn()
  if (response.type === 'cancelled') return
  const idToken = response.data.idToken
  if (!idToken) throw new Error('No idToken from Google')
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
  if (error) throw error
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

// ── Icons ──────────────────────────────────────────────────────────────────

function GoogleColoredIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  )
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill={WHITE} d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.44c1.32.07 2.24.74 3.01.8.94-.19 1.84-.89 2.9-.95 1.24-.07 2.41.4 3.26 1.3-2.93 1.75-2.21 5.59.54 6.68-.56 1.49-1.3 2.97-1.71 4.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

function LoginSpinner({ dark = false }: { dark?: boolean }) {
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  const arc = dark ? TEXT_PRIMARY : WHITE
  const track = dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'
  return (
    <ReAnimated.View style={[{ width: 20, height: 20 }, animStyle]}>
      <Svg width={20} height={20} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke={track} strokeWidth={2.5} fill="none" />
        <Path d="M 11 3 A 8 8 0 0 1 19 11" stroke={arc} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </Svg>
    </ReAnimated.View>
  )
}

// ── Google button ──────────────────────────────────────────────────────────

function GoogleButton({ onPress, loading, disabled }: { onPress: () => void; loading: boolean; disabled: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [gBtnStyles.btn, pressed && gBtnStyles.pressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={t('auth.continueGoogle')}
      accessibilityRole="button"
    >
      <View style={gBtnStyles.iconSlot} pointerEvents="none">
        {loading ? <LoginSpinner dark /> : <GoogleColoredIcon />}
      </View>
      <Text style={gBtnStyles.label}>{t('auth.continueGoogle')}</Text>
    </Pressable>
  )
}

const gBtnStyles = StyleSheet.create({
  btn: {
    height: 56,
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2DADA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: GRAY_50 },
  iconSlot: { position: 'absolute', start: 20, top: 0, bottom: 0, justifyContent: 'center' },
  label: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 },
})

// ── Carousel card ──────────────────────────────────────────────────────────

function CarouselCard({ slideIndex, cardWidth, cardHeight }: {
  slideIndex: number
  cardWidth: number
  cardHeight: number
}) {
  const locale = lang === 'en' ? 'en' : 'he'
  const { title, subtitle } = SLIDES[slideIndex][locale]

  return (
    <View style={[cardStyles.card, { width: cardWidth, height: cardHeight }]}>
      <Image
        source={SLIDE_IMAGES[slideIndex]}
        style={{ position: 'absolute', top: 0, left: 0, width: cardWidth, height: cardHeight }}
        resizeMode="cover"
      />
      <View style={cardStyles.textOverlay}>
        <Text style={cardStyles.title}>{title}</Text>
        <Text style={cardStyles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  textOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 64,
    paddingHorizontal: 26,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#2A211D',
    marginBottom: 18,
    maxWidth: '82%',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
    color: 'rgba(42,33,29,0.72)',
    maxWidth: '84%',
  },
})

// ── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ scrollAnim, step, slideCount, width }: {
  scrollAnim: RNAnimated.Value
  step: number
  slideCount: number
  width: number
}) {
  const minFill = width / slideCount
  const fillWidth = scrollAnim.interpolate({
    inputRange: [0, (slideCount - 1) * step],
    outputRange: I18nManager.isRTL ? [width, minFill] : [minFill, width],
    extrapolate: 'clamp',
  })
  return (
    <View style={pbStyles.container}>
      <View style={[pbStyles.track, { width }]}>
        <RNAnimated.View style={[pbStyles.fill, { width: fillWidth }]} />
      </View>
    </View>
  )
}

const PROGRESS_HEIGHT = 31

const pbStyles = StyleSheet.create({
  container: { paddingVertical: 14, alignItems: 'center' },
  track: { height: 3, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 1.5, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, backgroundColor: PRIMARY, borderRadius: 1.5 },
})

// ── Screen ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { width: SW, height: SH } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const CARD_GAP = 12
  const CARD_WIDTH = Math.floor(SW * 0.84)
  const SIDE_INSET = (SW - CARD_WIDTH) / 2
  const STEP = CARD_WIDTH + CARD_GAP

  const [carouselSectionHeight, setCarouselSectionHeight] = useState(0)
  const CARD_HEIGHT = carouselSectionHeight > 0
    ? Math.max(carouselSectionHeight - PROGRESS_HEIGHT, 100)
    : Math.floor(SH * 0.575)

  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null)

  const listRef = useRef<FlatList<number>>(null)
  const activeRef = useRef(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollAnim = useRef(new RNAnimated.Value(0)).current
  const momentumStartedRef = useRef(false)

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  // Ensure carousel starts at slide 0 regardless of RTL scroll initialization
  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false })
    }, 80)
    return () => clearTimeout(t)
  }, [])

  // ── Autoplay ───────────────────────────────────────────────────────────

  function stopAutoplay() {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current)
      autoplayRef.current = null
    }
  }

  function startAutoplay() {
    stopAutoplay()
    autoplayRef.current = setInterval(() => {
      const next = activeRef.current + 1
      if (next >= SLIDE_COUNT) { stopAutoplay(); return }
      listRef.current?.scrollToOffset({ offset: next * STEP, animated: true })
      activeRef.current = next
    }, AUTOPLAY_MS)
  }

  useEffect(() => {
    startAutoplay()
    return stopAutoplay
  }, [STEP])

  // ── Scroll handlers ────────────────────────────────────────────────────

  const resolveIndex = (offsetX: number) => {
    const raw = Math.max(0, Math.min(Math.round(offsetX / STEP), SLIDE_COUNT - 1))
    activeRef.current = I18nManager.isRTL ? SLIDE_COUNT - 1 - raw : raw
  }

  // Any user touch stops autoplay permanently
  const onScrollBeginDrag = () => {
    momentumStartedRef.current = false
    stopAutoplay()
  }
  const onMomentumScrollBegin = () => { momentumStartedRef.current = true }
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    resolveIndex(e.nativeEvent.contentOffset.x)
  }
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!momentumStartedRef.current) resolveIndex(e.nativeEvent.contentOffset.x)
  }

  // ── Auth handlers (unchanged) ──────────────────────────────────────────

  const handleGoogle = async () => {
    setLoadingProvider('google')
    try { await signInWithGoogle() }
    catch (e: any) { console.error('Google sign-in error:', e) }
    finally { setLoadingProvider(null) }
  }

  const handleApple = async () => {
    setLoadingProvider('apple')
    try { await signInWithApple() }
    catch (e: any) { if (e.code !== 'ERR_REQUEST_CANCELED') console.error('Apple sign-in error:', e) }
    finally { setLoadingProvider(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* Brand area — icon always on the left, name to its right */}
      <View style={styles.brand}>
        <View style={styles.logoWrapper}>
          <OnceLogo size={52} />
        </View>
        <Text style={styles.brandName}>Once</Text>
      </View>

      {/* Carousel */}
      <View style={styles.carouselSection} onLayout={e => setCarouselSectionHeight(e.nativeEvent.layout.height)}>
        <FlatList
          ref={listRef}
          data={CAROUSEL_DATA}
          keyExtractor={(_, i) => String(i)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={STEP}
          decelerationRate="fast"
          bounces={false}
          contentContainerStyle={{ paddingHorizontal: SIDE_INSET }}
          ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
          getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index, index })}
          onTouchStart={stopAutoplay}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollEndDrag={onScrollEndDrag}
          onScroll={RNAnimated.event(
            [{ nativeEvent: { contentOffset: { x: scrollAnim } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <CarouselCard
              slideIndex={item}
              cardWidth={CARD_WIDTH}
              cardHeight={CARD_HEIGHT}
            />
          )}
        />
        <ProgressBar scrollAnim={scrollAnim} step={STEP} slideCount={SLIDE_COUNT} width={CARD_WIDTH} />
      </View>

      {/* Bottom — fixed login area */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
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
        <GoogleButton
          onPress={handleGoogle}
          loading={loadingProvider === 'google'}
          disabled={loadingProvider !== null}
        />
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF4EE',
  },

  // ── Brand ──────────────────────────────────────────────────────────────
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 42,
    gap: 12,
    // Always LTR so icon stays on the left in RTL locales
    direction: 'ltr',
  },
  brandName: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
  },
  logoWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },

  // ── Carousel ───────────────────────────────────────────────────────────
  carouselSection: {
    flex: 1,
    justifyContent: 'center',
  },

  // ── Bottom ─────────────────────────────────────────────────────────────
  bottom: {
    paddingHorizontal: SINGLE + 4,
    paddingTop: 28,
    gap: 10,
  },
  legalText: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.38)',
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: 'underline',
    color: 'rgba(0,0,0,0.5)',
  },
})
