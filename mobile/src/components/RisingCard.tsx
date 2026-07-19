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
  from = 'up',
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  // false skips SlideInDown on first paint, for the cold-start case where the
  // card is already in its rest position visually (e.g. the home pane's first
  // card on app launch — sliding it in would feel like a UI glitch).
  animateEnter?: boolean
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
  return (
    <LayoutAnimationConfig skipEntering={false}>
      <Animated.View
        entering={animateEnter ? entering : undefined}
        exiting={exiting}
        style={style}
        collapsable={false}
      >
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  )
}
