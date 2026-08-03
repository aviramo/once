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
import { View, StyleSheet, Dimensions, Keyboard, type ScrollViewProps, type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, ScrollView, type GestureType, type ComposedGesture } from 'react-native-gesture-handler'
import type { NativeViewGestureHandlerProps } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useAnimatedRef, useDerivedValue, scrollTo, withTiming, withSpring, withSequence, withDelay,
  Easing, runOnJS, type SharedValue,
} from 'react-native-reanimated'
import {
  PULL_COMMIT_FRACTION, PULL_CLOSE_FRACTION, PULL_SNAP_SPRING, SWIPE_DISMISS_VELOCITY, SCROLL_AT_TOP_PX,
  PULL_TUTORIAL_START_DELAY_MS, PULL_TUTORIAL_HOLD_MS,
} from '../tokens'
import { hasSeenFlag, markSeenFlag } from '../lib/seenFlags'

// (`PullAxis` stood here — 'y' | 'x'. A surface leaves DOWNWARD, and that is
// the only direction there is: the sideways drawer was the one 'x' call site
// and was deleted 2026-07-30, leaving an axis nothing asked for threaded
// through the gesture, the transform, the entrance and the header's glyph. It
// is gone with the rest of the merge, 2026-08-03.)

// The motion a COMMITTED pull rides off on. Ease-OUT (fast start) so the
// surface continues the finger's travel instead of easing in from a dead stop
// — a release that pauses before the slide is exactly what reads as a stutter.
// One object, shared by the gesture's onEnd and the programmatic `commit`, so a
// button and a swipe can never drift apart.
const RIDE_OFF = { easing: Easing.out(Easing.cubic) } as const

// ── Context for pull gesture ─────────────────────────────────────────────────

/** WHAT THE INNER SCROLL CAN STILL GIVE — stated as the scroll's own geometry,
 *  never as a verdict somebody computed and sent.
 *
 *  This replaced a boolean (`scrollAtTop`) that six different places had to
 *  remember to keep true: five listeners in PullScrollView each correcting
 *  another's report, a seed on every sheet open, a bespoke box measurement in
 *  chat, and a hand-off between stacked Circles layers. Every swipe bug of
 *  2026-08-03 was that bookkeeping being wrong rather than the gesture being
 *  wrong — a measurement taken from the wrong event, a seed landing on top of a
 *  report, a report that never came because a short list fires no events.
 *
 *  Geometry cannot be out of date in that way: these are the numbers the scroll
 *  itself last stated about itself, and the question ("has it nothing left to
 *  give a downward finger?") is asked where the answer is used — inside the
 *  gesture's own worklet, on the frame it decides. Nothing to seed, nothing to
 *  re-assert, nothing to hand over. */
export type ScrollReach = {
  /** The scroll's current offset. */
  offset: SharedValue<number>
  /** The largest offset its content allows: contentH - layoutH, floored at 0.
   *  Zero means the content fits, i.e. there is nothing to scroll at all. */
  max: SharedValue<number>
  /** The list is upside down (chat's message list, the app's only one), so a
   *  DOWNWARD finger runs its offset UP and "nothing left" is the far end. */
  inverted: SharedValue<boolean>
  /** A scroll surface has claimed this pull. False = the body cannot scroll at
   *  all (a plain sheet, a card), so the pull is free to take every drag. */
  present: SharedValue<boolean>
}

/** Has the inner scroll nothing left to give a DOWNWARD drag? The one place
 *  this is decided, read straight off the geometry above. */
export function scrollExhausted(reach: ScrollReach): boolean {
  'worklet'
  if (!reach.present.value) return true
  return reach.inverted.value
    ? reach.offset.value >= reach.max.value - SCROLL_AT_TOP_PX
    : reach.offset.value <= SCROLL_AT_TOP_PX
}

/** One reach per pull. Built here so a surface with no scrolling body still has
 *  something to answer with — `present: false`, i.e. nothing to compete with. */
export function useScrollReach(): ScrollReach {
  const offset = useSharedValue(0)
  const max = useSharedValue(0)
  const inverted = useSharedValue(false)
  const present = useSharedValue(false)
  return useMemo(() => ({ offset, max, inverted, present }), [offset, max, inverted, present])
}

export type PullCtx = {
  panRef: React.MutableRefObject<GestureType | undefined>
  extraRefs: React.MutableRefObject<GestureType | undefined>[]
  /** The scroll inside this surface reports its geometry here. */
  reach: ScrollReach
  // UI-thread flag, true while the pull pan is actively engaged in a drag.
  // THE single "a pull is happening" signal (see PullScrollView / MatchCard).
  //
  // It is a shared value, deliberately, and never a React boolean threaded
  // down from the surface. A `pulling` prop had to re-render the whole page —
  // its header, its lists, every row — on the very frame the drag engaged and
  // again on release, and that commit landing on top of a running gesture is
  // what made a swipe-close stutter. NOTHING turns it back into state any more:
  // PullScrollView was the one component that did, to drop `scrollEnabled`, and
  // that native prop change committed mid-touch is what jolted a swipe-down on
  // iOS (see the pin there). It holds its offset from the UI thread instead.
  pullEngaged: SharedValue<boolean>
  // Live pull offset (the card's translateY). The inner scroll pin worklet
  // reads it purely so Reanimated re-runs that worklet on every frame of a
  // pull — `pullEngaged` alone flips once and would not keep the pin ticking.
  pullY?: SharedValue<number>
}
export const PullContext = createContext<PullCtx | null>(null)

