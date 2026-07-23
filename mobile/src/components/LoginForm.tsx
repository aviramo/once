import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing } from 'react-native-reanimated'
import Animated from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { t } from '../i18n'
import { FONT_SCALE } from '../fonts'
import { BLACK_STRONG, INK, INK_2, INK_3, SURFACE, BLACK, WHITE, BLACK_MID, BLACK_SOFT, BORDER_SOFT, NEGATIVE, WHITE_MID } from '../colors'
import { FIELD_SKIN } from '../field'
import { XS, SM, MD, RADIUS, ICON, ICON_CIRCLE_SIZE, TEXT as FSIZE, WEIGHT, INPUT_MIN_HEIGHT, BUTTON_MIN_HEIGHT, STROKE, MOTION, lh } from '../tokens'

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

function AppleIcon({ color = BLACK }: { color?: string } = {}) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill={color} d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.44c1.32.07 2.24.74 3.01.8.94-.19 1.84-.89 2.9-.95 1.24-.07 2.41.4 3.26 1.3-2.93 1.75-2.21 5.59.54 6.68-.56 1.49-1.3 2.97-1.71 4.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

// Raw <Svg>, not a Glyph: it never followed the OS font scale, which is what
// a fixed-dp badge needs anyway (see ICON_CIRCLE_SIZE in tokens.ts).
function MailIcon({ color = WHITE, size = 20 }: { color?: string; size?: number } = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6h16v12H4z" />
      <Path d="M4 7l8 6 8-6" />
    </Svg>
  )
}

function Spinner({ dark = false }: { dark?: boolean }) {
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: MOTION.spin, easing: Easing.linear }), -1, false)
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

