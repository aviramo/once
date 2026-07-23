import type { ReactNode } from 'react'
import { I18nManager, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  LayoutAnimationConfig,
  SlideInDown,
  SlideOutDown,
  SlideInLeft,
  SlideOutLeft,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated'

/** Which edge the card travels from and back to.
 *  'up'   — from the bottom. Every card-like surface uses this.
 *  'side' — from the START edge (left in LTR, right in RTL). The menu only:
 *           it is a drawer opened by the hamburger, which sits at top-START,
 *           so it arrives from the same edge as its own button. */
export type RiseFrom = 'up' | 'side'

const SIDE = I18nManager.isRTL
  ? { entering: SlideInRight, exiting: SlideOutRight }
  : { entering: SlideInLeft,  exiting: SlideOutLeft }

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
      entering={animateEnter ? entering : undefined}
      exiting={animateExit ? exiting : undefined}
      style={style}
      collapsable={false}
    >
      {children}
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