/** ScrollView that negotiates with the surface's pull gesture.
 *  - simultaneousHandlers: lets scroll and pan coexist while idle.
 *  - the content is PINNED where it stood while the pan is engaged in a pull, so
 *    a finger that reverses upward mid-pull brings the surface back instead of
 *    leaving it stuck while the inner content scrolls. From the UI thread, never
 *    by dropping `scrollEnabled` — see the pin.
 *  - reports its own GEOMETRY into the pull's ScrollReach. See that type: it
 *    states where the scroll is, never whether the pull may have the drag. */
export const PullScrollView = forwardRef<any, ScrollViewProps & NativeViewGestureHandlerProps & {
  /** The list is upside down (chat's message list, the app's only one). */
  inverted?: boolean
}>(
  (props, ref) => {
    const ctx = useContext(PullContext)
    const { onScroll, onContentSizeChange, onLayout, inverted, scrollEnabled, ...rest } = props
    // Our own handle on the scroll, alongside whatever the caller asked for:
    // the pull's pin drives it from a worklet, every frame. Hence an animated
    // ref and a shared-value offset.
    const scrollRef = useAnimatedRef<any>()
    const scrollOffsetSV = useSharedValue(0)
    const setRef = useCallback((node: any) => {
      scrollRef(node)
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<any>).current = node
    }, [ref, scrollRef])
    // NO KEYBOARD REVEAL. This used to carry the app-wide "keep the field you
    // are typing in on screen" ride (`useKeyboardReveal`), which scrolled the
    // surface under the focused field as the keyboard came up. It is DELETED
    // (user directive 2026-08-03): the page shrinking to the keyboard is the
    // whole of what the app does about a keyboard, and a page that also moved
    // itself under the finger read as the field playing with the scroll. A
    // field low on a shorter page is reached by scrolling to it — which is
    // always allowed, since scrolling never ends an edit.

    // ── Reporting the geometry ────────────────────────────────────────────
    // THIS SCROLL IS THE ONE THE PULL IS COMPETING WITH, for as long as it is
    // mounted. Claimed here rather than seeded by the surface, so a body that
    // scrolls and one that cannot are told apart by what is actually on screen.
    const reach = ctx?.reach
    // The two halves of "how far can it go" arrive in separate events, so each
    // is kept and `max` is recomputed from the pair. Refs, not state: geometry
    // moving must never re-render a page.
    const layoutH = useRef(0)
    const contentH = useRef(0)
    const publish = useCallback(() => {
      if (!reach) return
      reach.max.value = Math.max(0, contentH.current - layoutH.current)
      reach.present.value = true
    }, [reach])
    useEffect(() => {
      if (!reach) return
      // Until it has measured, a scroll has nothing to give: max 0 at offset 0
      // is "the content fits", which is also the honest reading of a list that
      // has not laid out yet — and it is the SAFE one, since it hands the drag
      // to the pull rather than to a scroll that cannot move.
      reach.present.value = true
      reach.offset.value = 0
      reach.max.value = 0
      return () => { reach.present.value = false }
    }, [reach])
    useEffect(() => {
      if (reach) reach.inverted.value = !!inverted
    }, [reach, inverted])
    // One listener. A scroll event carries all three numbers at once, which is
    // why the five that stood here — begin-drag, end-drag, momentum begin,
    // momentum end, content-size — are gone along with the momentum latch they
    // existed to repair: there is no verdict left to be stale, so there is
    // nothing to correct after the fact.
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const ne = e.nativeEvent
      scrollOffsetSV.value = ne.contentOffset.y
      if (reach) {
        reach.offset.value = ne.contentOffset.y
        if (ne.layoutMeasurement) layoutH.current = ne.layoutMeasurement.height
        if (ne.contentSize) contentH.current = ne.contentSize.height
        publish()
      }
      onScroll?.(e)
    }, [onScroll, publish, reach, scrollOffsetSV])
    // Measured on the SCROLL VIEW ITSELF and never on a list wrapped around it:
    // a FlatList hands the onLayout it is given to more than its own box, and
    // the inner one — reported as a 222dp box holding 835dp of content — is what
    // made chat's swipe-close refuse for the rest of its life (2026-08-03).
    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      layoutH.current = e.nativeEvent.layout.height
      publish()
      onLayout?.(e)
    }, [onLayout, publish])
    const handleContentSizeChange = useCallback((w: number, h: number) => {
      contentH.current = h
      publish()
      onContentSizeChange?.(w, h)
    }, [onContentSizeChange, publish])

    // THE CONTENT IS HELD WHERE IT WAS FOR AS LONG AS THE PULL IS ENGAGED, so a
    // finger that reverses upward mid-pull brings the surface back instead of
    // leaving it stuck while the content scrolls under it.
    //
    // IT IS A PIN ON THE UI THREAD, NEVER A `scrollEnabled` FLIP (user report,
    // iPhone 2026-08-03: a swipe-down on the profile preview rose a little way
    // back up a few frames in, then carried on following the finger). Dropping
    // `scrollEnabled` is a NATIVE PROP CHANGE COMMITTED MID-TOUCH, and on iOS
    // setting `scrollEnabled = NO` on a scroll view that is currently tracking
    // cancels the touch it is tracking — which cancels the pan running
    // simultaneously with it. A cancelled pan is `onFinalize`, i.e. the
    // velocity-seeded spring back to rest; the very next touch event starts a
    // fresh pan that picks the finger up again, so the surface springs UP for a
    // few frames and then resumes the drag. Nothing was wrong with the pull, and
    // nothing about it was visible in the gesture: the JOLT WAS THE RE-RENDER.
    //
    // So the offset is simply held, from the UI thread, at whatever it was when
    // the pull took over — which is what MatchCard's own reel already does for
    // the same reason, and which no longer costs this component (the app's one
    // scroll wrapper) a render per drag. `pullY` is read for its frames: a
    // derived value re-runs when what it reads changes, and the hold has to be
    // re-asserted on every frame of the drag, not once at the start.
    const idle = useSharedValue(false)
    const engaged = ctx?.pullEngaged ?? idle
    const pullY = ctx?.pullY
    // -1 = not holding. Seeded on the first engaged frame, cleared on release.
    const holdAt = useSharedValue(-1)
    useDerivedValue(() => {
      void pullY?.value
      if (!engaged.value) { holdAt.value = -1; return }
      if (holdAt.value < 0) holdAt.value = scrollOffsetSV.value
      scrollTo(scrollRef, 0, holdAt.value, false)
    })
    return (
      <ScrollView
        // THE keyboard-dismissal rule for the whole app, declared HERE, once,
        // because this is the app's only scroll wrapper (user directive
        // 2026-07-30, replacing the `on-drag` rule of 2026-07-29):
        //
        //   SCROLLING NEVER CLOSES THE KEYBOARD. The field stays in edit mode
        //   while the user scrolls to see what is around it. ONLY A TAP OUTSIDE
        //   A TEXT BOX closes it.
        //
        // `on-drag` was the opposite, and it made a covered field unreachable:
        // the one way to bring something out from under the keyboard is to
        // scroll, and scrolling was the thing that tore the edit down (the group
        // link, 2026-07-30).
        //
        // The two props below are the two halves of that rule and belong
        // together. `keyboardShouldPersistTaps="handled"` is what makes "tap
        // outside" work: a tap a child handles (a row, a button) leaves the
        // keyboard alone, and a tap nothing handles — the background — closes
        // it. Do not set either at a call site; a surface that opted out of the
        // old rule has nothing to opt out of now.
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="handled"
        {...rest}
        ref={setRef}
        onScroll={handleScroll}
        // The geometry must be fresh on the frame the gesture reads it, and RN's
        // default is to report a scroll only when it ends.
        scrollEventThrottle={16}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        nestedScrollEnabled
        simultaneousHandlers={ctx ? [ctx.panRef, ...ctx.extraRefs].filter(r => r.current) : undefined}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={scrollEnabled}
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
  leaving,
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
  /** A SURFACE THAT IS LEAVING IS ALREADY GONE, AS FAR AS THE FINGER IS
   *  CONCERNED. The ride-off is an animation, not a state the user is in: the
   *  decision was taken at the release, and for the whole of the fall this pane
   *  still lay over the page underneath and swallowed every touch — so choosing
   *  another circle straight after swiping one away did nothing until the old
   *  page had finished landing. Handed the behaviour's own `leaving`, which is
   *  true only while the surface is travelling out with no finger on it, so
   *  nothing about a live drag is affected (the gesture lives INSIDE this pane
   *  and must keep its touches for as long as the finger is on it). */
  leaving?: SharedValue<boolean>
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
  // The pane's own resting policy is the caller's (`box-none` for a sheet, so
  // its siblings stay reachable). Riding off overrides it and nothing else does
  // — stated in the STYLE rather than the prop so it can be written from the UI
  // thread: a React re-render on the frame a commit lands is the very stutter
  // the engaged flag exists to avoid.
  const restingPointerEvents = pointerEvents ?? 'auto'
  const outerTopStyle = useAnimatedStyle(() => ({
    top: topAnchor ? topAnchor.value : 0,
  }))
  // As a PROP, not a style key: `pointerEvents` in a style is accepted by the
  // types and silently never reaches the native view from a worklet — the pane
  // went on swallowing every touch for the whole of its fall, which is the
  // "I tapped while the old page was coming down and nothing happened" (the
  // stack log showed each push landing only AFTER the pop).
  const outerPointerEvents = useAnimatedProps(() => ({
    pointerEvents: (leaving?.value ? 'none' : restingPointerEvents) as 'none' | 'auto' | 'box-none' | 'box-only',
  }))
  // `pullY` is the drag MAGNITUDE, always >= 0: the surface travels DOWN and
  // there is no other direction. Clamped at 0 because the velocity-seeded
  // snap-back spring can undershoot past rest when a fast drag is released back
  // toward it, and an overshoot would lift a full-screen sheet off its own top
  // edge and flash whatever sits behind it.
  const cardTranslate = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, pullY.value) }],
  }))
  // AN EMPTY PULL SURFACE IS NOT A SURFACE, AND MAY NOT TAKE A SINGLE TOUCH.
  // The card wrapper is `flex: 1` and carries the pan, so with no children it
  // is a full-pane, invisible, perfectly interactive sheet of nothing — and it
  // is rendered OVER whatever the host put behind it. That is what ate home's
  // centre PAUSE button while page1 was `watching` with its card not on screen
  // (a skip mid-flight, a promote the pause aborted): the tap landed on this,
  // so the button did not even flash its press state, let alone stop the
  // search. The host's own `pointerEvents` is on the OUTER view and cannot
  // reach in here. Nothing to drag, nothing to press: 'none'.
  const empty = children === null || children === undefined || children === false
  const card = (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[pullPaneStyles.card, cardStyle, cardStatic ? undefined : cardTranslate]}
        collapsable={false}
        pointerEvents={empty ? 'none' : undefined}
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
      animatedProps={outerPointerEvents}
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
// context binds a specific panRef + scroll reach + engaged flag, none
// of which are safe to alias across two GestureDetector trees. They can't be
// one instance, but the *shape* is identical, so the construction lives here
// once instead of being hand-rolled per surface.
export function usePullCtx(
  panRef: React.MutableRefObject<GestureType | undefined>,
  reach: ScrollReach,
  engaged: SharedValue<boolean>,
  pullY: SharedValue<number>,
): PullCtx {
  return useMemo(
    () => ({
      panRef,
      extraRefs: [],
      reach,
      pullEngaged: engaged,
      pullY,
    }),
    // Every member is stable (useRef / useSharedValue), so the context value is
    // built ONCE and never changes identity. Nothing below a pull surface
    // re-renders because a drag started or ended — see PullCtx.pullEngaged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}

// ── usePullBehavior ──────────────────────────────────────────────────────
//
// THE single source of "pull a surface down" behaviour. It owns everything
// that would otherwise be hand-rolled per screen:
//   • the drag shared value + the `pullEngaged` engage/disengage flag (and, for
//     the one caller that asks, its JS-thread `pulling` mirror — see
//     PullBehavior);
//   • the Pan gesture itself — ONE strategy for every surface in the app
//     (user directive 2026-08-03): manualActivation, the inner scroll first and
//     the surface picked up mid-gesture where that scroll runs out, plus a
//     PullContext so the two can find each other;
//   • tracking is 1:1 — the surface follows the finger exactly, NO resistance
//     (user: "the card slides directly with the finger"). The only thing that
//     differs between surfaces is the commit GATE, and that is the `weight`'s:
//     a 'decide' pull needs half the screen and ignores speed, a 'close' pull a
//     tenth of it or a flick. See PullWeight;
//   • what crossing the commit threshold DOES, via `commit`:
//       'slideOff' (default) = ride the surface off-screen, then onCommit.
//                              The surface is going away (skip / close).
//       'snapBack'           = onCommit FIRST, then spring back to rest. The
//                              surface stays; onCommit is a *request* whose
//                              handler decides (the invite's decline confirm
//                              dialog opens over a card that springs home).
//     'snapBack' never travels far enough to read as `leaving`, so the
//     promote/unmount reactions don't fire for a request that may be cancelled;
//   • the snap-back animation when released short of commit;
//   • the first-time tutorial: the peek->hold->return choreography AND its
//     once-ever trigger policy (seenFlags gate + post-mount delay), exposing
//     `tutorialPlaying` so the frame can lock input while it plays.
// Each <PullPane> call site calls this once, so simultaneously-mountable
// surfaces still get independent instances (see usePullCtx).
// (`PullActivation` stood here — 'scrollPan' | 'sheet'. THERE IS ONE
// ARBITRATION NOW, and it is the sheet's (user directive 2026-08-03: "one
// mechanism for all of them, based on what works in a circle page"). See the
// gesture below for what the second one did and why nothing wants it.)
export type PullCommit = 'slideOff' | 'snapBack'
/** WHAT LETTING GO DOES, which is the only thing that decides how far the
 *  finger must travel and whether speed counts.
 *
 *  'close'  (default) — the surface goes away, or asks a cancellable question,
 *           and nothing is answered by the release itself. A TENTH of the
 *           screen, or a flick. Every sheet (the invitation included), every
 *           Circles page, chat, and every state of home's card but the skip.
 *           Putting a page away is reversible, so it costs what putting a
 *           popup away costs; anything dearer reads as the surface insisting on
 *           springing back rather than as a guard (user report 2026-08-03).
 *  'decide' — THE ONE CALL SITE: page1's WATCHING card, whose release ignores
 *           this person and draws another with no dialog in between. HALF the
 *           screen and NO flick, so a fast swipe that did not pass the half
 *           never decides anything. Nothing else in the app may state it.
 *
 *  Deliberately not derived from `commit`: page1's skip is a 'slideOff' that
 *  decides and a card that is over is a 'slideOff' that only closes, while the
 *  invitation's 'snapBack' merely ASKS. Only the call site knows which of the
 *  two its pull is. */
export type PullWeight = 'close' | 'decide'
export type PullBehavior = {
  gesture: GestureType
  pullY: SharedValue<number>
  /** JS-thread mirror of `pullEngaged`, for a consumer that genuinely needs a
   *  RENDER when a drag starts or ends — page1's name-slide choreography is the
   *  only one, and it is the only caller that may ask for it (`reportPulling`).
   *  Nothing else may: a drag must never re-render the surface it is dragging
   *  (see PullCtx.pullEngaged). Anything that merely needs to KNOW should read
   *  `pullEngaged` from a worklet instead. */
  pulling: boolean
  /** True on the UI thread for the length of a drag. THE signal to share. */
  pullEngaged: SharedValue<boolean>
  /** Always present: every surface's inner scroll and its pull have to be able
   *  to find each other. It used to be handed out for one activation only. */
  pullCtx: PullCtx
  panRef: React.MutableRefObject<GestureType | undefined>
  /** The geometry of whatever scroll is competing with this pull. A body that
   *  scrolls reports into it (PullScrollView); a surface with no scroll leaves
   *  it empty, which reads as "nothing can take this drag but me". */
  reach: ScrollReach
  /** ARMED. False suspends the pull entirely for as long as it is false — the
   *  chat lightbox, whose one-finger drag pans a ZOOMED image instead of
   *  closing it. Deliberately not part of `reach`: it is not a fact about a
   *  scroll, it is the surface saying the drag is spoken for. */
  armed: SharedValue<boolean>
  reset: () => void
  // Programmatic ride-off skip (button parity with the swipe). See usage.
  commit: () => void
  tutorialPlaying: boolean
  // The single commit distance (px) every consumer must share.
  commitDistance: number
  // Full travel — the pullY at which the surface is entirely
  // off-screen. A host that drags the surface IN (the menu drawer's opening
  // pan) needs it as the starting offset; taking it from here keeps one
  // definition of "gone" for both directions.
  screenSpan: number
  /** THE SURFACE IS ON ITS WAY OUT: past the commit gate with no finger on it.
   *  Derived every frame from the drag itself, so it cannot be left set — see
   *  the note at its declaration. A 'snapBack' never reaches it. */
  leaving: SharedValue<boolean>
}
// Threshold + flick are object-owned constants (PULL_COMMIT_FRACTION,
// SWIPE_DISMISS_VELOCITY) so no caller can desync them.
export function usePullBehavior(opts: {
  enabled: boolean
  onCommit: () => void
  /** What crossing the threshold does. Defaults to 'slideOff'. */
  commit?: PullCommit
  /** What letting go MEANS. Defaults to 'close'. See PullWeight. */
  weight?: PullWeight
  /** Maintain the JS-thread `pulling` mirror. ONE caller (page1's name-slide);
   *  see PullBehavior.pulling. */
  reportPulling?: boolean
  /** Bottom edge (window Y) of the band a drag may start in and take the
   *  surface from, whatever the inner scroll is doing.
   *
   *  IRON RULE: THE INNER SCROLL ALWAYS OUTRANKS THE PULL. This band may only
   *  ever cover chrome that cannot scroll — a solid title bar, a fixed head
   *  above a list. Never a header that FLOATS over scrollable content, and
   *  never a slice of the scroll itself: if a finger could have scrolled there,
   *  scrolling is what it does. The pull takes over only where the scroll has
   *  nothing left to give, and it does so mid-gesture (see `scrollSpent`), so
   *  nothing is lost by keeping the band honest. */
  headerBottom?: SharedValue<number>
  tutorial?: { ready: boolean; seenFlag: string; peek?: SharedValue<number> }
}): PullBehavior {
  const { enabled, onCommit, commit: commitMode = 'slideOff', weight = 'close', headerBottom, reportPulling = false, tutorial } = opts
  const { height: screenH } = Dimensions.get('window')
  // The travel a surface must cover to be gone, and the fraction of it that
  // commits: it leaves off the bottom, so both are measured down the screen.
  const screenSpan = screenH
  // The gate is the WEIGHT's, never the activation's: how far a finger must
  // carry a surface, and whether a flick counts, is a question about what
  // letting go does — see PullWeight.
  const deciding = weight === 'decide'
  const commitDistance = screenSpan * (deciding ? PULL_COMMIT_FRACTION : PULL_CLOSE_FRACTION)

  const pullY = useSharedValue(0)
  // Last vertical finger velocity seen during a drag — captured every frame in
  // onUpdate so the release snap-back (in onFinalize, which has no gesture
  // event) can seed its spring with it and continue the finger's motion.
  const pullVelocity = useSharedValue(0)
  const engaged = useSharedValue(false)
  const reach = useScrollReach()
  const armed = useSharedValue(true)
  const swipeStart = useSharedValue({ x: 0, y: 0 })
  // Sheet only: latched true once manualActivation fires, so onTouchesMove
  // stops re-arbitrating (and can't fail/cancel) mid-drag — the pan then
  // tracks the finger continuously instead of snapping back when the inner
  // scroll briefly reports not-at-top.
  const activated = useSharedValue(false)
  // Sheet only: where the PULL is measured from, and how much of the finger's
  // travel was spent scrolling before it. A drag that begins mid-list scrolls
  // the list to its top and only THEN takes the surface (user directive
  // 2026-07-27), so the two cannot be the same point: without this the pull
  // would open by everything the finger already spent on the list.
  const dragOrigin = useSharedValue({ x: 0, y: 0 })
  /** How much of this touch's travel was spent before the PULL took over — the
   *  inner scroll the finger ran to its top, plus whatever slop the arbitration
   *  needed. Both activations charge it, so the card always opens from where
   *  the finger IS and the commit gate always measures what the SURFACE moved. */
  const pullBase = useSharedValue(0)
  // Sheet only: does the inner scroll currently have nothing left to give
  // (at its top, or the touch landed on chrome that never scrolls)? Not a
  // touch-down latch: it flips both ways during a drag, and the frame it turns
  // ON is where the pull re-origins.
  const scrollSpent = useSharedValue(false)
  // Sheet only: did the inner scroll take any of THIS touch's travel? It is the
  // one thing that entitles the arbitration to move the pull's origin — see the
  // re-origin in onTouchesMove. Cleared at touch-down, never latched across
  // touches.
  const scrollTook = useSharedValue(false)
  const [pulling, setPulling] = useState(false)
  const panRef = useRef<GestureType>(undefined as unknown as GestureType)

  // THE SURFACE IS LEAVING — DERIVED FROM THE MOTION, NEVER LATCHED (user
  // directive 2026-08-03: "slidOut — I don't think it should be used"). It was a
  // flag set at a committed release and cleared only by the NEXT touch-down, and
  // the pane it drives takes no touches while it is true — so a pane that was
  // left holding it could never be touched down on to clear it. That is a
  // surface that has stopped answering the finger for good, and it is what the
  // invitation did: it rides off, `onClose` posts, and the server writes a
  // DIFFERENT page2 card into the same still-open sheet.
  //
  // The same fact read off the two values that already describe the drag: the
  // surface is past the commit gate and NO finger is on it, i.e. it is moving on
  // its own, away from rest. It cannot stick — the moment the surface is back at
  // rest, or a finger owns it again, it is false by arithmetic — and it needs no
  // clearing anywhere. A snap-back is excluded by construction: a release short
  // of the gate never reaches this distance, and one past it committed.
  const leaving = useDerivedValue(() => !engaged.value && pullY.value >= commitDistance)
  // Return the pull behavior fully to rest. An overlay sheet calls it on every
  // open: a committed close leaves pullY parked at screenSpan, so a sheet that
  // reopened without the reset would mount already translated off-screen.
  const reset = useCallback(() => { pullY.value = 0 }, [pullY])
  // Programmatic commit — the EXACT ride-off the gesture's onEnd performs
  // once the finger crossed commitDistance, so a BUTTON skips or closes with
  // the IDENTICAL motion as a swipe (user: "tapping the skip button must drop
  // the card like a swipe"; and 2026-07-27: a page closed by its back control
  // must slide down as though the manual pull carried on). onCommit runs the
  // skip / close itself.
  // Guarded: enabled only, no-op while the surface is already on its way out.
  const commit = useCallback(() => {
    if (!enabled || leaving.value) return
    pullY.value = withTiming(screenSpan, RIDE_OFF)
    onCommit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onCommit, screenSpan])

  // EVERY surface gets one: the pull and whatever scrolls inside it have to be
  // able to find each other, and a body that scrolls is now the ordinary case
  // (a card's photo reel as much as a roster). It used to be handed out for
  // 'scrollPan' alone, so a card under a SHEET reported nothing and shared no
  // handler — the reel and the dismiss pan each took half the finger.
  const pullCtx = usePullCtx(panRef, reach, engaged, pullY)

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

  // ONE GESTURE FOR EVERY SURFACE THAT IS DRAGGED AWAY (user directive
  // 2026-08-03). A second strategy stood beside this one — 'scrollPan', an
  // auto-activating pan (activeOffsetY / failOffsetX) that ZEROED `pullY` for as
  // long as its body had anything left to scroll. It was the card surfaces'
  // (page1, the invite, my own profile, a member's page) and it is what made
  // them come down worse than a circle page: a drag on a card whose photo reel
  // was not at its top moved nothing, and the finger had to lift and start
  // again. This one hands the drag to the inner scroll first and picks it up
  // MID-GESTURE the frame the scroll runs out, re-origined to where the finger
  // IS — one drag scrolls the reel to its top and carries straight on into the
  // pull. It also never claims a TAP: manualActivation only activates on a
  // dy-dominant move past the slop, which is what let the card surfaces move
  // over here at all (the old "the button doesn't work" bug).
  // A NAMED JS CALLBACK, NEVER THE MODULE METHOD ITSELF. `runOnJS` serializes
  // what it is handed, and RN's `Keyboard.dismiss` is a native-module binding,
  // not a plain function: handing it over throws on the UI thread the frame the
  // pull activates, which on Android is a hard CRASH — every page swiped down
  // took the app with it (2026-08-03). Same rule as the note in CLAUDE.md about
  // `runOnJS(console.log)`.
  const dismissKeyboard = useCallback(() => { Keyboard.dismiss() }, [])
  const gesture = useMemo(() => {
      return Gesture.Pan()
        .withRef(panRef)
        .enabled(gestureEnabled)
        .manualActivation(true)
        .onTouchesDown(e => {
          'worklet'
          activated.value = false
          scrollSpent.value = false
          scrollTook.value = false
          pullBase.value = 0
          pullVelocity.value = 0
          const tch = e.allTouches[0]
          if (tch) {
            swipeStart.value = { x: tch.absoluteX, y: tch.absoluteY }
            dragOrigin.value = { x: tch.absoluteX, y: tch.absoluteY }
          }
        })
        .onTouchesMove((e, manager) => {
          'worklet'
          if (!armed.value) return
          // Once we own the gesture, never re-arbitrate — onUpdate keeps
          // tracking the finger continuously (no mid-drag fail/snap-back
          // when the inner scroll momentarily reports not-at-top).
          if (activated.value) return
          const tch = e.allTouches[0]
          if (!tch) return
          // The order of the two surfaces is fixed and absolute: THE INNER
          // SCROLL ALWAYS WINS, and the page pull picks up only where the
          // scroll runs out (user directive 2026-07-27, restated as the rule).
          // So "is the scroll spent?" is asked on every frame,
          // never latched at touch-down — the finger may start halfway down a
          // roster, scroll it to the top, and carry straight on into the pull
          // without ever lifting.
          const inHeader = headerBottom ? swipeStart.value.y <= headerBottom.value : false
          // THE QUESTION IS ASKED HERE, OF THE SCROLL ITSELF, ON THIS FRAME.
          // A drag that started on chrome that cannot scroll (the header band)
          // never had a competitor to begin with.
          const spent = inHeader || scrollExhausted(reach)
          if (!spent) {
            // The list still has room, so this drag is ITS drag. Deliberately
            // NOT manager.fail(): a failed gesture never comes back, and this
            // one has to be able to take over the moment the list bottoms out
            // at its top.
            scrollSpent.value = false
            scrollTook.value = true
            return
          }
          if (!scrollSpent.value) {
            scrollSpent.value = true
            // THE RE-ORIGIN IS CHARGED ONLY WHERE THE SCROLL ACTUALLY TOOK THE
            // TRAVEL. It exists for one case — a finger that began halfway down
            // a roster, scrolled it to the top and carried on — where measuring
            // from touch-down would open the pull by a whole list's worth of
            // drag. A finger that found the scroll already spent (`scrollTook`
            // never set: at the top, or on chrome that does not scroll) spent
            // NOTHING, so there is nothing to discard and no frame to wait for:
            // this very event decides.
            //
            // Costing it unconditionally is what made a swipe "sometimes not
            // work": the first touch event does not arrive at the finger's first
            // millimetre — it arrives when the UI thread gets to it, which on a
            // page still laying out its list can be 200px into the drag
            // (measured on a managed circle's roster: mv#1 landed at dy=218
            // with spent=1). Those 218px were thrown away, activation waited for
            // the NEXT event, and by the time the surface began to follow the
            // finger there was less than a commit distance of drag left in it.
            // The page snapped back and read as a swipe that did nothing.
            if (scrollTook.value) {
              dragOrigin.value = { x: tch.absoluteX, y: tch.absoluteY }
              return
            }
          }
          const dx = tch.absoluteX - dragOrigin.value.x
          const dy = tch.absoluteY - dragOrigin.value.y
          if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
          if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8) {
            activated.value = true
            // The surface opens from where the finger IS at the moment the
            // pull takes over — everything the finger spent before that (the
            // list it scrolled to its top, and the slop this arbitration needed
            // to make up its mind) is the SCROLL's travel, not the pull's.
            // Without this the surface snapped down by that whole distance on
            // its first frame, which is the jolt a swipe-close opened with.
            pullBase.value = tch.absoluteY - swipeStart.value.y
            // THE SURFACE BEING DRAGGED AWAY TAKES THE KEYBOARD WITH IT, FROM
            // THE FIRST FRAME OF THE DRAG (user directive 2026-08-03). Fired
            // exactly here, where the pull TAKES OVER — not on touch-down, which
            // is a tap or a scroll for all this arbitration knows yet, and not on
            // the commit, which would leave the keyboard standing under a page
            // that is already riding off. It does not contradict "scrolling never
            // closes the keyboard": the inner scroll still outranks the pull and
            // has already had its chance, so by this line the finger is not
            // scrolling — it is putting the surface away.
            //
            // Once per gesture by construction: `activated` latches on the next
            // line and this branch is the only thing that sets it.
            runOnJS(dismissKeyboard)()
            manager.activate()
            return
          }
          // Sideways: nobody's. Upward: the scroll's — and left UNDECIDED, not
          // failed, because the list will report not-at-top on the next frame
          // and this same touch can still come back down into a pull.
          if (Math.abs(dx) > Math.abs(dy)) manager.fail()
        })
        .onUpdate(e => {
          'worklet'
          // `pullBase` is everything the finger spent before the pull took over
          // (the inner scroll it ran to its top, plus the activation slop), so
          // the surface tracks the finger 1:1 from the point it engaged.
          const drag = e.translationY - pullBase.value
          if (drag <= 0) return
          pullY.value = drag
          // Kept for the safety snap-back in onFinalize, which has no event of
          // its own to read a release velocity from.
          pullVelocity.value = e.velocityY
          // The JS mirror is written ONLY where a caller asked for it (page1's
          // name-slide). A drag must not re-render the surface it is dragging —
          // the inner-scroll lock rides `engaged` on the UI thread instead (see
          // PullCtx.pullEngaged). Written once per drag, not per frame, so the
          // flag notifies its readers exactly twice.
          if (!engaged.value) {
            engaged.value = true
            if (reportPulling) runOnJS(setPulling)(true)
          }
        })
        .onEnd(e => {
          'worklet'
          // Measured from where the pull engaged, exactly as onUpdate draws it,
          // so the commit threshold is the distance the SURFACE moved.
          const travel = e.translationY - pullBase.value
          const speed = e.velocityY
          const past = travel >= commitDistance
          // A flick is the CLOSE weight's alone: a surface thrown away is gone,
          // a decision may never be made by speed. See PullWeight.
          const flick = !deciding && speed > SWIPE_DISMISS_VELOCITY
          // Every release CONTINUES the finger: the ride-off eases out from the
          // drag's own speed, and a snap-back is the same velocity-seeded spring
          // page1 uses. A plain `withTiming` eased IN from a dead stop, so the
          // surface hung for a beat before it moved — the release felt broken
          // even though every frame was on time.
          if (past || flick) {
            if (commitMode === 'snapBack') {
              // The surface STAYS. Fire the request, spring home.
              runOnJS(onCommit)()
              pullY.value = withSpring(0, { velocity: speed, ...PULL_SNAP_SPRING })
            } else {
              // Uniform commit motion: ride off-screen, then onCommit.
              pullY.value = withTiming(screenSpan, RIDE_OFF)
              runOnJS(onCommit)()
            }
          } else {
            pullY.value = withSpring(0, { velocity: speed, ...PULL_SNAP_SPRING })
          }
          if (engaged.value) {
            engaged.value = false
            if (reportPulling) runOnJS(setPulling)(false)
          }
        })
        // Insurance, for a gesture that dies without ever reaching onEnd (the
        // system takes the touch, a parent cancels it). Two things must not
        // survive it: a surface left parked mid-drag — it springs home, seeded
        // with the last velocity onUpdate saw, exactly as a short release does —
        // and the inner scroll left locked for the rest of the page's life.
        .onFinalize(() => {
          'worklet'
          if (!leaving.value && pullY.value !== 0 && engaged.value) {
            pullY.value = withSpring(0, { velocity: pullVelocity.value, ...PULL_SNAP_SPRING })
          }
          if (engaged.value) {
            engaged.value = false
            if (reportPulling) runOnJS(setPulling)(false)
          }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureEnabled, commitMode, deciding, commitDistance, screenSpan, onCommit, headerBottom, reportPulling, dismissKeyboard])

  return { gesture, pullY, pulling, pullEngaged: engaged, pullCtx, panRef, reach, armed, reset, commit, tutorialPlaying, commitDistance, screenSpan, leaving }
}