// One shared SSO button for every identity provider (Google, Apple, …). Both
// providers render through this so they are byte-identical in layout: white
// surface, label optically centred in the full width, the provider glyph
// pinned to the start edge. Callers pass only the glyph + label + handlers —
// no per-provider styling, so the two buttons can never drift (and an Apple
// button can never end up dark-on-dark again).
function ProviderButton({ icon, label, onPress, loading, disabled }: {
  icon: ReactNode
  label: string
  onPress: () => void
  loading: boolean
  disabled: boolean
}) {
  return (
    <Pressable
      style={ssoBtnStyles.btn}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View style={ssoBtnStyles.iconSlot} pointerEvents="none">
        {loading ? <Spinner dark /> : icon}
      </View>
      <Text
        style={ssoBtnStyles.label}
        numberOfLines={2}
        maxFontSizeMultiplier={FONT_SCALE.ui}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const ssoBtnStyles = StyleSheet.create({
  btn: {
    minHeight: BUTTON_MIN_HEIGHT,
    paddingVertical: SM,
    paddingHorizontal: BUTTON_MIN_HEIGHT,
    backgroundColor: SURFACE,
    borderRadius: RADIUS,
    borderWidth: STROKE.thin,
    borderColor: BORDER_SOFT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: { position: 'absolute', start: 20, top: 0, bottom: 0, justifyContent: 'center' },
  label: { fontSize: FSIZE.lg, fontWeight: WEIGHT.extrabold, color: BLACK, letterSpacing: -0.3, textAlign: 'center' },
})

type Provider = 'google' | 'apple' | 'email' | 'review' | null

export function LoginForm({
  onGoogle,
  onApple,
  onEmail,
  onReview,
  reviewEmail,
  showApple,
}: {
  onGoogle: () => Promise<void>
  onApple: () => Promise<void>
  // Returns true if a link was successfully sent (shows confirmation),
  // false on validation failure or send error (stays in input mode).
  onEmail: (email: string) => Promise<boolean>
  // Store-review sign-in: a fixed email reveals a code field that signs the
  // reviewer into the pre-approved review account (no magic link).
  onReview: (code: string) => Promise<void>
  reviewEmail: string
  showApple: boolean
}) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState<Provider>(null)
  const [reviewCode, setReviewCode] = useState('')

  const canSendEmail = EMAIL_RE.test(email.trim())
  // A real user would never type this address; when present, the email flow
  // becomes the code-gated review login instead of sending a magic link.
  const isReviewEmail = email.trim().toLowerCase() === reviewEmail.toLowerCase()

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

  const handleReview = async () => {
    if (loading) return
    const code = reviewCode.trim()
    if (!code) return
    setLoading('review')
    try {
      await onReview(code)
      // success → auth state change unmounts this screen
    } catch {
      setEmailError(t('auth.linkError'))
      setLoading(null)
    }
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
          <MailIcon color={INK} size={ICON.circle} />
        </View>
        <Text style={styles.title}>{t('auth.linkSent')}</Text>
        <Text style={styles.desc}>
          {t('auth.linkSentDesc').replace('{email}', sentTo)}
        </Text>
        <View style={{ marginTop: MD }}>
          <Button
            label={t('auth.linkResend')}
            variant="secondary"
            size="lg"
            onPress={() => { setSentTo(null); setEmail(sentTo) }}
            iconStart={<MailIcon color={BLACK_STRONG} />}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.body}>
      <View style={{ gap: SM }}>
        <ProviderButton
          icon={<GoogleColoredIcon />}
          label={t('auth.signInGoogle')}
          onPress={handleGoogle}
          loading={loading === 'google'}
          disabled={loading !== null && loading !== 'google'}
        />
        {showApple && (
          <ProviderButton
            icon={<AppleIcon color={BLACK} />}
            label={t('auth.signInApple')}
            onPress={handleApple}
            loading={loading === 'apple'}
            disabled={loading !== null && loading !== 'apple'}
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
          style={styles.input}
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
      {isReviewEmail ? (
        <View style={[styles.inputWrap, { marginTop: SM }]}>
          <TextInput
            style={styles.input}
            value={reviewCode}
            onChangeText={txt => { setReviewCode(txt); if (emailError) setEmailError(null) }}
            placeholder={t('auth.reviewCodePlaceholder')}
            placeholderTextColor={BLACK_MID}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleReview}
          />
        </View>
      ) : null}
      {emailError ? (
        <Text style={styles.errorText}>{emailError}</Text>
      ) : null}

      <View style={{ marginTop: MD }}>
        <Button
          label={isReviewEmail ? t('auth.reviewSubmit') : t('auth.sendLink')}
          onPress={isReviewEmail ? handleReview : handleEmail}
          variant="primary"
          size="lg"
          loading={isReviewEmail ? loading === 'review' : loading === 'email'}
          disabled={
            isReviewEmail
              ? (loading !== null && loading !== 'review') || reviewCode.trim() === ''
              : (loading !== null && loading !== 'email') || !canSendEmail
          }
          silentDisabled={!isReviewEmail && loading !== null && loading !== 'email' && canSendEmail}
          iconStart={<MailIcon color={WHITE} />}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: XS,
  },
  title: {
    fontSize: FSIZE.xl,
    fontWeight: WEIGHT.extrabold,
    color: INK,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: SM,
    fontSize: FSIZE.md,
    lineHeight: lh(FSIZE.md),
    color: INK_2,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    marginTop: MD,
    marginBottom: MD,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BLACK_SOFT,
  },
  dividerText: {
    fontSize: FSIZE.sm,
    color: INK_3,
    letterSpacing: 0.2,
  },
  inputWrap: {
    ...FIELD_SKIN,
    height: INPUT_MIN_HEIGHT,
    paddingHorizontal: MD,
    justifyContent: 'center',
  },
  inputWrapError: {
    borderColor: NEGATIVE,
  },
  input: {
    fontSize: FSIZE.md,
    color: BLACK,
    padding: 0,
    textAlign: 'center',
  },
  errorText: {
    marginTop: SM,
    fontSize: FSIZE.sm,
    color: INK,
    textAlign: 'center',
  },
  successCircle: {
    alignSelf: 'center',
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: 999,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: MD,
  },
})
