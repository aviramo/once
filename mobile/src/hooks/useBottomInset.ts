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

export function useBottomInset(): number {
  const { bottom } = useSafeAreaInsets()
  if (bottom > maxBottomSeen) maxBottomSeen = bottom
  return maxBottomSeen
}
