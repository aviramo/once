import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, Platform, Pressable, I18nManager,
  Linking, FlatList, Image as RNImage, useWindowDimensions, Animated as RNAnimated,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { Asset } from 'expo-asset'
import { Text } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path } from 'react-native-svg'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../src/lib/supabase'
import { t, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { LoginSheet } from '../src/components/LoginSheet'
import { TEXT_PRIMARY, PRIMARY } from '../src/colors'
import { SINGLE, RADIUS } from '../src/fonts'
import { getMagicLinkRedirect } from '../src/lib/authRedirect'

// ── Constants ──────────────────────────────────────────────────────────────

const SLIDE_COUNT = 9
const AUTOPLAY_MS = 5000

const CAROUSEL_DATA = [...Array(SLIDE_COUNT).keys()] as number[]

const SLIDE_IMAGES = [
  require('../assets/photos/8.jpg'),
  require('../assets/photos/2.jpg'),
  require('../assets/photos/3.jpg'),
  require('../assets/photos/4.jpg'),
  require('../assets/photos/5.jpg'),
  require('../assets/photos/6.jpg'),
  require('../assets/photos/7.jpg'),
  require('../assets/photos/9.jpg'),
  require('../assets/photos/1.jpg'),
]

// Warm expo-image's cache at module load — without this the FlatList renders
// the white card + text before the bundled JPEG finishes decoding.
Asset.loadAsync(SLIDE_IMAGES)

type SlideLocale = { title: string }
type Slide = { he: SlideLocale; en: SlideLocale }

const SLIDES: Slide[] = [
  {
    he: { title: 'זה קורה כאן ועכשיו' },
    en: { title: 'It happens here and now' },
  },
  {
    he: { title: 'לא צריך לדבר עם כולם' },
    en: { title: 'You do not chat with everyone' },
  },
  {
    he: { title: 'בוחרים אדם אחד שמסקרן' },
    en: { title: 'You choose one person' },
  },
  {
    he: { title: 'שולחים לו הזמנה' },
    en: { title: 'You send them an invite' },
  },
  {
    he: { title: 'הוא מקבל רגע לבחור' },
    en: { title: 'They get a moment to choose' },
  },
  {
    he: { title: 'אם שניכם רוצים זה נפתח' },
    en: { title: 'If you both want it it opens' },
  },
  {
    he: { title: 'ואז יש מקום רק לשניכם' },
    en: { title: 'Then it is just the two of you' },
  },
  {
    he: { title: 'לפעמים מספיק ניצוץ קטן' },
    en: { title: 'Sometimes one spark is enough' },
  },
  {
    he: { title: 'ומשם משהו אמיתי מתחיל' },
    en: { title: 'And something real can begin' },
  },
]

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

// ── Carousel card ──────────────────────────────────────────────────────────

function CarouselCard({ slideIndex, cardWidth, cardHeight }: {
  slideIndex: number
  cardWidth: number
  cardHeight: number
}) {
  const locale = lang === 'en' ? 'en' : 'he'
  const { title } = SLIDES[slideIndex][locale]

  // Cover-mode crop anchored to the bottom: scale to fill the card while
  // keeping aspect ratio, then if the result is taller than the card the
  // overflow gets clipped from the top (not centered as resizeMode="cover" does).
  const src = RNImage.resolveAssetSource(SLIDE_IMAGES[slideIndex])
  const ratio = src && src.width > 0 ? src.height / src.width : 1.5
  let imgW = cardWidth
  let imgH = cardWidth * ratio
  if (imgH < cardHeight) {
    imgH = cardHeight
    imgW = cardHeight / ratio
  }

  return (
    <View style={{ width: cardWidth, height: cardHeight }}>
      <View style={[StyleSheet.absoluteFill, cardStyles.shadowLayer]} />
      <View style={[cardStyles.card, { width: cardWidth, height: cardHeight }]}>
        <Image
          source={SLIDE_IMAGES[slideIndex]}
          contentFit="fill"
          cachePolicy="memory-disk"
          transition={0}
          style={{
            position: 'absolute',
            bottom: 0,
            left: (cardWidth - imgW) / 2,
            width: imgW,
            height: imgH,
          }}
        />
        <View style={cardStyles.textOverlay}>
          <Text style={cardStyles.title}>{title}</Text>
        </View>
      </View>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  shadowLayer: {
    borderRadius: RADIUS,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    borderRadius: RADIUS,
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
})

// ── Progress bar ───────────────────────────────────────────────────────────

const PB_BTN = 28
const PB_GAP = 10

function ProgressBar({ scrollAnim, step, slideCount, width, isPaused, onReset, onTogglePause }: {
  scrollAnim: RNAnimated.Value
  step: number
  slideCount: number
  width: number
  isPaused: boolean
  onReset: () => void
  onTogglePause: () => void
}) {
  const trackWidth = width - 2 * (PB_BTN + PB_GAP)
  const minFill = trackWidth / slideCount
  const fillWidth = scrollAnim.interpolate({
    inputRange: [0, (slideCount - 1) * step],
    outputRange: I18nManager.isRTL ? [trackWidth, minFill] : [minFill, trackWidth],
    extrapolate: 'clamp',
  })
  const ic = 'rgba(0,0,0,0.38)'
  return (
    <View style={[pbStyles.container, { width }]}>
      <Pressable onPress={onReset} hitSlop={10} style={({ pressed }) => [pbStyles.btn, pressed && pbStyles.btnPressed]}>
        <Svg width={17} height={17} viewBox="0 0 24 24" style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}>
          <Path d="M4 3h3v18H4zM21 3L8 12l13 9z" fill={ic} />
        </Svg>
      </Pressable>

      <View style={[pbStyles.track, { width: trackWidth }]}>
        <RNAnimated.View style={[pbStyles.fill, { width: fillWidth }]} />
      </View>

      <Pressable onPress={onTogglePause} hitSlop={10} style={({ pressed }) => [pbStyles.btn, pressed && pbStyles.btnPressed]}>
        {isPaused ? (
          <Svg width={17} height={17} viewBox="0 0 24 24">
            <Path d="M5 3l14 9-14 9V3z" fill={ic} />
          </Svg>
        ) : (
          <Svg width={17} height={17} viewBox="0 0 24 24">
            <Path d="M6 4h4v16H6zM14 4h4v16h-4z" fill={ic} />
          </Svg>
        )}
      </Pressable>
    </View>
  )
}

const PROGRESS_HEIGHT = 46
const SHADOW_PAD = 18

const pbStyles = StyleSheet.create({
  container: { height: PROGRESS_HEIGHT, flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: PB_GAP },
  track: { height: 5, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, backgroundColor: PRIMARY, borderRadius: 3 },
  btn: { width: PB_BTN, height: PB_BTN, alignItems: 'center', justifyContent: 'center', borderRadius: PB_BTN / 2 },
  btnPressed: { backgroundColor: 'rgba(0,0,0,0.07)' },
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
    ? Math.max(carouselSectionHeight - PROGRESS_HEIGHT - SHADOW_PAD * 2, 100)
    : Math.floor(SH * 0.575)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  const listRef = useRef<FlatList<number>>(null)
  const activeRef = useRef(0)
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollAnim = useRef(new RNAnimated.Value(0)).current
  const momentumStartedRef = useRef(false)

  // Ensure carousel starts at slide 0 regardless of RTL scroll initialization
  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false })
    }, 80)
    return () => clearTimeout(t)
  }, [])

  // ── Autoplay ───────────────────────────────────────────────────────────

  function stopAutoplay(pause = false) {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current)
      autoplayRef.current = null
    }
    if (pause) setIsPaused(true)
  }

  function startAutoplay() {
    stopAutoplay()
    setIsPaused(false)
    autoplayRef.current = setInterval(() => {
      const next = activeRef.current + 1
      if (next >= SLIDE_COUNT) { stopAutoplay(true); return }
      listRef.current?.scrollToOffset({ offset: next * STEP, animated: true })
      activeRef.current = next
    }, AUTOPLAY_MS)
  }

  useEffect(() => {
    startAutoplay()
    return () => stopAutoplay()
  }, [STEP])

  // ── Carousel controls ──────────────────────────────────────────────────

  const handleReset = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
    activeRef.current = 0
    startAutoplay()
  }

  const handleTogglePause = () => {
    if (isPaused) startAutoplay()
    else stopAutoplay(true)
  }

  // ── Scroll handlers ────────────────────────────────────────────────────

  const resolveIndex = (offsetX: number) => {
    const raw = Math.max(0, Math.min(Math.round(offsetX / STEP), SLIDE_COUNT - 1))
    activeRef.current = I18nManager.isRTL ? SLIDE_COUNT - 1 - raw : raw
  }

  const onScrollBeginDrag = () => {
    momentumStartedRef.current = false
    stopAutoplay(true)
  }
  const onMomentumScrollBegin = () => { momentumStartedRef.current = true }
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    resolveIndex(e.nativeEvent.contentOffset.x)
  }
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!momentumStartedRef.current) resolveIndex(e.nativeEvent.contentOffset.x)
  }

  // ── Auth handlers ──────────────────────────────────────────────────────
  // Each provider throws on failure / cancellation so the sheet can clear
  // its in-flight state. On success, the auth state change causes
  // _layout.tsx to navigate away and unmount this screen, so we don't need
  // to manually close the sheet.

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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* Brand area — name centered on screen. */}
      <View style={styles.brand}>
        <Text style={styles.brandName}>Once</Text>
        <Text style={styles.brandSlogan}>{lang === 'en' ? 'Just one. now!' : 'רק אחד. עכשיו!'}</Text>
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
          style={{ overflow: 'visible' }}
          contentContainerStyle={{ paddingHorizontal: SIDE_INSET, paddingVertical: SHADOW_PAD }}
          ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
          getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index, index })}
          onTouchStart={() => stopAutoplay(true)}
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
        <ProgressBar
          scrollAnim={scrollAnim}
          step={STEP}
          slideCount={SLIDE_COUNT}
          width={CARD_WIDTH}
          isPaused={isPaused}
          onReset={handleReset}
          onTogglePause={handleTogglePause}
        />
      </View>

      {/* Bottom — fixed login area */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
        <Button
          label={t('auth.startOneStep')}
          onPress={() => setSheetOpen(true)}
          variant="primary"
          size="lg"
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

      <LoginSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGoogle={handleGoogle}
        onApple={handleApple}
        onEmail={handleEmail}
        showApple={Platform.OS === 'ios'}
      />
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 4,
  },
  brandName: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
  },
  brandSlogan: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.55)',
    letterSpacing: -0.2,
    marginTop: 1,
  },

  // ── Carousel ───────────────────────────────────────────────────────────
  carouselSection: {
    flex: 1,
    justifyContent: 'center',
    overflow: 'visible',
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
