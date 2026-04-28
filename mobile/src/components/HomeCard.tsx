import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, type ScrollViewProps, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { Gesture, GestureDetector, ScrollView, type GestureType } from 'react-native-gesture-handler'
import type { NativeViewGestureHandlerProps } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, Easing, runOnJS,
} from 'react-native-reanimated'
import { HomeButtons } from './HomeButtons'
import { SINGLE } from '../fonts'
import { WHITE } from '../colors'

// ── Context for pull gesture ─────────────────────────────────────────────────

type PullCtx = {
  panRef: React.MutableRefObject<GestureType | undefined>
  extraRefs: React.MutableRefObject<GestureType | undefined>[]
  setScrollAtTop: (v: boolean) => void
}
const PullContext = createContext<PullCtx | null>(null)

/** ScrollView that negotiates with the card's pull gesture.
 *  - simultaneousHandlers: lets scroll and pan coexist; pan's failOffsetY(-5)
 *    ensures it fails fast on upward scroll, resolving the iOS conflict.
 *  - updates scrollAtTop state so Pan enables/disables accordingly */
export const PullScrollView = forwardRef<any, ScrollViewProps & NativeViewGestureHandlerProps>(
  (props, ref) => {
    const ctx = useContext(PullContext)
    const { onScroll, ...rest } = props
    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      ctx?.setScrollAtTop(e.nativeEvent.contentOffset.y < 8)
      onScroll?.(e)
    }
    return (
      <ScrollView
        {...rest}
        ref={ref}
        onScroll={handleScroll}
        nestedScrollEnabled
        simultaneousHandlers={ctx ? [ctx.panRef, ...ctx.extraRefs].filter(r => r.current) : undefined}
        bounces={false}
        overScrollMode="never"
      />
    )
  }
)


const PULL_THRESHOLD = 90
const PULL_DAMP = 0.35
const PULL_HOLD_Y = PULL_THRESHOLD * PULL_DAMP

// ── HomeCard ─────────────────────────────────────────────────────────────────

export type HomeCardProps = {
  children: React.ReactNode
  /** Content rendered between the main area and buttons. */
  description?: React.ReactNode
  /** Buttons rendered at the card bottom. */
  buttons?: React.ReactNode
  /** Pull-to-action callback. When provided, enables the pull-down gesture. */
  onPull?: () => Promise<void>
  /** Ref for programmatic pull trigger (e.g. from a header arrow button). */
  pullRef?: React.MutableRefObject<(() => void) | null>
  /** Extra gesture refs that inner ScrollViews should coexist with. */
  extraSimultaneousRefs?: React.MutableRefObject<GestureType | undefined>[]
}

export function HomeCard({
  children,
  description,
  buttons,
  onPull,
  pullRef,
  extraSimultaneousRefs,
}: HomeCardProps) {
  const pullY = useSharedValue(0)
  const pullProgress = useSharedValue(0)
  const spinning = useSharedValue(false)
  const triggered = useSharedValue(false)
  const isLoading = useSharedValue(false)

  // Stable ref so gesture callbacks always see the latest onPull
  const onPullRef = useRef(onPull)
  useEffect(() => { onPullRef.current = onPull }, [onPull])

  const snapBack = () => {
    spinning.value = false
    pullProgress.value = 0
    pullY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
  }

  const doLoad = () => {
    spinning.value = true
    // Card returns to its original position immediately — it swings
    // there while the confirm dialog is open.
    pullProgress.value = 0
    pullY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
    Promise.resolve(onPullRef.current?.()).finally(() => {
      isLoading.value = false
      requestAnimationFrame(() => { spinning.value = false })
    })
  }

  const triggerLoad = () => {
    if (isLoading.value || !onPullRef.current) return
    isLoading.value = true
    doLoad()
  }

  // Expose programmatic trigger to parent
  useEffect(() => {
    if (pullRef) pullRef.current = onPull ? triggerLoad : null
    return () => { if (pullRef) pullRef.current = null }
  })

  // ── Gesture ────────────────────────────────────────────────────────────────
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollAtTopSV = useSharedValue(true)
  const hasPull = !!onPull
  const panRef = useRef<GestureType>(undefined as unknown as GestureType)

  const pan = useMemo(() =>
    Gesture.Pan()
      .withRef(panRef)
      .enabled(hasPull)
      .activeOffsetY(8)
      .failOffsetX([-12, 12])
      .failOffsetY(-8)
      .onStart(() => {
        'worklet'
        if (!scrollAtTopSV.value) return
        pullY.value = 0
        pullProgress.value = 0
        triggered.value = false
        isLoading.value = false
      })
      .onUpdate(e => {
        'worklet'
        if (!scrollAtTopSV.value) return
        const raw = Math.max(0, e.translationY)
        triggered.value = raw >= PULL_THRESHOLD
        pullY.value = raw * PULL_DAMP
        pullProgress.value = Math.min(1, raw / PULL_THRESHOLD)
      })
      .onEnd(() => {
        'worklet'
        if (!scrollAtTopSV.value || isLoading.value) return
        if (!triggered.value) {
          pullProgress.value = 0
          pullY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) })
          return
        }
        triggered.value = false
        isLoading.value = true
        pullY.value = withTiming(PULL_HOLD_Y, { duration: 200, easing: Easing.out(Easing.cubic) })
        runOnJS(doLoad)()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [hasPull])

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullY.value }],
  }))

  const ctxValue = useMemo(() => ({
    panRef,
    extraRefs: extraSimultaneousRefs ?? [],
    setScrollAtTop: (v: boolean) => {
      scrollAtTopSV.value = v
      setScrollAtTop(v)
    },
  }), [extraSimultaneousRefs])

  const inner = (
    <Animated.View style={[styles.cardWrapper, cardStyle]}>
      <View style={styles.cardOuter}>
        <View style={styles.cardInner}>
          <View style={{ flex: 1 }}>
            {children}
          </View>
          {description}
        </View>
      </View>
      {buttons && (
        <HomeButtons>
          {buttons}
        </HomeButtons>
      )}
    </Animated.View>
  )

  return (
    <PullContext.Provider value={ctxValue}>
      {hasPull ? <GestureDetector gesture={pan}>{inner}</GestureDetector> : inner}
    </PullContext.Provider>
  )
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    marginHorizontal: SINGLE,
    marginTop: 0,
    marginBottom: 24,
  },
  cardOuter: {
    flex: 1,
    borderRadius: SINGLE,
  },
  cardInner: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: SINGLE,
    overflow: 'hidden',
  },
})
