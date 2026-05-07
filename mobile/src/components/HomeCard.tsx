import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, type ScrollViewProps, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { Gesture, GestureDetector, ScrollView, type GestureType } from 'react-native-gesture-handler'
import type { NativeViewGestureHandlerProps } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, Easing, runOnJS,
} from 'react-native-reanimated'
import { HomeButtons } from './HomeButtons'
import { SINGLE, RADIUS } from '../fonts'
import { WHITE } from '../colors'

// ── Context for pull gesture ─────────────────────────────────────────────────

export type PullCtx = {
  panRef: React.MutableRefObject<GestureType | undefined>
  extraRefs: React.MutableRefObject<GestureType | undefined>[]
  setScrollAtTop: (v: boolean) => void
  pulling: boolean
}
export const PullContext = createContext<PullCtx | null>(null)

/** ScrollView that negotiates with the card's pull gesture.
 *  - simultaneousHandlers: lets scroll and pan coexist while idle.
 *  - scrollEnabled is dropped while the pan is engaged in a pull, so a finger
 *    that reverses upward mid-pull brings the card back instead of leaving it
 *    stuck while the inner content scrolls.
 *  - updates scrollAtTop state so Pan enables/disables accordingly */
export const PullScrollView = forwardRef<any, ScrollViewProps & NativeViewGestureHandlerProps>(
  (props, ref) => {
    const ctx = useContext(PullContext)
    const { onScroll, scrollEnabled, ...rest } = props
    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      ctx?.setScrollAtTop(e.nativeEvent.contentOffset.y < 8)
      onScroll?.(e)
    }
    const effectiveScrollEnabled = ctx?.pulling ? false : scrollEnabled
    return (
      <ScrollView
        {...rest}
        ref={ref}
        onScroll={handleScroll}
        nestedScrollEnabled
        simultaneousHandlers={ctx ? [ctx.panRef, ...ctx.extraRefs].filter(r => r.current) : undefined}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={effectiveScrollEnabled}
      />
    )
  }
)


const PULL_THRESHOLD = 90
const PULL_DAMP = 0.35

// ── HomeCard ─────────────────────────────────────────────────────────────────

export type HomeCardProps = {
  children: React.ReactNode
  /** Content rendered between the main area and buttons. */
  description?: React.ReactNode
  /** Buttons rendered at the card bottom. */
  buttons?: React.ReactNode
  /** Pull-to-action callback. When provided, enables the pull-down gesture.
   *  Receives the card's translateY at the moment of release so the caller can
   *  hand off the motion to its own animation without a visual hop. */
  onPull?: (startOffset: number) => Promise<void> | void
  /** Ref for programmatic pull trigger (e.g. from a header arrow button). */
  pullRef?: React.MutableRefObject<(() => void) | null>
  /** Extra gesture refs that inner ScrollViews should coexist with. */
  extraSimultaneousRefs?: React.MutableRefObject<GestureType | undefined>[]
  /** Make the inner card area transparent so siblings rendered behind show
   *  through (e.g., the home pane reveals the empty/searching UI when the
   *  match card slides off-screen via translateY). */
  transparentInner?: boolean
}

export function HomeCard({
  children,
  description,
  buttons,
  onPull,
  pullRef,
  extraSimultaneousRefs,
  transparentInner,
}: HomeCardProps) {
  const pullY = useSharedValue(0)
  const pullProgress = useSharedValue(0)
  const spinning = useSharedValue(false)
  const triggered = useSharedValue(false)
  const isLoading = useSharedValue(false)

  const doLoad = useCallback(() => {
    spinning.value = true
    // Hand off the released offset to the caller so the slot's slide-down can
    // start from this position — no upward rebound between release and slide.
    const startOffset = pullY.value
    pullProgress.value = 0
    pullY.value = 0
    Promise.resolve(onPull?.(startOffset)).finally(() => {
      isLoading.value = false
      requestAnimationFrame(() => { spinning.value = false })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPull])

  const triggerLoad = useCallback(() => {
    if (isLoading.value || !onPull) return
    isLoading.value = true
    doLoad()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doLoad, onPull])

  // Expose programmatic trigger to parent
  useEffect(() => {
    if (pullRef) pullRef.current = onPull ? triggerLoad : null
    return () => { if (pullRef) pullRef.current = null }
  })

  // ── Gesture ────────────────────────────────────────────────────────────────
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollAtTopSV = useSharedValue(true)
  const [pulling, setPulling] = useState(false)
  const hasPull = !!onPull
  const panRef = useRef<GestureType>(undefined as unknown as GestureType)

  // Drop the `failOffsetY(-8)` we used to have: failing on upward reversal
  // left pullY stuck at its last value (since onEnd doesn't fire on fail) and
  // handed the touch to the inner ScrollView, which then scrolled content up
  // while the card stayed pulled down. Keeping the pan engaged lets pullY
  // track the finger smoothly back to 0; `pulling` (set on JS via runOnJS)
  // disables inner scroll for the duration so it can't consume the reversal.
  const pan = useMemo(() =>
    Gesture.Pan()
      .withRef(panRef)
      .enabled(hasPull)
      .activeOffsetY(8)
      .failOffsetX([-12, 12])
      .onStart(() => {
        'worklet'
        if (!scrollAtTopSV.value) return
        pullY.value = 0
        pullProgress.value = 0
        triggered.value = false
        isLoading.value = false
        runOnJS(setPulling)(true)
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
        runOnJS(doLoad)()
      })
      .onFinalize(() => {
        'worklet'
        runOnJS(setPulling)(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [hasPull, doLoad])

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
    pulling,
  }), [extraSimultaneousRefs, pulling])

  const inner = (
    <View style={styles.cardWrapper}>
      <Animated.View style={[styles.cardOuter, cardStyle]}>
        <View style={[styles.cardInner, transparentInner && { backgroundColor: 'transparent' }]}>
          <View style={{ flex: 1 }}>
            {children}
          </View>
          {description}
        </View>
      </Animated.View>
      {buttons && (
        <HomeButtons>
          {buttons}
        </HomeButtons>
      )}
    </View>
  )

  // Always wrap with GestureDetector — even when hasPull is false. Toggling
  // the wrapper changes `inner`'s position in the React tree and forces a
  // full unmount/remount of the card (and its MatchCard subtree), which read
  // as a white-flash-then-rise when the state transitioned watching →
  // waiting. The pan itself is gated by `.enabled(hasPull)`, so it costs
  // nothing to leave the detector mounted while disabled.
  return (
    <PullContext.Provider value={ctxValue}>
      <GestureDetector gesture={pan}>{inner}</GestureDetector>
    </PullContext.Provider>
  )
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    marginHorizontal: SINGLE,
    marginTop: 0,
    marginBottom: 0,
  },
  cardOuter: {
    flex: 1,
    borderRadius: RADIUS,
  },
  cardInner: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
})
