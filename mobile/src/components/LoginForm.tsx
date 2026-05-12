import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, TextInput, I18nManager } from 'react-native'
import { useSharedValue, useAnimatedStyle, withTiming, withRepeat } from 'react-native-reanimated'
import Animated from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { Text } from './AppText'
import { Button } from './Button'
import { t } from '../i18n'
import { FONT_SCALE } from '../fonts'
import { BLACK, WHITE, BLACK_SOFT, BLACK_STRONG, PRIMARY, BLACK_MID, DESTRUCTIVE, BORDER_SOFT, DESTRUCTIVE_MUTED, WHITE_MID } from '../colors'
import { SINGLE, RADIUS, TEXT as FSIZE, WEIGHT, DURATION, EASE, INPUT_MIN_HEIGHT, BUTTON_MIN_HEIGHT } from '../tokens'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    rotation.value = withRepeat(withTiming(360, { duration: DURATION.rotate, easing: EASE.linear }), -1, false)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  const arc = dark ? BLACK : WHITE
  const track = dark ? BLACK_MID : WHITE_MID
  return (
    <Animated.View style={[{ width: 20, height: 20 }, animStyle]}>
      <Svg width={20} height={20} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke={track} strokeWidth={2.5} fill="none" />
        <Path d="M 11 3 A 8 8 0 0 1 19 11" stroke={arc} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  )
}

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
      <Text
        style={gBtnStyles.label}
        numberOfLines={2}
        maxFontSizeMultiplier={FONT_SCALE.ui}
      >
        {t('auth.continueGoogle')}
      </Text>
    </Pressable>
  )
}

const gBtnStyles = StyleSheet.create({
  btn: {
    minHeight: BUTTON_MIN_HEIGHT,
    paddingVertical: SINGLE,
    paddingHorizontal: BUTTON_MIN_HEIGHT,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: BORDER_SOFT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: BLACK_SOFT },
  dim: { opacity: 0.55 },
  iconSlot: { position: 'absolute', start: 20, top: 0, bottom: 0, justifyContent: 'center' },
  label: { fontSize: FSIZE.subhead, fontWeight: WEIGHT.bold, color: BLACK, letterSpacing: -0.3, textAlign: 'center' },
})

type Provider = 'google' | 'apple' | 'email' | null

export function LoginForm({
  onGoogle,
  onApple,
  onEmail,
  showApple,
}: {
  onGoogle: () => Promise<void>
  onApple: () => Promise<void>
  // Returns true if a link was successfully sent (shows confirmation),
  // false on validation failure or send error (stays in input mode).
  onEmail: (email: string) => Promise<boolean>
  showApple: boolean
}) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState<Provider>(null)

  const canSendEmail = EMAIL_RE.test(email.trim())

  const handleGoogle = async () => {
    if (loading) return
    setLoading('google')
    try { await onGoogle() }
    catch { setLoading(null) }
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

  if (sentTo) {
    return (
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
    )
  }

  return (
    <View style={styles.body}>
      <View style={{ gap: 10 }}>
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
          placeholderTextColor={BLACK_MID}
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
          disabled={(loading !== null && loading !== 'email') || !canSendEmail}
          silentDisabled={loading !== null && loading !== 'email'}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 4,
  },
  title: {
    fontSize: FSIZE.h2,
    fontWeight: WEIGHT.bold,
    color: BLACK,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: 8,
    fontSize: FSIZE.body,
    lineHeight: 22,
    color: BLACK_STRONG,
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
    backgroundColor: BLACK_MID,
  },
  dividerText: {
    fontSize: FSIZE.small,
    color: BLACK_STRONG,
    letterSpacing: 0.2,
  },
  inputWrap: {
    height: INPUT_MIN_HEIGHT,
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: BORDER_SOFT,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  inputWrapError: {
    borderColor: DESTRUCTIVE_MUTED,
  },
  input: {
    fontSize: FSIZE.input,
    color: BLACK,
    padding: 0,
  },
  errorText: {
    marginTop: 8,
    fontSize: FSIZE.small,
    color: DESTRUCTIVE,
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
