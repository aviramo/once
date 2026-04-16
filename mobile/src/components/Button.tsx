import { useRef, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { FONT_SCALE } from '../fonts'

// App-wide button. Every pressable primary/secondary/destructive action goes
// through this component so the press feedback and disabled state stay
// identical everywhere.
//
// Press feedback: a quick scale-down followed by a spring-back bump, driven
// natively so it stays smooth even when the JS thread is busy with the
// in-flight action that the press kicks off.
//
// Tap target is built on raw View responder callbacks rather than Pressable:
// RN 0.81's Pressability has an aggressive cancel-on-movement threshold that
// drops single taps as "pressIn + pressOut without onPress" on buttons inside
// ScrollViews (settings reset, units toggle) — the bare responder flow below
// fires onPress on every clean release. Termination is NOT refused, so a
// ScrollView ancestor can still steal the gesture on an actual scroll.

type Variant = 'primary' | 'secondary' | 'destructive'
type Size = 'lg' | 'md'
// Accent tone layered on top of `primary`. Keeps the rest of the button
// spec intact (shape, text color, pressed fade) and only swaps the fill —
// so a positive CTA stays consistent with every other primary button.
type Tone = 'neutral' | 'positive' | 'visible'

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  size = 'lg',
  tone = 'neutral',
  silentDisabled,
  iconStart,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: Variant
  size?: Size
  tone?: Tone
  // When true, `disabled` still blocks taps but the button keeps its normal
  // appearance (no fade). Used for sibling buttons that get locked out while
  // another action in the same row is in-flight — we want the lockout, not a
  // visual flicker as the user sees every button go gray for a frame.
  silentDisabled?: boolean
  // Optional leading glyph pinned to the start edge. Positioned absolutely
  // so the label stays visually centered regardless of the icon's width.
  iconStart?: ReactNode
}) {
  const scale = useRef(new Animated.Value(1)).current
  const [pressed, setPressed] = useState(false)

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
  const toneSkin = variant === 'primary' && tone !== 'neutral' ? TONE[tone] : null

  return (
    <Animated.View collapsable={false} style={[styles.wrap, { transform: [{ scale }] }]}>
      <View
        style={[
          styles.btn,
          base.btn,
          skin.btn,
          toneSkin?.btn,
          pressed && (toneSkin?.pressed ?? skin.pressed),
          disabled && !silentDisabled && styles.disabled,
        ]}
        onStartShouldSetResponder={() => !disabled}
        onResponderGrant={pressIn}
        onResponderRelease={() => {
          pressOut()
          if (!disabled) onPress()
        }}
        onResponderTerminate={pressOut}
      >
        {iconStart ? (
          <View pointerEvents="none" style={styles.iconStart}>
            {iconStart}
          </View>
        ) : null}
        <Text
          style={[styles.text, base.text, skin.text]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={FONT_SCALE.ui}
        >
          {label}
        </Text>
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
  // Absolute so the label stays visually centered regardless of icon width.
  iconStart: {
    position: 'absolute',
    start: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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
    btn: { borderRadius: 16, paddingVertical: 20 },
    text: { fontSize: 16, fontWeight: '700' },
  },
  md: {
    btn: { borderRadius: 14, paddingVertical: 16 },
    text: { fontSize: 15, fontWeight: '700' },
  },
}

const TONE: Record<Exclude<Tone, 'neutral'>, { btn: object; pressed: object }> = {
  positive: {
    btn: { backgroundColor: '#d4a017' },
    pressed: { backgroundColor: '#a87f10' },
  },
  visible: {
    btn: { backgroundColor: '#6d28d9' },
    pressed: { backgroundColor: '#5b21b6' },
  },
}

const VARIANT: Record<Variant, { btn: object; pressed: object; text: object }> = {
  primary: {
    btn: { backgroundColor: '#111' },
    pressed: { opacity: 0.85 },
    text: { color: '#fff' },
  },
  secondary: {
    btn: {
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.12)',
    },
    pressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
    text: { color: '#111', fontWeight: '600' },
  },
  destructive: {
    btn: { backgroundColor: '#e5e7eb' },
    pressed: { backgroundColor: '#d1d5db' },
    text: { color: '#374151' },
  },
}
