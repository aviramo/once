import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { I18nManager, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  LayoutAnimationConfig,
  SlideInDown,
  SlideOutDown,
  SlideInLeft,
  SlideOutLeft,
  SlideInRight,
  SlideOutRight,
  runOnJS,
} from 'react-native-reanimated'
import { RISE_SHADOW } from '../tokens'

/** Which edge the card travels from and back to.
 *  'up'   — from the bottom. Every card-like surface uses this.
 *  'side' — from the START edge (left in LTR, right in RTL). The menu only:
 *           it is a drawer opened by the hamburger, which sits at top-START,
 *           so it arrives from the same edge as its own button. */
export type RiseFrom = 'up' | 'side'

const SIDE = I18nManager.isRTL
  ? { entering: SlideInRight, exiting: SlideOutRight }
  : { entering: SlideInLeft,  exiting: SlideOutLeft }

// HAS THE SURFACE THIS SUBTREE LIVES IN ARRIVED? False only while a card's
// entrance is still flying; `true` everywhere else, including outside any
// rising surface — so anything that reads it and is not in one behaves exactly
// as it always did.
//
// It exists for ONE rule, with one consumer (AppText's TextInput): NOTHING IS
// FOCUSED INTO A SURFACE THAT IS STILL ARRIVING. The platform measures a
// focused field exactly ONCE, when it takes focus — Android's
// FocusedInputObserver syncs the field's screen position on the focus event and
// on the field's OWN layout, and an ancestor sliding under it is neither — and
// everything that reasons about where the user is typing reads that one number
// for as long as the field keeps focus. A field focused mid-entrance therefore
// reports the position it had while flying, and reports it forever.
//
// What that cost: the create-group page auto-focused its name field while the
// page was still rising, so the keyboard reveal (hooks/useKeyboard.ts) measured
// that field as sitting off the bottom of the screen and scrolled the form all
// the way to its last row to "reveal" it — leaving the one field the user was
// typing in above the top of the page (Pixel, 2026-07-30). It needs a real
// device's rise-against-IME timing, which is why it never showed on an
// emulator.
const RiseArrival = createContext(true)

/** True once the rising surface around this subtree has landed (always true
 *  outside one). Read it before doing anything that measures a child against
 *  the screen. */
export const useRiseArrived = (): boolean => useContext(RiseArrival)

// Shared "rises from the bottom, falls back down" wrapper used by every
// card-like surface that mounts/unmounts on top of the home shell: the page1
// match card, the page2 incoming-invite / dead-invite cards, and the own-
// profile preview sheet. Single source of truth for the slide animation so
// the three surfaces share identical motion (direction, easing, duration).
//
// The wrapper deliberately owns ONLY the mount/dismount animation. Outer
// gesture overlays (pull-to-skip on page1, swipe-down-to-dismiss on the
// profile sheet) live in the caller's tree above this component, so their
// transform composes cleanly with the SlideIn/SlideOut transform without
// clobbering on the same useAnimatedStyle target.
export function RisingCard({
  children,
  style,
  animateEnter = true,
  animateExit = true,
  from = 'up',
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  // false skips SlideInDown on first paint, for the cold-start case where the
  // card is already in its rest position visually (e.g. the home pane's first
  // card on app launch — sliding it in would feel like a UI glitch).
  animateEnter?: boolean
  // false skips the exit. For a surface whose motion is already owned by a
  // gesture (the menu drawer being dragged), an exiting animation is both
  // redundant and DANGEROUS: unmounting mid-gesture while Reanimated holds
  // the view for its exit crashes Fabric with "addViewAt: failed to insert
  // view … the specified child already has a parent". Reanimated registers
  // the exit from the props of the LAST committed render, so gating this on
  // the same flag that keeps the surface mounted is enough — by the time the
  // unmount lands, no exit was ever registered.
  animateExit?: boolean
  from?: RiseFrom
}) {
  const { entering, exiting } = from === 'side'
    ? SIDE
    : { entering: SlideInDown, exiting: SlideOutDown }
  // The entrance says when it is over: the animation's own completion callback,
  // never a duration copied into a timer (a card that skips its entrance is
  // simply born arrived). `finished` is not consulted — an entrance cut short
  // still leaves the card somewhere real, and a field that never gets focus
  // would be a worse bug than the one this prevents.
  const [arrived, setArrived] = useState(!animateEnter)
  const enter = useMemo(
    () => entering.withCallback(() => {
      'worklet'
      runOnJS(setArrived)(true)
    }),
    [entering],
  )
  // The app root wraps everything in `<LayoutAnimationConfig skipEntering>`
  // (_layout.tsx) to dodge a Fabric cold-start mount race. That guard is
  // meant to skip entering only on the first paint, but on iOS + New
  // Architecture the skip leaks to every later conditional mount in the
  // subtree, so without this override the profile sheet / page2 cards mount
  // with NO slide-up on iOS while Android animates fine. A locally-scoped
  // `skipEntering={false}` re-enables entering for this card on both
  // platforms. Safe: RisingCard never requests an entering animation on the
  // cold-start first paint (page1 passes animateEnter=false then; the sheet
  // and page2 cards mount only on user action long after first paint), so
  // re-enabling here cannot reintroduce the race the root guard exists for.
  const card = (
    <Animated.View
      entering={animateEnter ? enter : undefined}
      exiting={animateExit ? exiting : undefined}
      style={[styles.lift, style]}
      collapsable={false}
    >
      {/* Only the components that ASK about the arrival re-render when it
          lands: `children` is the same element object across this card's own
          re-render, so React bails out below the provider. */}
      <RiseArrival.Provider value={arrived}>{children}</RiseArrival.Provider>
    </Animated.View>
  )
  // The override is applied ONLY when this card actually wants an entrance.
  // LayoutAnimationConfig configures a whole SUBTREE, so wrapping
  // unconditionally also re-enabled entering animations for every descendant —
  // lifting the root guard off the entire sheet body, which is broader than
  // this override was ever meant to be. Gating it keeps the iOS fix it was
  // written for while leaving the root guard in force below.
  // NOTE: tightening this did NOT fix the launch-time Fabric mount crash it
  // was suspected of causing (that reproduces on clean HEAD regardless), so
  // treat it as a scoping correction, not a crash fix.
  return animateEnter ? (
    <LayoutAnimationConfig skipEntering={false}>{card}</LayoutAnimationConfig>
  ) : (
    card
  )
}

const styles = StyleSheet.create({
  // THE EDGE THAT SAYS THIS CAME FROM BELOW (user directive 2026-07-31). Every
  // surface that rises over another one wears it, and it is declared HERE and
  // nowhere else — this component is "the surface that rises", so a sheet, a
  // Communities page pushed over the hub, the invitation and home's match card
  // all mark their arrival with the same one shadow, and no call site can state
  // a lift of its own or forget to. (OverlaySheet used to hand-roll the same
  // idea as shadowOffset/shadowOpacity/elevation on its card; it was the only
  // one that did, and it was too faint to read against the page it rose over.)
  //
  // First in the array, so a card that genuinely needs a different lift can
  // still override it with its own `style` — none does today.
  //
  // Only the TOP edge is ever on screen (RISE_SHADOW in tokens.ts explains
  // why), which is why an upward drop is the whole of it.
  lift: {
    boxShadow: RISE_SHADOW,
  },
})
