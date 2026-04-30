import { useEffect } from 'react'
import Animated, {
  useSharedValue, useAnimatedProps,
  withSequence, withTiming, Easing,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg'

const AnimatedG = Animated.createAnimatedComponent(G)

// Once brand logo: two tangent circles (green + gray) with a lens-flare
// sparkle at the single point of tangency. Matches assets/icon.svg so the
// in-app logo reads identically to the app icon. viewBox: 100×100.
//
// animate=true: every 10s the sparkle briefly flares up (pleasant twinkle).
export function OnceLogo({ size = 96, animate = false, color }: { size?: number; animate?: boolean; color?: string }) {
  // Tangent point of the two circles.
  const cx = 44.7
  const cy = 52.8

  const flareOpacity = useSharedValue(0)

  useEffect(() => {
    if (!animate) return
    const trigger = () => {
      flareOpacity.value = withSequence(
        withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 1000, easing: Easing.in(Easing.quad) }),
      )
    }
    // First twinkle shortly after mount, then every 10s.
    const initial = setTimeout(trigger, 2000)
    const id = setInterval(trigger, 10_000)
    return () => { clearTimeout(initial); clearInterval(id) }
  }, [animate])

  const flareProps = useAnimatedProps(() => ({ opacity: flareOpacity.value }))

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="sparkGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%"   stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="25%"  stopColor="#ffffff" stopOpacity="0.85" />
          <Stop offset="60%"  stopColor="#ffffff" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Large green circle (back) */}
      <Circle cx="66.8" cy="43.75" r="23.83" fill={color ?? '#1AB33D'} />

      {/* Small gray circle (front, externally tangent to green) */}
      <Circle cx="28.0" cy="59.77" r="18.16" fill={color ?? '#767676'} />

      {/* Base sparkle (always visible) */}
      <G>
        {/* Soft halo */}
        <Circle cx={cx} cy={cy} r="10.74" fill="url(#sparkGlow)" />
        {/* Lens-flare rays */}
        <G stroke="#ffffff" strokeLinecap="round">
          <Line x1={cx} y1={cy - 9.3} x2={cx} y2={cy + 9.3} strokeWidth="1.2" opacity="0.35" />
          <Line x1={cx - 9.3} y1={cy} x2={cx + 9.3} y2={cy} strokeWidth="1.2" opacity="0.35" />
          <Line x1={cx} y1={cy - 9.3} x2={cx} y2={cy + 9.3} strokeWidth="0.4" opacity="0.95" />
          <Line x1={cx - 9.3} y1={cy} x2={cx + 9.3} y2={cy} strokeWidth="0.4" opacity="0.95" />
          <Line x1={cx - 5.86} y1={cy - 5.86} x2={cx + 5.86} y2={cy + 5.86} strokeWidth="0.6" opacity="0.25" />
          <Line x1={cx - 5.86} y1={cy + 5.86} x2={cx + 5.86} y2={cy - 5.86} strokeWidth="0.6" opacity="0.25" />
          <Line x1={cx - 5.86} y1={cy - 5.86} x2={cx + 5.86} y2={cy + 5.86} strokeWidth="0.2" opacity="0.6" />
          <Line x1={cx - 5.86} y1={cy + 5.86} x2={cx + 5.86} y2={cy - 5.86} strokeWidth="0.2" opacity="0.6" />
        </G>
        {/* Bright core */}
        <Circle cx={cx} cy={cy} r="1.37" fill="#ffffff" />
      </G>

      {/* Flare overlay — larger halo + longer rays, fades in/out on trigger */}
      {animate && (
        <AnimatedG animatedProps={flareProps}>
          <Circle cx={cx} cy={cy} r="17" fill="url(#sparkGlow)" />
          <G stroke="#ffffff" strokeLinecap="round">
            <Line x1={cx} y1={cy - 14} x2={cx} y2={cy + 14} strokeWidth="1.8" opacity="0.45" />
            <Line x1={cx - 14} y1={cy} x2={cx + 14} y2={cy} strokeWidth="1.8" opacity="0.45" />
            <Line x1={cx} y1={cy - 14} x2={cx} y2={cy + 14} strokeWidth="0.55" opacity="1" />
            <Line x1={cx - 14} y1={cy} x2={cx + 14} y2={cy} strokeWidth="0.55" opacity="1" />
            <Line x1={cx - 9} y1={cy - 9} x2={cx + 9} y2={cy + 9} strokeWidth="0.7" opacity="0.35" />
            <Line x1={cx - 9} y1={cy + 9} x2={cx + 9} y2={cy - 9} strokeWidth="0.7" opacity="0.35" />
          </G>
          <Circle cx={cx} cy={cy} r="2.2" fill="#ffffff" />
        </AnimatedG>
      )}
    </Svg>
  )
}
