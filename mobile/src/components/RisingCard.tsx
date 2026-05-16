import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  LayoutAnimationConfig,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'

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
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  // false skips SlideInDown on first paint, for the cold-start case where the
  // card is already in its rest position visually (e.g. the home pane's first
  // card on app launch — sliding it in would feel like a UI glitch).
  animateEnter?: boolean
}) {
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
        entering={animateEnter ? SlideInDown : undefined}
        exiting={SlideOutDown}
        style={style}
        collapsable={false}
      >
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  )
}
