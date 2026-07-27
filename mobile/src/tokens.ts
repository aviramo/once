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
  pill: 999,  // fully-rounded capsule (credit-cost badge, circular fills)
} as const

// ── Tap slop ───────────────────────────────────────────────────────────────

export const TAP_SLOP = 10

// ── Round button diameters ─────────────────────────────────────────────────
// Standard diameter for every round overlay button (heart / X / add-photo).
// Lives here rather than in RoundButton.tsx because the overlay chrome below
// derives from it, and a token file must not import a component. Declared
// ABOVE ICON because the in-circle glyph sizes are derived from these.

export const ROUND_BUTTON_SIZE = 76
// Quiet secondary round button: the on-card report flag, and every piece of
// floating shell chrome (home's hamburger, a sheet's close X, chat's 3-dot
// menu). Half the hero diameter so the two read as a deliberate primary /
// secondary pair. Derived, never a second literal.
export const ROUND_BUTTON_SIZE_SM = ROUND_BUTTON_SIZE / 2

// The ONE glyph-to-circle ratio. Every icon that sits inside a circle — round
// button, the home center action surface, a popup's tinted icon badge —
// occupies this fraction of the diameter, so they all read as the same object
// at different sizes. It is the whole reason the glyph tokens below are
// derived rather than hand-picked: at 34/76 (45%) the heart read as a dot lost
// in its circle, while 24/38 (63%) crowded the hamburger against the edge.
export const GLYPH_CIRCLE_RATIO = 0.55

// Tinted icon badge at the head of a popup (ConfirmDialog's action icon, the
// login "link sent" confirmation). Not a button — nothing here is pressable —
// but it is a circle with a glyph in it, so it obeys the same ratio.
export const ICON_CIRCLE_SIZE = 56

// ── Common icon sizes ──────────────────────────────────────────────────────

export const ICON = {
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,     // optical half-step — for glyphs whose ink fills less than their box
  xxl: 24,    // default glyph size — every standalone icon renders at this
  xxxl: 28,
  // The in-circle glyphs. All derive from GLYPH_CIRCLE_RATIO, so retuning the
  // padding ring is one edit and the tiers can never drift apart.
  round: Math.round(ROUND_BUTTON_SIZE_SM * GLYPH_CIRCLE_RATIO),  // 21 — small chrome circle (hamburger / report / close X / 3-dot)
  circle: Math.round(ICON_CIRCLE_SIZE * GLYPH_CIRCLE_RATIO),     // 31 — popup icon badge (ConfirmDialog, login "link sent")
  huge: Math.round(ROUND_BUTTON_SIZE * GLYPH_CIRCLE_RATIO),      // 42 — hero circle (heart / pause / chat / add-photo / family)
} as const

// Glyph sizes are dp and do NOT follow the OS font scale on their own — see
// `iconScale` in fonts.ts, which is what keeps them in step with the text
// beside them. Never hand a raw ICON.* straight to an <Svg width>.

// ── Spinner ────────────────────────────────────────────────────────────────
// The single in-app loading spinner (rotating SVG arc over a faint full
// track). One component, sized/weighted by props from this token. `md` is the
// default and MUST match what the in-button loading spinner used historically
// — do not retune it without checking Button.tsx. `lg` is the prominent
// variant: a white spinner standing in for a hero glyph inside a RoundButton
// (game-mode toggle busy state), where a small black ActivityIndicator was
// invisible on the dark photo. Larger + heavier so it reads clearly there.

export const SPINNER = {
  size: ICON.xxl,      // 24 — default footprint (matches the old ButtonSpinner)
  thickness: 2.5,      // arc + track stroke width, in the 24-unit viewBox
  sizeLg: 36,          // prominent variant (RoundButton busy state)
  thicknessLg: 3.5,    // heavier arc for the large variant (own axis — not
                       // STROKE.heavy: icon line-weight ≠ spinner arc weight)
  trackOpacity: 0.3,   // faint full circle behind the moving arc
} as const

// ── Switch ─────────────────────────────────────────────────────────────────
// The one on/off switch (Switch.tsx): a rounded track with a knob that slides
// between its ends. `travel` is derived, never a second literal — retuning the
// track or the knob keeps the ON position correct on its own.

export const SWITCH = {
  width: 48,
  height: 28,
  knob: 24,
  pad: XS,
} as const
export const SWITCH_TRAVEL = SWITCH.width - SWITCH.knob - SWITCH.pad * 2

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
// Spring that settles a pulled card back to rest when released short of the
// commit threshold (page1 skip / page2 decline). Seeded with the finger's
// release velocity (see usePullBehavior) so the snap-back CONTINUES the drag's
// motion instead of restarting from a dead stop — the card "flows with the
// finger" on release rather than jerking. Critically damped (damping =
// 2*sqrt(stiffness*mass)) → smooth, no bounce. Single source for every pull
// surface so the release feel can never drift between them.
export const PULL_SNAP_SPRING = { damping: 40, stiffness: 400, mass: 1 } as const
// First-time swipe-down tutorial (usePullBehavior). NOT MOTION values: these
// are gating delays around the demo, not the animation durations themselves
// (the peek down / return up use the framework default `withTiming`).
//   START_DELAY — waits out the card's SlideInDown so the two don't fight.
//   HOLD        — how long the card rests at the peek, i.e. how long the user
//                 has to read the "swipe down to skip" hint before it returns.
export const PULL_TUTORIAL_START_DELAY_MS = 500
export const PULL_TUTORIAL_HOLD_MS = 2_000

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

