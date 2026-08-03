// The ONE outline, and the ONE typing surface.
//
// THE BORDER RULE: every rule the app draws is `STROKE.thin` wide and
// `LINE` coloured, at `RADIUS`. That is `OUTLINE_SKIN`, and it is the
// only edge treatment on the page — a field, an outlined button, an
// outlined chip and an empty photo slot all wear exactly the same hairline.
// There is no "stronger" outline for things that matter more: an element that
// needs to shout does it with a FILL, never with a heavier or darker rule.
//
//   OUTLINE_SKIN  the rule alone, over whatever sits behind it (outlined chip,
//                 the SSO buttons on login).
//   FIELD_SKIN    the same rule with the white typing surface inside it. Every
//                 box the user types into, or that stands in for one: the login
//                 email field, the onboarding name / date / bio fields, the
//                 chat composer, a popup's note input, the empty photo slot.
//
// Only two things may override the colour, and both are STATE, not emphasis:
// an error (`NEGATIVE`) and an active/selected surface, which takes the colour
// of the fill it is announcing (`INK`) so the rule disappears
// into the fill instead of ringing it.
//
// This lives in its own module because it is a COMPOSED skin — colours from
// colors.ts, metrics from tokens.ts — and because the alternative is the same
// three lines re-typed at a dozen call sites, free to drift apart one screen at
// a time (which is exactly how the app ended up with two differently outlined
// fields side by side).
//
// Callers add only their own metrics: height, padding, and the odd state
// override.

import type { ViewStyle } from 'react-native'
import { SURFACE, LINE } from './colors'
import { RADIUS, STROKE, CARD_SHADOW } from './tokens'

export const OUTLINE_SKIN: ViewStyle = {
  borderWidth: STROKE.thin,
  borderColor: LINE,
  borderRadius: RADIUS,
}

// A FIELD IS LIFTED, NOT OUTLINED (user directive 2026-08-03): a shadow and a
// rule are two ways of saying the same thing — this box is a surface standing on
// the page — and a box that says it twice reads as drawn ON rather than lifted
// off. So the typing surface takes the app's ONE tile shadow and NO border,
// while `OUTLINE_SKIN` above keeps the rule for what genuinely has no fill to
// lift (an outlined chip, an outlined button).
//
// A field that must state an ERROR puts the rule back itself, in `NEGATIVE`
// (LoginForm): that is a STATE, and a coloured edge is how the app has always
// said it.
export const FIELD_SKIN: ViewStyle = {
  borderRadius: RADIUS,
  backgroundColor: SURFACE,
  boxShadow: CARD_SHADOW,
}
