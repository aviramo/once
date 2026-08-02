import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing } from 'react-native-reanimated'
import Animated from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { Text, TextInput } from './AppText'
import { Button, BUTTON_GLYPH, BUTTON_LABEL } from './Button'
import { t } from '../i18n'
import { INK_SUBTLE, INK, INK_BODY, INK_HINT, SURFACE, WHITE, INK_DIM, LINE, NEGATIVE, WHITE_MID } from '../colors'
import { FIELD_SKIN } from '../field'
import { XS, SM, MD, ICON, ICON_CIRCLE_SIZE, TEXT, WEIGHT, INPUT_MIN_HEIGHT, BUTTON_MIN_HEIGHT, MOTION, lh } from '../tokens'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The provider marks and the tile's spinner all set at BUTTON_GLYPH, the size
// every other button in the app gives the glyph beside its label — these tiles
// are buttons, they just cannot compose <Button> (see ssoBtnStyles.btn).
function GoogleColoredIcon() {
  return (
    <Svg width={BUTTON_GLYPH} height={BUTTON_GLYPH} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  )
}

function AppleIcon({ color = INK }: { color?: string } = {}) {
  return (
    <Svg width={BUTTON_GLYPH} height={BUTTON_GLYPH} viewBox="0 0 24 24">
      <Path fill={color} d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.44c1.32.07 2.24.74 3.01.8.94-.19 1.84-.89 2.9-.95 1.24-.07 2.41.4 3.26 1.3-2.93 1.75-2.21 5.59.54 6.68-.56 1.49-1.3 2.97-1.71 4.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

// Raw <Svg>, not a Glyph: it never followed the OS font scale, which is what
// a fixed-dp badge needs anyway (see ICON_CIRCLE_SIZE in tokens.ts).
function MailIcon({ color = WHITE, size = BUTTON_GLYPH }: { color?: string; size?: number } = {}) {
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
  const arc = dark ? INK : WHITE
  const track = dark ? INK_DIM : WHITE_MID
  return (
    <Animated.View style={[{ width: BUTTON_GLYPH, height: BUTTON_GLYPH }, animStyle]}>
      <Svg width={BUTTON_GLYPH} height={BUTTON_GLYPH} viewBox="0 0 22 22">
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
      >
        {label}
      </Text>
    </Pressable>
  )
}

const ssoBtnStyles = StyleSheet.create({
  btn: {
    // The provider buttons are the one place a button carries a rule: they
    // must read as a white tile (the platform brand mark sits on it), so they
    // wear the shared field skin rather than a fill of their own.
    ...FIELD_SKIN,
    minHeight: BUTTON_MIN_HEIGHT,
    paddingVertical: SM,
    paddingHorizontal: BUTTON_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: { position: 'absolute', start: 20, top: 0, bottom: 0, justifyContent: 'center' },
  // The app's action-button label, imported rather than re-typed — this tile
  // can't compose <Button> (it needs the white field skin + the pinned brand
  // mark), but its label must set exactly like every other button's.
  label: { ...BUTTON_LABEL, color: INK },
})

// THERE IS NO STORE-REVIEW DOOR (2026-08-03). Typing a fixed address here used
// to turn the email field into a code gate that signed the caller into a
// pre-approved review account, bypassing the magic link and the circle
// membership the whole app is gated on. It was the app's ONE pre-auth path, it
// held a static code, and the account behind it was signed into exactly once —
// the day it was built — by nobody but its author: no store listing ever carried
// the demo credentials, so no reviewer ever used it. A door that serves nobody is
// only a way in. Do not rebuild this without a store submission that needs it.
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
          <MailIcon color={INK} size={ICON.circle} />
        </View>
        <Text style={styles.title}>{t('auth.linkSent')}</Text>
        <Text style={styles.desc}>
          {t('auth.linkSentDesc').replace('{email}', sentTo)}
        </Text>
        <View style={styles.resendBlock}>
          <Button
            label={t('auth.linkResend')}
            variant="secondary"
            size="lg"
            onPress={() => { setSentTo(null); setEmail(sentTo) }}
            iconStart={<MailIcon color={INK_SUBTLE} />}
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
            icon={<AppleIcon color={INK} />}
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
          placeholderTextColor={INK_DIM}
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

      <View style={{ marginTop: MD }}>
        <Button
          label={t('auth.sendLink')}
          onPress={handleEmail}
          variant="primary"
          size="lg"
          loading={loading === 'email'}
          disabled={(loading !== null && loading !== 'email') || !canSendEmail}
          silentDisabled={loading !== null && loading !== 'email' && canSendEmail}
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
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.medium,
    color: INK,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: SM,
    fontSize: TEXT.md,
    color: INK_BODY,
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
    backgroundColor: LINE,
  },
  dividerText: {
    fontSize: TEXT.md,
    color: INK_HINT,
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
    fontSize: TEXT.md,
    color: INK,
    padding: 0,
    textAlign: 'center',
  },
  errorText: {
    marginTop: SM,
    fontSize: TEXT.md,
    color: INK,
    textAlign: 'center',
  },
  resendBlock: {
    marginTop: MD,
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
