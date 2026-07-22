// The ONE typing surface.
//
// Every box the user types into, or that stands in for one, wears this skin: a
// white surface inside the warm hairline, at the shared radius. That covers the
// login email field, the onboarding name / date / bio fields, the empty photo
// slot (a field waiting to be filled) and a popup's note input.
//
// It lives in its own module because it is a COMPOSED skin — colours from
// colors.ts, metrics from tokens.ts — and because the alternative is the same
// three lines re-typed at five call sites, free to drift apart one screen at a
// time (which is exactly how the app ended up with a green-outlined note input
// next to a beige-outlined name field).
//
// Callers add only their own metrics: height, padding, and the odd state
// override (an error border, for instance).

import type { ViewStyle } from 'react-native'
import { SURFACE, BORDER_SOFT } from './colors'
import { RADIUS, STROKE } from './tokens'

export const FIELD_SKIN: ViewStyle = {
  backgroundColor: SURFACE,
  borderWidth: STROKE.thin,
  borderColor: BORDER_SOFT,
  borderRadius: RADIUS,
}
