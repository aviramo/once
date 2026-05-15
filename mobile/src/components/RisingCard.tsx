import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated'

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
  return (
    <Animated.View
      entering={animateEnter ? SlideInDown : undefined}
      exiting={SlideOutDown}
      style={style}
      collapsable={false}
    >
      {children}
    </Animated.View>
  )
}
