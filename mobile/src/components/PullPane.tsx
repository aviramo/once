// ── The pull family ──────────────────────────────────────────────────────
//
// THE single "drag a surface down by the finger" implementation in the app.
// There is exactly one of these; do not hand-roll a second Gesture.Pan for a
// swipe-down anywhere. Consumers:
//   • page1 pull-to-skip                        (home.tsx)
//   • the incoming-invite pull-to-decline       (home.tsx)
//   • every bottom-up overlay's swipe-to-close  (OverlaySheet.tsx)
//
// (BottomSheet.tsx keeps its OWN, separate swipe-to-dismiss. That one is for
// small dialogs anchored to the bottom edge and uses the SWIPE_DISMISS_PX
// threshold family; this one is for full-surface drags and uses
// PULL_COMMIT_FRACTION. They are deliberately different gestures.)
//
// Exports, in dependency order:
//   PullCtx / PullContext / PullScrollView — the inner-scroll coordination
//   usePullCtx                             — builds a PullCtx
//   usePullBehavior                        — owns the gesture + the motion
//   PullPane                               — the framed element that renders it

import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Dimensions, type ScrollViewProps, type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, ScrollView, type GestureType, type ComposedGesture } from 'react-native-gesture-handler'
import type { NativeViewGestureHandlerProps } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, withDelay,
  Easing, runOnJS, type SharedValue,
} from 'react-native-reanimated'
import { I18nManager } from 'react-native'
import {
  PULL_COMMIT_FRACTION, PULL_SNAP_SPRING, SWIPE_DISMISS_VELOCITY,
  PULL_TUTORIAL_START_DELAY_MS, PULL_TUTORIAL_HOLD_MS,
} from '../tokens'
import { hasSeenFlag, markSeenFlag } from '../lib/seenFlags'

/** Which way a surface is dragged away.
 *  'y' — down, off the bottom. Every card surface and every sheet.
 *  'x' — sideways, off the START edge (left in LTR, right in RTL). The menu
 *        drawer only: it enters from that edge, so it must leave by it. */
export type PullAxis = 'y' | 'x'

// A horizontal surface closes toward the START edge, so its translateX is
// negative in LTR and positive in RTL. Declared once, here, because this is the
// only place that turns the drag magnitude back into a direction.
const AXIS_X_SIGN = I18nManager.isRTL ? 1 : -1
/** The opposite direction: inward from the START edge, i.e. the way the menu
 *  drawer is dragged OPEN (home.tsx's edge grab). Derived from the closing sign
 *  rather than re-deriving `isRTL`, so the two can never disagree. */
export const AXIS_X_OPEN_SIGN = -AXIS_X_SIGN

// ── Context for pull gesture ─────────────────────────────────────────────────

export type PullCtx = {
  panRef: React.MutableRefObject<GestureType | undefined>
  extraRefs: React.MutableRefObject<GestureType | undefined>[]
  setScrollAtTop: (v: boolean) => void
  pulling: boolean
  // UI-thread flag, true while the pull pan is actively engaged in a drag.
  // The inner scroll worklet watches it to pin content at offset 0 for the
  // duration — a synchronous lock that doesn't depend on the JS-thread
  // `pulling` re-render landing (see PullScrollView / MatchCard).
  pullEngaged?: SharedValue<boolean>
  // Live pull offset (the card's translateY). The inner scroll pin worklet
  // reads it purely so Reanimated re-runs that worklet on every frame of a
  // pull — `pullEngaged` alone flips once and would not keep the pin ticking.
  pullY?: SharedValue<number>
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
    const { onScroll, onScrollEndDrag, onMomentumScrollEnd, scrollEnabled, ...rest } = props
    // A freshly-mounted ScrollView is always at offset 0. `onScroll` does NOT
    // fire for that initial position, and a programmatic scrollTo on a card
    // swap doesn't reliably fire it either — so without this the pull
    // gesture's `scrollAtTop` flag could keep a stale `false` carried over
    // from a previous card the user had scrolled down. That left the new card
    // un-pullable until the user manually scrolled down and back up to make
    // `onScroll` fire (`scrollOnly` latched in the pan's onStart). Assert
    // at-top on mount so every new card is pullable immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { ctx?.setScrollAtTop(true) }, [])
    // `scrollAtTop` gates the card's pull-to-skip gesture. `onScroll` is
    // throttled, so the LAST event before the content settles can land a few
    // px short of 0 and leave the flag stuck `false` — the card then silently
    // refuses to pull until the user scrolls again. onScrollEndDrag (finger
    // lifted) and onMomentumScrollEnd (momentum settled) report the definitive
    // resting offset, so the flag is always corrected once a scroll truly ends.
    const syncAtTop = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      ctx?.setScrollAtTop(e.nativeEvent.contentOffset.y < 8)
    }
    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncAtTop(e)
      onScroll?.(e)
    }
    const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncAtTop(e)
      onScrollEndDrag?.(e)
    }
    const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncAtTop(e)
      onMomentumScrollEnd?.(e)
    }
    const effectiveScrollEnabled = ctx?.pulling ? false : scrollEnabled
    return (
      <ScrollView
        {...rest}
        ref={ref}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        nestedScrollEnabled
        simultaneousHandlers={ctx ? [ctx.panRef, ...ctx.extraRefs].filter(r => r.current) : undefined}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={effectiveScrollEnabled}
      />
    )
  }
)

