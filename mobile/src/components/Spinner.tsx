import { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { MOTION, SPINNER } from '../tokens'

// The single loading spinner in the app. A faint full-circle track with a
// brighter quarter-arc rotating over it forever (one 360° revolution every
// MOTION.spin). Every "something is in flight" affordance composes this —
// the in-button spinner, the game-mode toggle busy state, any future one.
//
// Why SVG and not RN's ActivityIndicator: ActivityIndicator can't control
// stroke weight at all and can't be resized on iOS (small/large only). The
// game-mode toggle needs a white, heavier, slightly larger spinner so it
// reads on the dark profile photo where a small black ActivityIndicator was
// invisible — only a drawn arc gives full control over color/size/thickness
// with consistent cross-platform output. Behavior (the looped rotation) lives
// here once; no caller reimplements useSharedValue + withRepeat.
//
// Variants are props (color / size / thickness), never a forked component.
// Defaults match the historical in-button spinner exactly — keep them in
// lockstep with SPINNER.* in tokens.ts.

export function Spinner({
  color,
  size = SPINNER.size,
  thickness = SPINNER.thickness,
}: {
  color: string
  size?: number
  thickness?: number
}) {
  const rotation = useSharedValue(0)
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: MOTION.spin, easing: Easing.linear }), -1, false)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={8} stroke={color} strokeOpacity={SPINNER.trackOpacity} strokeWidth={thickness} fill="none" />
        <Path d="M 12 4 A 8 8 0 0 1 20 12" stroke={color} strokeWidth={thickness} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  )
}
