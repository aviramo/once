// Central design tokens — single source of truth for sizes, spacing, font sizes,
// radii, durations, easings, gesture thresholds, and shared shadow stops.
//
// Every literal that has meaning across the app lives here. Inline numeric
// values at call sites (fontSize: 16, padding: 12, borderRadius: 8, withTiming
// duration 350) are DRY violations — pull the value into this module and import
// it instead.

// ── Spacing ────────────────────────────────────────────────────────────────
// Material-style 5-tier scale, geometric progression (4→8 ×2, 8→16 ×2,
// 16→24 ×1.5, 24→40 ×1.67). Every spacing tier in the app maps to one of
// these five values; tighter or larger inline literals are DRY violations.
// Add a tier only when an actual layout needs it.

export const XS = 4    // micro gaps inside bubbles, hairline insets
export const SM = 8    // base unit: common gap in rows and forms
export const MD = 16   // page horizontal padding, row paddings, medium gaps
export const LG = 24   // section gaps, page-level paddings
export const XL = 40   // hero spacing, largest tier

// Border radii — distinct semantic axis from spacing.
export const RADIUS = 12

// Button / input minimum height. Also reused as the brand-logotype font size
// (see TEXT.xxxl below) — the "Once" logo on the login screen reads at this
// exact size.
export const BUTTON_MIN_HEIGHT = 56
export const INPUT_MIN_HEIGHT = 56

// ── Font size scale ────────────────────────────────────────────────────────
// T-shirt-sized scale. Each tier captures all uses of that visual rank, from
// the smallest captions up to the brand logotype. Add a tier only when a real
// call site needs it.

export const TEXT = {
  xs: 12,    // hints, micro labels, timestamps, day-separators, retry
  sm: 14,    // secondary text, chips, pill labels, sub-section titles, counters
  md: 16,    // primary body, row labels, form inputs, dialog button labels
  lg: 18,    // count badges, kid-chip × glyph, brand slogan, sub-page list rows, popup titles, status header
  xl: 24,    // dialog titles, screen page titles, section titles, hero card names
  xxl: 32,   // large numeric values (age inputs, big readouts)
  xxxl: BUTTON_MIN_HEIGHT,  // "Once" brand logotype (login screen)
} as const

// Line-height helper. 1.4× the font size is the comfortable body-text ratio
// and fits most surfaces (paragraphs, row labels, button labels, bubble text).
// Inline lineHeight is still appropriate for titles (tighter ratio, ~1.1×) and
// for single-glyph decorative text where the line box should equal the glyph
// size — call sites that don't fit 1.4× simply keep their literal value.
export const lh = (size: number): number => Math.round(size * 1.4)

// ── Font weights ───────────────────────────────────────────────────────────
// Two-tier weight scale. `fontWeight: '600'` should reference WEIGHT.semibold
// instead of repeating the magic string.

export const WEIGHT = {
  semibold: '600',
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
  xxl: 24,    // default glyph size — every standalone icon renders at this
  xxxl: 28,
  huge: 48,   // glyph inside RoundButton overlays (heart / pause / dots / add-photo / family)
} as const

// ── Stroke widths ──────────────────────────────────────────────────────────

export const STROKE = {
  thin: 1.5,
  // Slightly heavier than `thin` — the weight shared by the line-art glyph
  // family that reads at icon sizes (megaphone / eye / chat). Extracted so
  // the family can't drift apart one icon at a time.
  medium: 1.8,
  base: 2,
  thick: 2.2,
  // Bold, used for chunky icons that should match the visual weight of the
  // filled HeartIcon (e.g. the close-X on the profile sheet tab).
  heavy: 3.5,
} as const

// ── Gesture thresholds ─────────────────────────────────────────────────────

export const SWIPE_DISMISS_PX = 80         // translateY to commit a dismiss
export const SWIPE_DISMISS_VELOCITY = 800  // px/s velocity that auto-commits
export const PAN_ACTIVE_OFFSET_Y = 8       // when to start tracking the gesture
export const PAN_FAIL_OFFSET_Y = -8        // upward drag cancels
// Fraction of the screen height a pulled card must travel to commit — the
// SINGLE uniform commit threshold for every pull surface (page1 skip, page2
// decline, profile-sheet dismiss). The SAME fraction also normalizes the
// sheet's open-progress while dragging (so the TabStrip "Once" → "My
// profile" morph + chip slide track the card 1:1 and land exactly at
// "Once"/Settings the instant the drag reaches the commit point). One
// constant so the commit point and every consumer can never drift apart.
export const PULL_COMMIT_FRACTION = 0.5

// ── Motion (animation durations, ms) ───────────────────────────────────────
// Three-tier duration scale. Every timed animation (fade, slide, scale,
// spinner) references one of these — inline `duration: 260` literals are DRY
// violations. Pick the tier whose *role* matches the animation, never the one
// whose old raw number was closest.
//
//   fast — quick fades on small UI (chat bubble in, typing indicator in/out).
//   base — the standard transition: screen/step slide, selection highlight,
//          list-card mount/unmount, typing-dot pulse, segmented toggle.
//   spin — one full 360° spinner revolution (looped, never a one-shot).
//
// IMPORTANT: this axis is animation *duration* only. Loop stagger / delay
// offsets (e.g. the TypingDots inter-dot delays, or a setTimeout that gates a
// UI state) are a SEPARATE concern and must never be folded into MOTION even
// when a raw value happens to coincide — same number ≠ same meaning, and
// retuning a duration must not silently retune an unrelated delay.
export const MOTION = {
  fast: 150,
  base: 300,
  spin: 600,
} as const

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
  width: 48,
  height: 4,
  radius: 2,
} as const