// ── PullPane ─────────────────────────────────────────────────────────────
//
// The single framed element shared by every pull-to-dismiss surface: page1
// (pull-to-skip), the incoming invite (pull-to-decline) and every overlay
// sheet (swipe-down-to-close, via OverlaySheet). It composes, in one place:
//   • the GestureDetector + a card wrapper that translates down by `pullY`;
//   • an optional PullContext.Provider (card surfaces need it so the card's
//     inner scroll can coordinate with the pull; plain sheets don't);
//   • an optional non-translated `extra` slot (page1's hidden preloader).
//
// The card translates down by `pullY`, revealing the pane behind it; on
// release it either snaps back or rides off-screen (see usePullBehavior).
//
// The inner RisingCard passed as `children` keeps owning its SlideIn/SlideOut
// mount motion — the pull transform sits on a separate wrapper so the two
// never clobber the same useAnimatedStyle target.
export function PullPane({
  gesture,
  pullY,
  pulling,
  axis = 'y',
  topAnchor,
  style,
  pointerEvents,
  cardStyle,
  pullContext,
  tutorialPlaying,
  behind,
  extra,
  // When true, PullPane does NOT translate `children` by pullY itself — the
  // consumer translates the card it wants to follow the finger. The gesture
  // still uses pullY.
  cardStatic,
  children,
}: {
  /** Composed is allowed so a host can Race another pan onto this surface —
   *  see home.tsx's menu drag, which must NOT add a second GestureDetector. */
  gesture: GestureType | ComposedGesture
  pullY: SharedValue<number>
  pulling: boolean
  /** Which way the surface travels. See PullAxis. */
  axis?: PullAxis
  topAnchor?: SharedValue<number>
  style?: StyleProp<ViewStyle>
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only'
  cardStyle?: StyleProp<ViewStyle>
  pullContext?: PullCtx
  // When the first-time tutorial is playing, lock input so the user can't
  // fight the choreography (page1 only; others never pass it).
  tutorialPlaying?: boolean
  // Static layer rendered BENEATH the wake and the pull-translated card (NOT
  // pull-translated): the next stack card, pre-mounted at rest. The top card
  // pulls off over the black wake exactly as before; once the wake clears
  // this card is already in place (no rise). page1 only.
  behind?: React.ReactNode
  extra?: React.ReactNode
  cardStatic?: boolean
  children?: React.ReactNode
}) {
  const outerTopStyle = useAnimatedStyle(() => ({
    top: topAnchor ? topAnchor.value : 0,
  }))
  // `pullY` is the drag MAGNITUDE along the axis, always >= 0 in the closing
  // direction. Only this transform knows which physical direction that is, so
  // the gesture and every consumer stay direction-agnostic.
  const cardTranslate = useAnimatedStyle(() => (
    axis === 'x'
      ? { transform: [{ translateX: pullY.value * AXIS_X_SIGN }] }
      : { transform: [{ translateY: pullY.value }] }
  ))
  const card = (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[pullPaneStyles.card, cardStyle, cardStatic ? undefined : cardTranslate]}
        collapsable={false}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
  return (
    <Animated.View
      // Default outer = absolute fill (page1/invite). An overlay sheet passes
      // its own overlay style. `outerTopStyle` applies the topAnchor offset
      // (0 unless provided).
      style={[style ?? StyleSheet.absoluteFill, outerTopStyle]}
      pointerEvents={pointerEvents}
    >
      {/* Static next-stack card, pinned at rest BELOW the wake + the
          pull-translated card. The top card pulls off over the black wake
          exactly as before; the moment the wake clears this one is already
          in place (no rise). Absolute-fill, non-interactive (the top card
          owns the gesture; this becomes the interactive top after the skip
          response flips the stack). Nothing when no second card / non-page1. */}
      {behind ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">{behind}</View>
      ) : null}
      {pullContext ? (
        <PullContext.Provider value={pullContext}>{card}</PullContext.Provider>
      ) : (
        card
      )}
      {extra}
      {tutorialPlaying && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto" />
      )}
    </Animated.View>
  )
}

