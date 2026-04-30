import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, Image as RNImage } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat,
  Easing, runOnJS, cancelAnimation,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { PRIMARY, WHITE } from '../colors'

const RING_DURATION = 1600
const RING_COUNT = 3
const REVEAL_MS = 320
const MIN_RADAR_MS = 700
const SAFETY_TIMEOUT = 6000
const AVATAR_SIZE = 88
const RING_SIZE = AVATAR_SIZE + 18

export type RevealPhase = 'idle' | 'reveal' | 'done'

type DiscoveryRevealProps = {
  enabled: boolean
  centerAvatarUrl?: string | null
  onComplete: () => void
  children: (api: { onImagesReady: () => void; revealPhase: RevealPhase }) => React.ReactNode
}

type Phase = 'radar' | 'reveal' | 'done'

export function DiscoveryReveal({
  enabled,
  centerAvatarUrl,
  onComplete,
  children,
}: DiscoveryRevealProps) {
  const [phase, setPhase] = useState<Phase>(enabled ? 'radar' : 'done')
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const ring1 = useSharedValue(0)
  const ring2 = useSharedValue(0)
  const ring3 = useSharedValue(0)
  const dot = useSharedValue(0)
  const overlayOpacity = useSharedValue(enabled ? 1 : 0)
  const avatarScale = useSharedValue(1)
  const avatarOpacity = useSharedValue(enabled ? 1 : 0)
  const cardScale = useSharedValue(enabled ? 0.95 : 1)
  const cardOpacity = useSharedValue(enabled ? 0 : 1)

  const mountTimeRef = useRef(Date.now())

  const finishReveal = useCallback(() => {
    setPhase('done')
    cancelAnimation(ring1)
    cancelAnimation(ring2)
    cancelAnimation(ring3)
    cancelAnimation(dot)
    onCompleteRef.current()
  }, [])

  const runRevealAnimations = useCallback(() => {
    setPhase('reveal')
    avatarScale.value = withTiming(6, { duration: REVEAL_MS, easing: Easing.in(Easing.cubic) })
    avatarOpacity.value = withTiming(0, { duration: REVEAL_MS, easing: Easing.in(Easing.cubic) })
    overlayOpacity.value = withTiming(0, { duration: REVEAL_MS, easing: Easing.in(Easing.cubic) })
    cardScale.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) })
    cardOpacity.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      'worklet'
      if (finished) runOnJS(finishReveal)()
    })
  }, [finishReveal])

  const startReveal = useCallback(() => {
    if (phaseRef.current !== 'radar') return
    const elapsed = Date.now() - mountTimeRef.current
    const wait = Math.max(0, MIN_RADAR_MS - elapsed)
    if (wait > 0) {
      setTimeout(() => {
        if (phaseRef.current === 'radar') runRevealAnimations()
      }, wait)
    } else {
      runRevealAnimations()
    }
  }, [runRevealAnimations])

  // Start radar pulses + safety timeout
  useEffect(() => {
    if (!enabled) return
    const ringTiming = () => withTiming(1, { duration: RING_DURATION, easing: Easing.out(Easing.cubic) })
    ring1.value = withRepeat(ringTiming(), -1, false)
    ring2.value = withDelay(RING_DURATION / RING_COUNT, withRepeat(ringTiming(), -1, false))
    ring3.value = withDelay((RING_DURATION / RING_COUNT) * 2, withRepeat(ringTiming(), -1, false))
    dot.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), -1, false)
    const safety = setTimeout(() => {
      if (phaseRef.current === 'radar') startReveal()
    }, SAFETY_TIMEOUT)
    return () => {
      clearTimeout(safety)
      cancelAnimation(ring1)
      cancelAnimation(ring2)
      cancelAnimation(ring3)
      cancelAnimation(dot)
    }
  }, [enabled, startReveal])

  const onImagesReady = useCallback(() => {
    if (!enabled) {
      onCompleteRef.current()
      return
    }
    startReveal()
  }, [enabled, startReveal])

  const ring1Style = useAnimatedStyle(() => ({
    opacity: 0.18 * (1 - ring1.value),
    transform: [{ scale: 1 + 1.2 * ring1.value }],
  }))
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.18 * (1 - ring2.value),
    transform: [{ scale: 1 + 1.2 * ring2.value }],
  }))
  const ring3Style = useAnimatedStyle(() => ({
    opacity: 0.18 * (1 - ring3.value),
    transform: [{ scale: 1 + 1.2 * ring3.value }],
  }))

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }))
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
    transform: [{ scale: avatarScale.value }],
  }))
  const cardWrapStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }))
  const dotStyle = useAnimatedStyle(() => {
    // Single ping that fades in at offset, drifts to center, fades out, repeats.
    const t = dot.value
    const offset = (1 - t) * 70
    const fade = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1
    return {
      opacity: 0.55 * fade,
      transform: [
        { translateX: offset },
        { translateY: -offset },
        { scale: 0.6 + 0.4 * t },
      ],
    }
  })

  const revealPhase: RevealPhase =
    phase === 'radar' ? 'idle' : phase === 'reveal' ? 'reveal' : 'done'

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, cardWrapStyle]}>
        {children({ onImagesReady, revealPhase })}
      </Animated.View>

      {phase !== 'done' && (
        <Animated.View
          style={[StyleSheet.absoluteFill, overlayStyle, styles.overlay]}
          pointerEvents="none"
        >
          <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />

          <View style={styles.center} pointerEvents="none">
            <Animated.View style={[styles.ring, ring1Style]} />
            <Animated.View style={[styles.ring, ring2Style]} />
            <Animated.View style={[styles.ring, ring3Style]} />

            <Animated.View style={[styles.avatarWrap, avatarStyle]}>
              {centerAvatarUrl ? (
                <RNImage source={{ uri: centerAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]} />
              )}
            </Animated.View>

            <Animated.View style={[styles.dot, dotStyle]} pointerEvents="none" />
          </View>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    overflow: 'hidden',
    borderRadius: 16,
  },
  dim: {
    backgroundColor: 'rgba(255,122,92,0.04)',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: PRIMARY,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    backgroundColor: PRIMARY,
    opacity: 0.4,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
})
