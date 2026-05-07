import { useEffect, useState } from 'react'
import {
  Modal, Pressable, StyleSheet, View, TextInput, Platform,
  Keyboard, KeyboardAvoidingView, I18nManager,
} from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS,
  withRepeat,
} from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { Text } from './AppText'
import { Button } from './Button'
import { t } from '../i18n'
import {
  TEXT_PRIMARY, WHITE, BLACK, GRAY_50, GRAY_100, GRAY_400, PRIMARY,
} from '../colors'
import { SINGLE, RADIUS } from '../fonts'

const SWIPE_DISMISS_THRESHOLD = 80

// ── Email validation ─────────────────────────────────────────────────────
// Permissive regex — server-side rejection is the real gate. We just want
// to catch obvious typos before sending the network request.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Icons ────────────────────────────────────────────────────────────────

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

function MailIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6h16v12H4z" />
      <Path d="M4 7l8 6 8-6" />
    </Svg>
  )
}

function Spinner({ dark = false }: { dark?: boolean }) {
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  const arc = dark ? TEXT_PRIMARY : WHITE
  const track = dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'
  return (
    <Animated.View style={[{ width: 20, height: 20 }, animStyle]}>
      <Svg width={20} height={20} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke={track} strokeWidth={2.5} fill="none" />
        <Path d="M 11 3 A 8 8 0 0 1 19 11" stroke={arc} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  )
}

// ── Google button (light fill, colored G) ────────────────────────────────

function GoogleButton({ onPress, loading, disabled }: { onPress: () => void; loading: boolean; disabled: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [gBtnStyles.btn, pressed && gBtnStyles.pressed, disabled && gBtnStyles.dim]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={t('auth.continueGoogle')}
      accessibilityRole="button"
    >
      <View style={gBtnStyles.iconSlot} pointerEvents="none">
        {loading ? <Spinner dark /> : <GoogleColoredIcon />}
      </View>
      <Text style={gBtnStyles.label}>{t('auth.continueGoogle')}</Text>
    </Pressable>
  )
}

const gBtnStyles = StyleSheet.create({
  btn: {
    height: 56,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: '#E2DADA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: GRAY_50 },
  dim: { opacity: 0.55 },
  iconSlot: { position: 'absolute', start: 20, top: 0, bottom: 0, justifyContent: 'center' },
  label: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 },
})

// ── Sheet ────────────────────────────────────────────────────────────────

type Provider = 'google' | 'apple' | 'email' | null