const pullPaneStyles = StyleSheet.create({
  card: {
    flex: 1,
  },
})

// page1 and the invite overlay each need their OWN PullContext value — the two
// can be mounted at once (an invite arriving while page1 is watching), and a
// context binds a specific panRef + scrollAtTop shared value + `pulling`, none
// of which are safe to alias across two GestureDetector trees. They can't be
// one instance, but the *shape* is identical, so the construction lives here
// once instead of being hand-rolled per surface.
export function usePullCtx(
  panRef: React.MutableRefObject<GestureType | undefined>,
  scrollAtTopSV: SharedValue<boolean>,
  pulling: boolean,
  engaged: SharedValue<boolean>,
  pullY: SharedValue<number>,
): PullCtx {
  return useMemo(
    () => ({
      panRef,
      extraRefs: [],
      setScrollAtTop: (v: boolean) => {
        scrollAtTopSV.value = v
      },
      pulling,
      pullEngaged: engaged,
      pullY,
    }),
    // panRef / scrollAtTopSV / engaged / pullY are stable (useRef /
    // useSharedValue); only `pulling` actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pulling],
  )
}

// ── usePullBehavior ──────────────────────────────────────────────────────
//
// THE single source of "pull a surface down" behaviour. It owns everything
// that would otherwise be hand-rolled per screen:
//   • the drag shared value + `pulling` engage/disengage;
//   • the Pan gesture itself — two activation strategies:
//       'scrollPan' = a card surface (page1 skip / invite decline; uses
//                     PullContext so the card's inner scroll locks);
//       'sheet'     = an overlay sheet (manualActivation + header-vs-scroll
//                     touch arbitration, no PullContext);
//   • tracking: 'scrollPan' is 1:1 — the card follows the finger exactly, NO
//     resistance (user: "the card slides directly with the finger"). The only
//     accidental-skip guard is the commit gate: RAW finger travel ≥
//     commitDistance, NO velocity flick — so a fast swipe that didn't pass
//     half never skips, and a short drag just snaps back. 'sheet' is also 1:1
//     but KEEPS its flick (an overlay must dismiss freely);
//   • what crossing the commit threshold DOES, via `commit`:
//       'slideOff' (default) = ride the surface off-screen, then onCommit.
//                              The surface is going away (skip / close).
//       'snapBack'           = onCommit FIRST, then spring back to rest. The
//                              surface stays; onCommit is a *request* whose
//                              handler decides (the invite's decline confirm
//                              dialog opens over a card that springs home).
//     'snapBack' deliberately never latches `slidOut`, so the promote/unmount
//     reactions that watch it don't fire for a request that may be cancelled;
//   • the snap-back animation when released short of commit;
//   • the first-time tutorial: the peek->hold->return choreography AND its
//     once-ever trigger policy (seenFlags gate + post-mount delay), exposing
//     `tutorialPlaying` so the frame can lock input while it plays.
// Each <PullPane> call site calls this once, so simultaneously-mountable
// surfaces still get independent instances (see usePullCtx).
export type PullActivation = 'scrollPan' | 'sheet'
export type PullCommit = 'slideOff' | 'snapBack'
export type PullBehavior = {
  gesture: GestureType
  pullY: SharedValue<number>
  pulling: boolean
  pullCtx: PullCtx | undefined
  panRef: React.MutableRefObject<GestureType | undefined>
  setScrollAtTop: (v: boolean) => void
  reset: () => void
  // Programmatic ride-off skip (button parity with the swipe). See usage.
  commit: () => void
  tutorialPlaying: boolean
  // The single commit distance (px) every consumer must share.
  commitDistance: number
  // Full travel along the axis — the pullY at which the surface is entirely
  // off-screen. A host that drags the surface IN (the menu drawer's opening
  // pan) needs it as the starting offset; taking it from here keeps one
  // definition of "gone" for both directions.
  screenSpan: number
  // True ONLY once a release committed and the surface is riding off-screen
  // (set in onEnd, cleared on the next onStart). Never set by 'snapBack'.
  slidOut: SharedValue<boolean>
}
// Threshold + flick are object-owned constants (PULL_COMMIT_FRACTION,
// SWIPE_DISMISS_VELOCITY) so no caller can desync them.
export function usePullBehavior(opts: {
  activation: PullActivation
  enabled: boolean
  onCommit: () => void
  /** What crossing the threshold does. Defaults to 'slideOff'. */
  commit?: PullCommit
  /** Which way the surface is dragged away. Defaults to 'y'. 'x' is only
   *  meaningful with activation 'sheet' (the menu drawer). */
  axis?: PullAxis
  headerBottom?: SharedValue<number>
  tutorial?: { ready: boolean; seenFlag: string; peek?: SharedValue<number> }
}): PullBehavior {
  const { activation, enabled, onCommit, commit: commitMode = 'slideOff', axis = 'y', headerBottom, tutorial } = opts
  const { height: screenH, width: screenW } = Dimensions.get('window')
  // The surface leaves along its own axis, so the travel it must cover to be
  // gone (and the fraction of it that commits) is measured on that axis.
  const screenSpan = axis === 'x' ? screenW : screenH
  const commitDistance = screenSpan * PULL_COMMIT_FRACTION

  const pullY = useSharedValue(0)
  // Last vertical finger velocity seen during a drag — captured every frame in
  // onUpdate so the release snap-back (in onFinalize, which has no gesture
  // event) can seed its spring with it and continue the finger's motion.
  const pullVelocity = useSharedValue(0)
  const engaged = useSharedValue(false)
  const slidOut = useSharedValue(false)
  const scrollOnly = useSharedValue(false)
  const scrollAtTopSV = useSharedValue(true)
  const swipeStart = useSharedValue({ x: 0, y: 0 })
  // Sheet only: latched true once manualActivation fires, so onTouchesMove
  // stops re-arbitrating (and can't fail/cancel) mid-drag — the pan then
  // tracks the finger continuously instead of snapping back when the inner
  // scroll briefly reports not-at-top.
  const activated = useSharedValue(false)
  const [pulling, setPulling] = useState(false)
  const panRef = useRef<GestureType>(undefined as unknown as GestureType)

  const setScrollAtTop = useCallback((v: boolean) => { scrollAtTopSV.value = v }, [scrollAtTopSV])
  // Return the pull behavior fully to rest. Clearing `slidOut` is essential: a
  // button skip (`commit`) latches it true to block a double-fire during the
  // ride-off, but — unlike a swipe (gesture `onStart` resets it) — nothing else
  // clears it. Without this the second "not now" tap hits the `commit` guard and
  // no-ops; the button works exactly once. An overlay sheet ALSO calls this on
  // every open: a 'slideOff' close leaves pullY parked at screenH, so a sheet
  // that reopened without the reset would mount already translated off-screen.
  const reset = useCallback(() => { pullY.value = 0; slidOut.value = false }, [pullY, slidOut])
  // Programmatic commit — the EXACT ride-off the gesture's onEnd performs
  // once the finger crossed commitDistance, so a BUTTON ("not now") skips
  // with the IDENTICAL motion as a swipe (user: "tapping the skip button
  // must drop the card like a swipe"). slidOut ⇒ the page1 promote reaction
  // fires when the ride reaches the bottom; onCommit runs the skip itself.
  // Guarded: scrollPan only, enabled only, no-op while already sliding.
  const commit = useCallback(() => {
    if (activation !== 'scrollPan' || !enabled || slidOut.value) return
    slidOut.value = true
    pullY.value = withTiming(screenH, { easing: Easing.out(Easing.cubic) })
    onCommit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation, enabled, onCommit, screenH])

  // Called unconditionally (rules of hooks); only handed out for scrollPan.
  const ctx = usePullCtx(panRef, scrollAtTopSV, pulling, engaged, pullY)
  const pullCtx = activation === 'scrollPan' ? ctx : undefined

  // First-time tutorial: choreography + once-ever trigger.
  const [tutorialPlaying, setTutorialPlaying] = useState(false)
  const tutorialTriggeredRef = useRef(false)
  const tutorialPeek = tutorial?.peek
  const playTutorial = useCallback(() => {
    // Peek so the descending card's top edge lands on the pause-icon centre
    // (measured into `tutorial.peek`). The tutorial drives `pullY` directly,
    // not through the gesture's onEnd, so this never commits a real skip
    // however deep it goes. Falls back to a fixed fraction until measured.
    const measured = tutorialPeek?.value ?? 0
    const peek = measured > 0 ? measured : screenH * 0.45
    setPulling(true)
    const finish = () => { setPulling(false); setTutorialPlaying(false) }
    pullY.value = withSequence(
      withTiming(peek),
      withDelay(PULL_TUTORIAL_HOLD_MS, withTiming(0, undefined, finished => {
        'worklet'
        if (finished) runOnJS(finish)()
      })),
    )
  }, [pullY, screenH, tutorialPeek])
  const tutorialReady = tutorial?.ready ?? false
  const tutorialSeenFlag = tutorial?.seenFlag
  useEffect(() => {
    if (!tutorialSeenFlag) return
    if (tutorialTriggeredRef.current) return
    if (!tutorialReady) return
    tutorialTriggeredRef.current = true
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    ;(async () => {
      try {
        if (await hasSeenFlag(tutorialSeenFlag)) return
        if (cancelled) return
        // Persist immediately so it plays once per user, ever.
        await markSeenFlag(tutorialSeenFlag)
        if (cancelled) return
        // Wait out the card's SlideInDown before the demo so they don't fight.
        timer = setTimeout(() => {
          if (cancelled) return
          setTutorialPlaying(true)
          playTutorial()
        }, PULL_TUTORIAL_START_DELAY_MS)
      } catch {}
    })()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [tutorialReady, tutorialSeenFlag, playTutorial])

  const gestureEnabled = enabled && !tutorialPlaying

  const gesture = useMemo(() => {
    if (activation === 'sheet') {
      return Gesture.Pan()
        .withRef(panRef)
        .enabled(gestureEnabled)
        .manualActivation(true)
        .onTouchesDown(e => {
          'worklet'
          activated.value = false
          const tch = e.allTouches[0]
          if (tch) swipeStart.value = { x: tch.absoluteX, y: tch.absoluteY }
        })
        .onTouchesMove((e, manager) => {
          'worklet'
          // Once we own the gesture, never re-arbitrate — onUpdate keeps
          // tracking the finger continuously (no mid-drag fail/snap-back
          // when the inner scroll momentarily reports not-at-top).
          if (activated.value) return
          const tch = e.allTouches[0]
          if (!tch) return
          const dx = tch.absoluteX - swipeStart.value.x
          const dy = tch.absoluteY - swipeStart.value.y
          if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
          if (axis === 'x') {
            // No scrollAtTop gate here: a horizontal drag never competes with
            // a vertical scroll, so the body scrolls freely at any offset and
            // only a sideways-dominant drag takes the surface.
            const toward = dx * AXIS_X_SIGN
            if (toward > 0 && Math.abs(dx) > Math.abs(dy) * 0.8) { activated.value = true; manager.activate(); return }
            manager.fail()
            return
          }
          const inHeader = headerBottom ? swipeStart.value.y <= headerBottom.value : false
          if (!scrollAtTopSV.value && !inHeader) { manager.fail(); return }
          if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8) { activated.value = true; manager.activate(); return }
          manager.fail()
        })
        .onUpdate(e => {
          'worklet'
          const drag = axis === 'x' ? e.translationX * AXIS_X_SIGN : e.translationY
          if (drag <= 0) return
          pullY.value = drag
          if (!engaged.value) { engaged.value = true; runOnJS(setPulling)(true) }
        })
        .onEnd(e => {
          'worklet'
          const travel = axis === 'x' ? e.translationX * AXIS_X_SIGN : e.translationY
          const speed = axis === 'x' ? e.velocityX * AXIS_X_SIGN : e.velocityY
          const past = travel >= commitDistance
          const flick = speed > SWIPE_DISMISS_VELOCITY
          if (past || flick) {
            if (commitMode === 'snapBack') {
              // The surface STAYS. Fire the request, spring home.
              runOnJS(onCommit)()
              pullY.value = withTiming(0)
            } else {
              // Uniform commit motion: ride off-screen, then onCommit.
              slidOut.value = true
              pullY.value = withTiming(screenSpan)
              runOnJS(onCommit)()
            }
          } else {
            pullY.value = withTiming(0)
          }
          if (engaged.value) { engaged.value = false; runOnJS(setPulling)(false) }
        })
    }
    // 'scrollPan' — page1 skip / invite decline.
    return Gesture.Pan()
      .withRef(panRef)
      .enabled(gestureEnabled)
      .activeOffsetY(4)
      .failOffsetX([-25, 25])
      .onStart(() => {
        'worklet'
        pullY.value = 0
        pullVelocity.value = 0
        slidOut.value = false
        engaged.value = false
        // Scroll always wins: a gesture that began below the top is
        // committed to scrolling only for its lifetime.
        scrollOnly.value = !scrollAtTopSV.value
      })
      .onUpdate(e => {
        'worklet'
        if (scrollOnly.value) { pullY.value = 0; return }
        const raw = Math.max(0, e.translationY)
        pullVelocity.value = e.velocityY
        // NO resistance: the card tracks the finger 1:1 (user: "no
        // resistance, the card slides directly with the finger"). The only
        // guard against an accidental skip is the commit GATE in onEnd
        // (finger travel ≥ commitDistance, speed-independent — see there);
        // a short drag moves the card 1:1 but snaps back on release.
        pullY.value = raw
        if (raw > 0 && !engaged.value) { engaged.value = true; runOnJS(setPulling)(true) }
      })
      .onEnd(e => {
        'worklet'
        if (scrollOnly.value) return
        // Commit ONLY when the finger (and thus the 1:1 card) crossed
        // commitDistance (~half screen). Speed-INDEPENDENT: there is NO
        // velocity flick — a fast swipe that didn't pass half never skips
        // (user: "regardless of swipe speed, only if the finger and the
        // card together passed the half"). Released short of half ⇒ the
        // card snaps back (onFinalize).
        if (Math.max(0, e.translationY) >= commitDistance) {
          if (commitMode === 'snapBack') {
            // The card STAYS (the invite decline opens a confirm dialog over
            // it). Fire the request; onFinalize springs the card home because
            // slidOut was deliberately not latched.
            runOnJS(onCommit)()
            return
          }
          // Ride off-screen on the UI thread immediately, then fire onCommit
          // right away (NOT deferred until the ride finishes). Deferring it
          // pushed the old card's unmount/SlideOutDown to overlap the next
          // card's mount, which made Reanimated intermittently drop the new
          // card's entering — "a card appears suddenly without a rise". This
          // is the proven, reliable timing; the small fall-motion polish is
          // sacrificed for a card that always animates in. The ride-off uses
          // an ease-OUT (fast start) so it continues the finger's downward
          // motion instead of easing in from a dead stop — onCommit still
          // fires immediately, so the reliable mount timing is untouched.
          slidOut.value = true
          pullY.value = withTiming(screenH, { easing: Easing.out(Easing.cubic) })
          runOnJS(onCommit)()
        }
      })
      .onFinalize(() => {
        'worklet'
        // Released short of commit → spring back to rest, seeded with the
        // finger's last velocity (captured in onUpdate) so the card carries
        // the drag's momentum into the snap-back instead of jerking to a stop
        // then easing in. Critically damped → smooth, no bounce.
        if (!slidOut.value) {
          pullY.value = withSpring(0, { velocity: pullVelocity.value, ...PULL_SNAP_SPRING })
        }
        if (engaged.value) { engaged.value = false; runOnJS(setPulling)(false) }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation, gestureEnabled, commitMode, axis, commitDistance, screenSpan, screenH, onCommit, headerBottom])

  return { gesture, pullY, pulling, pullCtx, panRef, setScrollAtTop, reset, commit, tutorialPlaying, commitDistance, screenSpan, slidOut }
}
