import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context'

// Single source of truth for "how much space the system takes at the BOTTOM of
// the window" — the value every bottom-anchored surface pairs with
// `bottomGap()`. Use this instead of `useSafeAreaInsets().bottom` anywhere the
// number decides where a control sits or how much padding a surface reserves.
//
// Why it is not the raw inset: the app draws edge-to-edge (app.json
// `edgeToEdgeEnabled`), so the system navigation bar is painted OVER our
// content and only this inset keeps chrome out from under it. That inset is not
// stable on every device — an IME session can consume the navigation-bar inset
// and leave it reported as 0 while the window is back at full height. Anything
// anchored to the bottom then lands INSIDE the navigation bar: the report and
// chat/heart buttons on the match card came back sliced in half by it
// (2026-07-29, a Redmi with 3-button navigation).
//
// The inset is a property of the DEVICE, not of the moment, so we hold the
// high-water mark: the largest bottom inset seen this session, seeded with the
// value captured natively at launch (`initialWindowMetrics`, taken before any
// keyboard could exist). It can only grow — the app is portrait-only and the
// navigation bar cannot shrink mid-session — so a transient 0 can never pull
// chrome under the bar again. Worst case on a device that genuinely loses its
// bar we reserve a little unused space; the alternative is clipped controls.
let maxBottomSeen = initialWindowMetrics?.insets.bottom ?? 0

// It knows NOTHING about the keyboard, and there is nothing for it to know. What
// this returns is not "how much of the navigation bar to dodge" — it is the raw
// band, and `bottomGap` (tokens.ts) is what turns it into the app's one bottom
// air. The keyboard's effect on that air — halving it, since a keyboard covers
// the band the air is there to clear — is applied once, per frame, inside
// `useKeyboardShrinkSV()`, and never here.
//
// Two earlier attempts to make this hook keyboard-aware are both dead ends,
// recorded so neither comes back:
//  · returning 0 while the keyboard is open — a React state flip, i.e. a ~60px
//    step at each end of the animation (measured 2026-07-30, reported as "two
//    noticeable stages"). A value that must change smoothly across an animation
//    cannot live in a re-render.
//  · subtracting THIS value from the shrink, which was continuous but cancelled
//    the wrong thing: `bottomGap` is a `max`, so on every iPhone (34) the band IS
//    the control's whole bottom air, and cancelling it left the chat composer
//    flush against the keyboard — by a different amount on each platform, since
//    the number was the device's rather than the design's.
export function useBottomInset(): number {
  const { bottom } = useSafeAreaInsets()
  if (bottom > maxBottomSeen) maxBottomSeen = bottom
  return maxBottomSeen
}
