// Central design tokens — single source of truth for sizes, spacing, font sizes,
// radii, durations, easings, gesture thresholds, and shared shadow stops.
//
// Every literal that has meaning across the app lives here. Inline numeric
// values at call sites (fontSize: 16, padding: 12, borderRadius: 8, withTiming
// duration 350) are DRY violations — pull the value into this module and import
// it instead.

import { Easing } from 'react-native-reanimated'

// ── Spacing ────────────────────────────────────────────────────────────────
// SINGLE is the app's base unit. DOUBLE/BUTTON/RADIUS are the only other
// tiers actually referenced across the app. Add a constant only when an
// actual layout needs it — don't grow the scale "just in case".

export const SINGLE = 10
export const DOUBLE = 20
export const QUAD = 40
export const BUTTON = 16
export const RADIUS = 12

// ── Font size scale ────────────────────────────────────────────────────────
// Named for role. TEXT.body is the most common size for paragraph copy and
// row labels. Only the tiers that have real call sites are listed — when a
// new size is needed, name it here first.

export const TEXT = {
  tiny: 11,      // micro chip counters inside tab strips
  small: 13,     // chips, secondary text, pill labels
  base: 14,      // pills, dropdown values, sub-section titles
  body: 15,      // primary body, row labels, button labels in dialogs
  input: 16,     // form inputs, toggle labels, primary button text
  subhead: 17,   // sub-page list rows, button labels (lg)
  h2: 22,        // dialog titles, screen page titles
  h1: 24,        // hero card titles
  display: 32,   // large numeric values (age inputs, big readouts)
} as const

// ── Font weights ───────────────────────────────────────────────────────────
// Only the weights with active call sites. `fontWeight: '700'` should
// reference WEIGHT.bold instead of repeating the magic string.

export const WEIGHT = {
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const

// ── Radii ──────────────────────────────────────────────────────────────────
// Only the tiers in active use. `RADIUS` (12) is the common card/button/input
// radius; RADII covers the outliers.

export const RADII = {
  xs: 2,      // thin indicator bars (tab strip underline)
  sm: 5,      // small fills (checkbox, drag-handle pill)
  chip: 9,    // pill chips beside tab labels
} as const

// ── Tap slop ───────────────────────────────────────────────────────────────

export const TAP_SLOP = 10

// ── Common icon sizes ──────────────────────────────────────────────────────

export const ICON = {
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 24,
  xxxl: 28,
} as const

// ── Stroke widths ──────────────────────────────────────────────────────────

export const STROKE = {
  thin: 1.5,
  base: 2,
  thick: 2.2,
  // Bold, used for chunky icons that should match the visual weight of the
  // filled HeartIcon (e.g. the close-X on the profile sheet tab).
  heavy: 3.5,
} as const

// ── Motion: durations (ms) + easings ───────────────────────────────────────
// Only the tiers used by BottomSheet / LoginForm spinner. Two-tier rule of
// thumb: press/feedback 80–180ms; mount/dismount 200–350ms. Use EASE.out for
// things appearing, EASE.in for things leaving.

export const DURATION = {
  med: 250,        // backdrop tap-dismiss snap
  slow: 300,       // swipe-not-committed return
  sheetIn: 350,    // bottom-sheet slide-up
  sheetOut: 250,   // bottom-sheet slide-down
  rotate: 700,     // spinner full revolution
} as const

export const EASE = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  linear: Easing.linear,
} as const

// ── Gesture thresholds ─────────────────────────────────────────────────────

export const SWIPE_DISMISS_PX = 80         // translateY to commit a dismiss
export const SWIPE_DISMISS_VELOCITY = 800  // px/s velocity that auto-commits
export const PAN_ACTIVE_OFFSET_Y = 8       // when to start tracking the gesture
export const PAN_FAIL_OFFSET_Y = -8        // upward drag cancels

// ── Shadow gradient stops ──────────────────────────────────────────────────
// Used to paint a 20-layer translucent-black gradient above bottom sheets so
// the sheet feels lifted off the screen. All sheets share this exact stack —
// if you want a different lift, fork via a prop, not by redefining the array.

export const SHADOW_GRADIENT_STOPS = [
  0.005, 0.01, 0.012, 0.015, 0.018, 0.02, 0.022, 0.025, 0.028, 0.03,
  0.032, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075,
] as const

export const SHADOW_GRADIENT_HEIGHT = 60

// ── Misc UI dimensions ─────────────────────────────────────────────────────

export const DRAG_HANDLE = {
  width: 36,
  height: 4,
  radius: 2,
} as const

export const BUTTON_MIN_HEIGHT = 56
export const INPUT_MIN_HEIGHT = 56
