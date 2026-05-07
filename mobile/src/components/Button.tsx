import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { FONT_SCALE, SINGLE, DOUBLE, BUTTON, RADIUS } from '../fonts'
import { TEXT_PRIMARY, WHITE, PRIMARY, PRIMARY_PRESS, GRAY_50, GRAY_100, GRAY_400, GRAY_800, DESTRUCTIVE, DESTRUCTIVE_PRESS, PREMIUM, PREMIUM_PRESS } from '../colors'

// App-wide button. Every pressable primary/secondary/destructive action goes
// through this component so the press feedback and disabled state stay
// identical everywhere.
//
// Press feedback: a quick scale-down followed by a spring-back bump, driven
// natively so it stays smooth even when the JS thread is busy with the
// in-flight action that the press kicks off. During loading the button
// stays in its pressed (darker) fill so it reads as "working" without a
// shaky/bouncy cue.
//
// Tap target is built on raw View responder callbacks rather than Pressable:
// RN 0.81's Pressability has an aggressive cancel-on-movement threshold that
// drops single taps as "pressIn + pressOut without onPress" on buttons inside
// ScrollViews (settings reset, units toggle) — the bare responder flow below
// fires onPress on every clean release. Termination is NOT refused, so a
// ScrollView ancestor can still steal the gesture on an actual scroll.

type Variant = 'primary' | 'secondary' | 'destructive' | 'softDestructive' | 'soft' | 'dark' | 'premium'
type Size = 'lg' | 'md'
// Accent tone layered on top of `primary`. Keeps the rest of the button
// spec intact (shape, text color, pressed fade) and only swaps the fill.
type Tone = 'positive'

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'lg',
  tone,
  silentDisabled,
  iconStart,
  iconEnd,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  // In-flight server wait. Blocks taps like `disabled` but keeps the
  // button in its pressed (darker) fill so it reads as "working" rather
  // than dimmed or shaking.
  loading?: boolean
  variant?: Variant
  size?: Size
  tone?: Tone
  // When true, `disabled` still blocks taps but the button keeps its normal
  // appearance (no fade). Used for sibling buttons that get locked out while
  // another action in the same row is in-flight — we want the lockout, not a
  // visual flicker as the user sees every button go gray for a frame.
  silentDisabled?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
}) {
  const scale = useRef(new Animated.Value(1)).current
  const heartbeat = useRef(new Animated.Value(1)).current
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    if (loading) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(heartbeat, { toValue: 0.55, duration: 300, useNativeDriver: true }),
          Animated.timing(heartbeat, { toValue: 1, duration: 450, useNativeDriver: true }),
        ])
      )
      anim.start()
      return () => anim.stop()
    } else {
      heartbeat.setValue(1)
    }
  }, [loading])

  const blocked = disabled || loading

  const pressIn = () => {
    setPressed(true)
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 90,
      useNativeDriver: true,
    }).start()
  }

  const pressOut = () => {
    setPressed(false)
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start()
  }

  const base = SIZE[size]
  const skin = VARIANT[variant]
  // Tone only overrides the fill/pressed fill of the primary variant. For
  // secondary/destructive the tone is ignored — they already carry their
  // own semantic color.
  const toneSkin = variant === 'primary' && tone ? TONE[tone] : null

  return (
    <Animated.View
      collapsable={false}
      // Only bind opacity to the heartbeat Animated.Value while the button is
      // actually pulsing. With useNativeDriver:true, calling setValue(1) on
      // transition back to non-loading does not always propagate to the JS
      // render path on the same frame — so the View kept rendering at the
      // last animated value (e.g. 0.6) even after loading became false. The
      // visual symptom: a freshly transitioned button (notif popup → location
      // popup) looked dimmed/disabled despite being clickable.
      style={[styles.wrap, { transform: [{ scale }] }, loading && { opacity: heartbeat }]}
    >
      <View
        style={[
          styles.btn,
          base.btn,
          skin.btn,
          toneSkin?.btn,
          (pressed || loading) && (toneSkin?.pressed ?? skin.pressed),
          disabled && !loading && !silentDisabled && styles.disabled,
        ]}
        onStartShouldSetResponder={() => !blocked}
        onResponderGrant={pressIn}
        onResponderRelease={() => {
          pressOut()
          if (!blocked) onPress()
        }}
        onResponderTerminate={pressOut}
      >
        {iconStart ? (
          <View pointerEvents="none" style={styles.iconStart}>
            {iconStart}
          </View>
        ) : null}
        {iconEnd ? (
          <View style={styles.labelRow} pointerEvents="none">
            <Text
              style={[styles.text, base.text, skin.text]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              maxFontSizeMultiplier={FONT_SCALE.ui}
            >
              {label}
            </Text>
            <View>{iconEnd}</View>
          </View>
        ) : (
          <Text
            style={[styles.text, base.text, skin.text]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            maxFontSizeMultiplier={FONT_SCALE.ui}
          >
            {label}
          </Text>
        )}
      </View>
    </Animated.View>
  )
}

// Legacy alias — still imported by home.tsx and login.tsx. New code should
// use `<Button variant="primary" size="lg" />`.
export function PrimaryButton(props: Omit<Parameters<typeof Button>[0], 'variant' | 'size'>) {
  return <Button {...props} variant="primary" size="lg" />
}

const styles = StyleSheet.create({
  // Fill whatever horizontal space the parent grants — lets the bottom bar
  // in home/login span full width, and the dialog row split evenly when
  // wrapped in flex:1 slots.
  wrap: { alignSelf: 'stretch' },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  iconStart: {
    position: 'absolute',
    start: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    letterSpacing: -0.2,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
})

const SIZE: Record<Size, { btn: object; text: object }> = {
  lg: {
    btn: { borderRadius: RADIUS, paddingVertical: DOUBLE },
    text: { fontSize: 16, fontWeight: '700' },
  },
  md: {
    btn: { borderRadius: RADIUS, paddingVertical: SINGLE },
    text: { fontSize: 15, fontWeight: '700' },
  },
}

const TONE: Record<Tone, { btn: object; pressed: object }> = {
  positive: {
    btn: { backgroundColor: PRIMARY },
    pressed: { backgroundColor: PRIMARY_PRESS },
  },
}

const VARIANT: Record<Variant, { btn: object; pressed: object; text: object }> = {
  primary: {
    btn: { backgroundColor: PRIMARY },
    pressed: { backgroundColor: PRIMARY_PRESS },
    text: { color: WHITE },
  },
  secondary: {
    btn: { backgroundColor: GRAY_50 },
    pressed: { backgroundColor: GRAY_100 },
    text: { color: GRAY_800, fontWeight: '600' },
  },
  destructive: {
    btn: { backgroundColor: DESTRUCTIVE },
    pressed: { backgroundColor: DESTRUCTIVE_PRESS },
    text: { color: WHITE },
  },
  softDestructive: {
    btn: { backgroundColor: GRAY_50 },
    pressed: { backgroundColor: GRAY_100 },
    text: { color: DESTRUCTIVE },
  },
  soft: {
    btn: { backgroundColor: GRAY_400 },
    pressed: { backgroundColor: GRAY_800 },
    text: { color: WHITE },
  },
  dark: {
    btn: { backgroundColor: '#000' },
    pressed: { backgroundColor: '#222' },
    text: { color: WHITE },
  },
  premium: {
    btn: { backgroundColor: PREMIUM },
    pressed: { backgroundColor: PREMIUM_PRESS },
    text: { color: WHITE },
  },
}