// ── Tab strip ──────────────────────────────────────────────────────────────
// All TabStrip-specific dimensions and motion values. `rowHeight` is the
// fixed height of the main label/icon/chip row. The label has NO
// selection-driven transform (a former `selectedScale` grow was removed: it
// re-rasterized the <Text> every swipe frame and made the label jitter
// vertically as the chip arrived/left — the label's Y must stay constant).
// `pulseOpacity` + `pulseCount` define the `alerting` attention pulse
// (chip / indicator fades to pulseOpacity and back, pulseCount times).
// `pulseTimeoutMs` is the upper-bound the React `alerting` flag stays true
// after a trigger — slightly longer than pulseCount × 2 × default-withTiming
// (300ms) so the animation always completes before the flag resets.

export const TAB = {
  rowHeight: 32,
  pulseOpacity: 0.15,
  pulseCount: 3,
  pulseTimeoutMs: 2200,
  // Duration of the sub-label (live timer) slide-in / slide-out animation.
  // Entering: FadeInDown drops the timer from above into its slot above the
  // mainRow while fading in. Exiting: FadeOutUp lifts it back up while
  // fading out. The slot is absolute-positioned so the tab's layout box
  // never changes — labels stay locked at the same Y regardless of timer
  // state. Only the timer itself animates.
  timerSlideDuration: 220,
  // Duration of the side tab's expand/collapse choreography. When the side
  // tab has no 1:1 counterpart (chat / broadcast / visible / hidden) it
  // shrinks to an icon-only compact tab like Menu, freeing flex so "Once"
  // recenters; when an incoming-invite profile arrives it grows back to a
  // full labeled tab. One token drives BOTH the tab-width reflow
  // (LinearTransition on every tab) and the label/icon cross-fade so the
  // morph and the content swap stay in lockstep.
  collapseDuration: 240,
  // Slow opacity heartbeat applied to the sub-label cluster when a tab is
  // surfacing a live ongoing status word (e.g. "בשידור" / "צופים בי" above
  // an icon-only side tab). 900ms per phase → ~1.8s full cycle reads as
  // "alive" without feeling frantic — matches the PresenceDot beat so live
  // indicators across the shell share one heartbeat.
  subLabelPulsePhaseMs: 900,
  subLabelPulseOpacity: 0.45,
  // Vertical nudge applied to standalone tab icons (renderIndicator) so they
  // visually center against the label glyphs next to them. Flex
  // `alignItems: center` aligns BOXES, but on Android the actual rendered
  // text sits low in its line-box (font metrics give extra space at the top),
  // so a centered icon ends up appearing visually higher than the labels.
  // Positive value pushes the icon DOWN to match the labels' rendered Y.
  iconBaselineNudge: 3,
  // Upward nudge (px) applied to the tab LABEL cluster via a transform so
  // its glyph centre matches the icon's. Even with lineHeight == rowHeight
  // and includeFontPadding:false, Android renders the glyph low in its
  // line-box, so a flex-centred label sits a few px below a flex-centred
  // icon; this lifts it back to the icon's centre. Transform-only (no
  // layout/width change); the chip is tall enough that the text stays fully
  // enclosed. Tune this single value if label vs icon ever drifts. Applied
  // inside `pressLabelStyle`'s transform array — NOT as a static transform on
  // labelStack (a Reanimated style array replaces, not merges, `transform`, so
  // the press worklet would clobber a static wrapper transform; same for
  // iconBaselineNudge → pressIndicatorStyle).
  labelLift: 3,
  // ── Gliding selected-tab lozenge ─────────────────────────────────────────
  // A flat translucent chip that slides behind the active tab AND spans that
  // tab's full width (minus this inset each side so adjacent chips never
  // touch). Tabs are very unequal (compact icons vs the wide flex "Once"),
  // so the resize is done via `transform: scaleX` (GPU, smooth) — NEVER by
  // animating the `width` layout prop per frame (that stutters the pager's
  // auto-settle) and NEVER by snapping it (that pops). The layout `width`
  // equals the *settled* tab's width and only changes once, while static,
  // at settle; `scaleX` (and `translateX`) carry every per-frame change, so
  // at rest scaleX = 1 (crisp capsule + border) and only a brief, transient
  // ellipse shows mid-swipe.
  indicatorInsetX: 8,
  // Vertical pad around the single-line capsule (top + bottom). The chip is
  // bottom-anchored at `-indicatorPadV`. Chip height = rowHeight +
  // 2*indicatorPadV = 44, so `indicatorRadius` = 22 makes it a true capsule.
  // The chip is intentionally a single-line capsule around the main row
  // only; the sub-label timer floats as a caption ABOVE it (see
  // subLabelOuter), with a clean gap so the chip never clips the timer.
  indicatorPadV: 6,
  indicatorRadius: 22,
  // Subtle press feedback: a tab's content cluster (label / icon) dips to
  // this scale while held. Tactile without being a bounce.
  pressScale: 0.94,
  // Static tracking on the header wordmark. Re-introduced now that the
  // selected indicator is a real moving element: the old "no letterSpacing"
  // rule existed only because it couldn't animate 1:1 with the weight
  // cross-fade, but a constant value applied equally to BOTH stacked layers
  // doesn't thrash width (the active layer still drives natural width).
  labelTracking: 0.4,
} as const
