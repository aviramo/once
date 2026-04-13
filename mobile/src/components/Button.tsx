import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native'

// App-wide button. Every pressable primary/secondary/destructive action goes
// through this component so the press feedback, disabled state, and loading
// animation stay identical everywhere.
//
// Press feedback: a quick scale-down followed by a spring-back bump, driven
// natively so it stays smooth even when the JS thread is busy with the
// in-flight action that the press kicks off.
//
// `loading` keeps the label visible and pulses its opacity while the action
// is in-flight; presses are blocked. `disabled` fades the whole button to a
// static dim state without the pulse.

type Variant = 'primary' | 'secondary' | 'destructive'
type Size = 'lg' | 'md'

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'lg',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: Variant
  size?: Size
}) {
  const scale = useRef(new Animated.Value(1)).current
  const pulse = useRef(new Animated.Value(1)).current

  // Breathing pulse on the label opacity while loading — communicates
  // "something is happening" without swapping the text out for a spinner.
  useEffect(() => {
    if (!loading) {
      pulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [loading])

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 90,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start()
  }

  const isDisabled = disabled || loading
  const base = SIZE[size]
  const skin = VARIANT[variant]

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          base.btn,
          skin.btn,
          pressed && skin.pressed,
          disabled && styles.disabled,
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={isDisabled}
      >
        <Animated.Text style={[styles.text, base.text, skin.text, { opacity: pulse }]}>
          {label}
        </Animated.Text>
      </Pressable>
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
  text: {
    letterSpacing: -0.2,
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
    btn: { backgroundColor: '#e5484d' },
    pressed: { backgroundColor: '#c93d42' },
    text: { color: '#fff' },
  },
}