// Search-watchdog slack (ms). NOT a MOTION value: this is a UI-state-gating
// delay, not an animation duration. The home pane keeps `searching=true` until
// Realtime confirms the result; if a Realtime relations event is ever dropped
// (known possibility — see realtime.ts resync), the radar would otherwise spin
// forever. The watchdog clears it after API_TIMEOUT_MS (the request ceiling) +
// this slack, which covers Realtime propagation + the card slide-in. Sized far
// above any legitimate find so it can only fire on a genuine hang.
export const SEARCH_WATCHDOG_SLACK_MS = 6_000

// ── Bottom-sheet lift shadow ───────────────────────────────────────────────
// Soft upward shadow that floats every BottomSheet off the backdrop. A single
// native boxShadow (the building-native-ui skill: never hand-stack shadow
// layers — use boxShadow). Replaces the old 20-View SHADOW_GRADIENT_* stack:
// same gentle lift, 1 node per popup instead of 20. All sheets share this; for
// a different lift fork via a prop, not by redefining the string.

export const SHEET_SHADOW = '0px -4px 24px 0px rgba(0,0,0,0.12)'

// ── Loading skeleton ───────────────────────────────────────────────────────
// Geometry of the placeholder rows that stand in for a list while it loads
// (SkeletonRows in CommunityBits.tsx). A skeleton row keeps the real row's
// shape with the avatar and text swapped for beige bars, so the card holds the
// size it is about to have instead of collapsing around a spinner. It breathes
// on the app's one PULSE — no second rhythm, no shimmer sweep.

export const SKELETON = {
  // How many rows to paint. A caller that already knows the real count (it
  // rides in on the row that opened the screen) passes it and gets that many,
  // capped here so a 200-member group doesn't paint a screenful of beige.
  maxRows: 6,
  // Bar heights: the title line and the muted meta line beneath it.
  barHeight: 12,
  metaHeight: 10,
  // Cycle of title-bar widths (fraction of the row) so consecutive rows look
  // like names of different lengths. Deterministic on purpose: a random width
  // would reshuffle every bar on every re-render.
  widths: [0.62, 0.45, 0.7, 0.52, 0.66, 0.5],
  // A meta bar is this much of its row's title bar, so the two lines stay in
  // proportion whichever width the cycle handed the row.
  metaOfTitle: 0.6,
} as const

// ── Misc UI dimensions ─────────────────────────────────────────────────────

export const DRAG_HANDLE = {
  width: 48,
  height: 4,
  radius: 2,
} as const

// ── Overlay sheets ─────────────────────────────────────────────────────────
// The app is one screen (page1) with everything else rising over it as a
// full-screen sheet. See OverlaySheet.tsx.

export const OVERLAY = {
  // Gap between the safe-area top inset and floating chrome (the home
  // hamburger, a sheet's close X). Consumed via chromeReserve() so the card
  // underneath reserves exactly the room the chrome occupies.
  chromeGap: SM,
  // How far in from the START/END edge floating chrome sits: the home
  // hamburger's `start`, the card's report flag at `end`, and a sheet's close X
  // all land on this one gutter so the hamburger visually BECOMES the X when a
  // sheet opens over it (same line, both axes). The page gutter, MD.
  chromeInset: MD,
  // How far the finger must travel before a sideways drag on home is claimed
  // as "open the menu drawer" (below it the touch is still up for grabs).
  menuDragSlop: SM,
  // Paint order. Menu sits above everything on purpose: it is the one surface
  // that stays reachable while the availability gate is on.
  z: {
    invite: 10,
    chat: 20,
    menu: 30,
    subPage: 40,
  },
} as const


// ── Attention pulse ────────────────────────────────────────────────────────
// What is left of the TAB block after the TabStrip was deleted on 2026-07-19.
// The strip owned ~190 lines of chip geometry, all of it dead now; these three
// values outlived it because they describe the app's attention pulse, not the
// tab that used to carry it.
//
// `opacity` + `phaseMs` drive the continuous "this is live" heartbeat (the
// PresenceDot beside a chat partner's name). `timeoutMs` is the upper bound a
// React `alerting` flag stays true after a trigger — comfortably longer than
// the animation, so the pulse always finishes before the flag resets.

export const PULSE = {
  opacity: 0.45,
  phaseMs: 900,
  timeoutMs: 2200,
} as const