export function LoginSheet({
  visible,
  onClose,
  onGoogle,
  onApple,
  onEmail,
  showApple,
}: {
  visible: boolean
  onClose: () => void
  onGoogle: () => Promise<void>
  onApple: () => Promise<void>
  // Returns true if a link was successfully sent (sheet shows confirmation),
  // false on validation failure or send error (sheet stays in input mode).
  onEmail: (email: string) => Promise<boolean>
  showApple: boolean
}) {
  const translateY = useSharedValue(800)
  const dragY = useSharedValue(0)
  const cardHeight = useSharedValue(800)
  const [modalVisible, setModalVisible] = useState(false)

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState<Provider>(null)
  // Same pattern as BioEditPopup: iOS uses KeyboardAvoidingView (padding),
  // Android lifts the sheet manually by the measured keyboard height since
  // softInput resize is unreliable inside a Modal.
  const [kbHeight, setKbHeight] = useState(0)

  // Reset transient state when sheet closes.
  useEffect(() => {
    if (!visible) {
      // Wait for the close animation before clearing so the user doesn't
      // see fields blink during the slide-down.
      const t = setTimeout(() => {
        setEmail('')
        setEmailError(null)
        setSentTo(null)
        setLoading(null)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [visible])

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
      })
    } else {
      Keyboard.dismiss()
      translateY.value = withTiming(cardHeight.value, { duration: 250, easing: Easing.in(Easing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  // Track keyboard height so the sheet can lift above it. iOS uses the
  // *Will* events for a smoother handoff with the keyboard's own animation;
  // Android exposes only the *Did* events.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  const dismiss = () => {
    if (loading) return
    onClose()
  }

  const pan = Gesture.Pan()
    .enabled(!loading)
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate(e => {
      'worklet'
      dragY.value = Math.max(0, e.translationY)
    })
    .onEnd(e => {
      'worklet'
      if (e.translationY > SWIPE_DISMISS_THRESHOLD || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 250, easing: Easing.in(Easing.cubic) })
        runOnJS(dismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const handleGoogle = async () => {
    if (loading) return
    setLoading('google')
    try { await onGoogle() }
    catch { setLoading(null) }
    // On success: parent unmounts the sheet by closing it. Keep spinner.
  }

  const handleApple = async () => {
    if (loading) return
    setLoading('apple')
    try { await onApple() }
    catch { setLoading(null) }
  }

  const handleEmail = async () => {
    if (loading) return
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(t('auth.invalidEmail'))
      return
    }
    setEmailError(null)
    setLoading('email')
    try {
      const ok = await onEmail(trimmed)
      if (ok) setSentTo(trimmed)
      else setEmailError(t('auth.linkError'))
    } catch {
      setEmailError(t('auth.linkError'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.rootView}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
          />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.cardWrap,
                // Android doesn't get reliable softInput resize inside a Modal,
                // so we lift the sheet manually by the measured keyboard height.
                Platform.OS !== 'ios' && { marginBottom: kbHeight },
                animStyle,
              ]}
              onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
            >
                <View style={styles.shadowGradient} pointerEvents="none">
                  {[0.005,0.01,0.012,0.015,0.018,0.02,0.022,0.025,0.028,0.03,0.032,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.075].map((o, i) => (
                    <View key={i} style={[styles.shadowLayer, { opacity: o }]} />
                  ))}
                </View>
                <View style={[
                  styles.card,
                  // Add a small breathing-room gap above the keyboard so the
                  // Send button doesn't sit flush against the keyboard top.
                  kbHeight > 0 && { paddingBottom: SINGLE * 4 },
                ]}>
                  <View style={styles.dragHandle} />

                  {sentTo ? (
                    // ── Confirmation panel ──
                    <View style={styles.body}>
                      <View style={styles.successCircle}>
                        <MailIcon />
                      </View>
                      <Text style={styles.title}>{t('auth.linkSent')}</Text>
                      <Text style={styles.desc}>
                        {t('auth.linkSentDesc').replace('{email}', sentTo)}
                      </Text>
                      <View style={{ marginTop: 20 }}>
                        <Button
                          label={t('auth.linkResend')}
                          variant="secondary"
                          size="lg"
                          onPress={() => { setSentTo(null); setEmail(sentTo) }}
                        />
                      </View>
                    </View>
                  ) : (
                    // ── Provider + email panel ──
                    <View style={styles.body}>
                      <Text style={styles.title}>{t('auth.sheetTitle')}</Text>
                      <Text style={styles.sub}>{t('auth.sheetSub')}</Text>

                      <View style={{ marginTop: 22, gap: 10 }}>
                        <GoogleButton
                          onPress={handleGoogle}
                          loading={loading === 'google'}
                          disabled={loading !== null && loading !== 'google'}
                        />
                        {showApple && (
                          <Button
                            label={t('auth.signInApple')}
                            onPress={handleApple}
                            disabled={loading !== null && loading !== 'apple'}
                            silentDisabled
                            variant="dark"
                            iconStart={loading === 'apple' ? <Spinner /> : <AppleIcon />}
                          />
                        )}
                      </View>

                      <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>{t('auth.orDivider')}</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <View style={[styles.inputWrap, emailError && styles.inputWrapError]}>
                        <TextInput
                          style={[
                            styles.input,
                            { textAlign: I18nManager.isRTL ? 'right' : 'left' },
                          ]}
                          value={email}
                          onChangeText={txt => { setEmail(txt); if (emailError) setEmailError(null) }}
                          placeholder={t('auth.emailPlaceholder')}
                          placeholderTextColor="rgba(0,0,0,0.35)"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="email"
                          textContentType="emailAddress"
                          editable={!loading}
                          returnKeyType="send"
                          onSubmitEditing={handleEmail}
                        />
                      </View>
                      {emailError ? (
                        <Text style={styles.errorText}>{emailError}</Text>
                      ) : null}

                      <View style={{ marginTop: 12 }}>
                        <Button
                          label={t('auth.sendLink')}
                          onPress={handleEmail}
                          variant="primary"
                          size="lg"
                          loading={loading === 'email'}
                          disabled={loading !== null && loading !== 'email'}
                          silentDisabled={loading !== 'email'}
                        />
                      </View>
                    </View>
                  )}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  rootView: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  shadowGradient: { height: 60, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  cardWrap: {},
  card: {
    backgroundColor: WHITE,
    paddingHorizontal: SINGLE + 4,
    paddingTop: 12,
    paddingBottom: 28,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: GRAY_100,
    marginBottom: 18,
  },
  body: {
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: GRAY_400,
    textAlign: 'center',
  },
  desc: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: GRAY_400,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  dividerText: {
    fontSize: 13,
    color: GRAY_400,
    letterSpacing: 0.2,
  },
  inputWrap: {
    height: 56,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: '#E2DADA',
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  inputWrapError: {
    borderColor: 'rgba(217,107,107,0.7)',
  },
  input: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    padding: 0,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#C85A5A',
    textAlign: 'center',
  },
  successCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
})
