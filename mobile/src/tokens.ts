// Central design tokens — single source of truth for sizes, spacing, font sizes,
// radii, durations, easings, gesture thresholds, and shared shadow stops.
//
// The one import: the bundled font's own line ratio, which `lh` below estimates
// a line box with. Text METRICS belong to the font, not to the design scale.
//
// Every literal that has meaning across the app lives here. Inline numeric
// values at call sites (fontSize: 16, padding: 12, borderRadius: 8, withTiming
// duration 350) are DRY violations — pull the value into this module and import
// it instead.
import { FONT_LINE_RATIO } from './fonts'

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
// (see TEXT.xxl below) — the "Once" logo on the login screen reads at this
// exact size.
export const BUTTON_MIN_HEIGHT = 56
export const INPUT_MIN_HEIGHT = 56

// ── Font size scale ────────────────────────────────────────────────────────
// FIVE tiers, in 4px steps up to the body rank and then doubling (user
// directive 2026-07-28). The old seven tiers drew distinctions the eye could
// not read: 14 beside 16 and 18 beside 24 were two pairs of near-twins, so
// "which one does this row use" had no answer a person could give, and the same
// visual rank picked a different tier in two different screens. Each tier here
// is far enough from its neighbour that choosing between them is obvious.
//
// Ranks, not pixel values, are what a call site should be thinking about:
//   sm — everything BELOW the body: hints, timestamps, day separators, meta
//        lines, counters, micro labels.
//   md — THE body. Paragraphs, row labels, chips, form inputs, button labels,
//        member and group names. The default; when unsure, this is the answer.
//   lg — every heading, whatever surface it heads: popup and sheet titles,
//        screen and section titles, hero card names, status headers.
//   xl — a large number meant to be read as a quantity (age inputs, readouts).
//   xxl — the "Once" brand logotype on the login screen, and nothing else.
//
// Add a tier only when a real call site needs a rank that genuinely is not one
// of these five. Two tiers four pixels apart is what this scale replaced.

export const TEXT = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 32,
  xxl: BUTTON_MIN_HEIGHT,  // 56
} as const

// ── How tall is one line? ──────────────────────────────────────────────────
// An ESTIMATE, in dp, of the line box the engine will draw for `size` — for a
// BOX that has to be sized in JS before its text exists: a skeleton row standing
// in for a name, the composer's max height, the first frame of a header whose
// title has not been measured yet.
//
// It is NOT a `lineHeight`, and no text style in the app declares one (user
// directive 2026-07-30). A declared lineHeight is a dp number that Android grows
// through the OS font-scale curve UNCAPPED, while `fontSize` is capped by
// FONT_SCALE — so above the cap the leading runs away from the ink (2.0 em of
// leading on a font_scale=2.0 device where the design says 1.4). Leaving it
// undeclared hands the leading to the FONT's own ascent+descent, which is a
// multiple of the size actually painted and therefore identical on every device.
// See FONT_LINE_RATIO in fonts.ts for the measurement and the whole story.
//
// The ratio here is that same font ratio, so an estimated box matches the line
// the engine goes on to draw inside it. And it stays an estimate: where being
// wrong by a dp matters, MEASURE the line instead (`LineProbe` in
// components/GlyphSlot.tsx).
export const lh = (size: number): number => Math.round(size * FONT_LINE_RATIO)

// THE air under the last thing on a surface — the one answer to "how much room
// below the bottom button / last row / composer".
//
// ONE AIR, THE SAME ON EVERY DEVICE (user directive 2026-07-30). The bottom of
// the app must not read differently on an iPhone than on an Android, and it did:
// twice the gap, because the air WAS the device's own bottom band, and those
// bands are not the same object. An iPhone reports 34 for its home indicator;
// Android reports 16–24 for the gesture pill. Absorbing the design gap into the
// band (`max(inset, gap)`, the rule until now) therefore handed the two platforms
// two different numbers for the same surface, and neither of them was the
// design's.
//
// So the band is no longer the air. It is read for exactly one thing — WHETHER
// IT IS FURNITURE THE APP WOULD BE CLIPPED BY — and the answer is its own size,
// which is the one property the platform does state honestly on both:
//
//   · A band at or under BOTTOM_BAND_HINT_MAX is a HINT: a home indicator (34,
//     of which the indicator itself is the lowest ~13) or a gesture pill (16–24,
//     pill in the lowest ~12). It marks a gesture zone; it occupies nothing. The
//     app clears it with its own air, BOTTOM_AIR, which is above both zones —
//     and identical on every such device, which is the whole point.
//   · A band TALLER than that is a drawn navigation BAR (48 for Android's
//     3-button nav) — real furniture that swallows anything under it, so it is
//     cleared in full. This is the case that must never be capped: it is what
//     sliced the match card's buttons in half on a 3-button Redmi (2026-07-29).
//
// `gap` is now a FLOOR, not a competitor to the band: a surface that wants MORE
// than the app's bottom air still gets it (a list's XL of scroll air), and one
// that asks for less is lifted to it, so no surface can end closer to the edge
// than any other. It is never additive — no surface needs air BELOW the
// indicator.
//
// And it is the air over the KEYBOARD too, from this same call, because the page
// ends at the keyboard's top edge exactly as it ends at the top of the band
// (`KeyboardShrink` in app/_layout.tsx). One air, whatever furniture happens to
// be standing below the page — which is why nothing in this path may be made
// keyboard-aware.
export const BOTTOM_AIR = LG
export const BOTTOM_BAND_HINT_MAX = XL
export const bottomGap = (safeInset: number, gap: number): number =>
  safeInset > BOTTOM_BAND_HINT_MAX
    ? Math.max(safeInset, gap)   // a drawn navigation bar: clear it in full
    : Math.max(BOTTOM_AIR, gap)  // an indicator / gesture pill: the app's own air

// ── The air is HALVED while the keyboard is up ──────────────────────────────
// (user directive 2026-07-30.) The air above exists to keep chrome off the
// system's bottom band; a keyboard covers that band completely, so half of it is
// enough — and half is what the app takes, on every device and both platforms.
//
// This is how much a surface GIVES BACK, i.e. how far it may extend below the
// keyboard's top edge: half the air it holds at rest, so what remains visible
// above the keyboard is the other half. It is consumed inside the two keyboard
// application points (`useKeyboardShrinkSV`), never at a call site, so no screen,
// popup or component learns that a keyboard exists.
//
// A subtraction here is exactly what was wrong until today — but that one
// subtracted the DEVICE's band (34 on an iPhone, 16–24 on an Android, 48 on a
// 3-button bar), which both deleted the whole of the air and made the result a
// different number per platform. This subtracts half of the APP's air, which is
// a design value: identical everywhere by construction, and derived from the same
// `bottomGap` the surface itself used, so the two can never disagree.
export const keyboardAirCut = (safeInset: number): number => bottomGap(safeInset, BOTTOM_AIR) / 2

// ── Font weights ───────────────────────────────────────────────────────────
// ONE weight above the regular face (user directive 2026-07-28): every piece of
// emphasis in the app — popup titles, button labels, section headings, selected
// states — is this one. The old `extrabold: '800'` tier is gone; it drew a
// hierarchy the app does not actually have, and two weights of emphasis sitting
// next to each other (a group's name at 800 above a member's at 600) read as two
// different kinds of thing when they are the same thing.
//
// It is MEDIUM (500) since 2026-07-29, down from semibold (600). The app spent
// that day taking weight OFF everything that was merely a label — menu rows,
// group strips, chips, the card's name — and against that quieter page a lighter
// emphasis is enough. The step is smaller in Hebrew than the same step is in
// Latin (it was checked on device against an emphasised run inside a chip, and it
// reads), and it is a real bundled face — NotoSansHebrew_500Medium, never a
// weight the OS synthesises.
//
// Hierarchy is carried by SIZE (TEXT.*) and COLOR (INK vs INK_BODY/INK_HINT), not by
// a second bold. A call site says WEIGHT.medium rather than repeating the magic
// string; there is deliberately nothing heavier to reach for.

export const WEIGHT = {
  medium: '500',
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

// ── Notification dot ───────────────────────────────────────────────────────
// THE "there is something here for you" marker, riding a round button's
// upper-END arc: unread messages on the card's chat action, and someone
// waiting on an answer on home's menu button. A solid INK disc (news, not a
// warning, so it wears the app's one colour and not an alarm one) in a WHITE
// ring that separates it from the white button under it and from any photo
// behind it.
// ONE FIXED SIZE on every button (user directive 2026-07-28) — the dot says
// the same thing wherever it appears, so it is the same object, not a mark
// scaled to whatever circle it happens to ride. On the 38dp chrome circle it
// therefore reads BIGGER relative to the button than on the 76dp hero one,
// which is the point: a 7dp version of it would be a smudge.
// Its inset is geometry, not a token: it lands the disc's centre on the 45°
// point of whatever circle it rides (see RoundButton), so on a small button
// the disc straddles the arc further out.
export const NOTIFY_DOT_SIZE = 14
export const NOTIFY_DOT_RING = STROKE.base

// ── The Circles emblem ─────────────────────────────────────────────────────
// Diameter of the menu's one big round button (CirclesButton.tsx): the disc that
// carries the circles mark, the word, each count on its own line and the waiting
// chip, hanging half over the profile photo and half over the menu list.
//
// As wide as TWO hero circles standing side by side with the page gutter between
// them — derived, so the app's round objects keep one scale between them. That is
// the smallest disc the stack actually fits in: the counts are STACKED rather
// than chained on the interpunct, so the column runs mark + name + two counts +
// chip, and a circle is at its widest only through the middle — the rim closes in
// on both ends of that column.
//
// It is the only round box in the app that GROWS with the OS font scale (the
// emblem consumes it through `iconScale`), because text stands in it; see
// FIXED_BOX_SCALE in fonts.ts for the rule and why this is the exception to it.
export const CIRCLES_BUTTON_SIZE = ROUND_BUTTON_SIZE * 2 + MD

// ── Gesture thresholds ─────────────────────────────────────────────────────

export const SWIPE_DISMISS_PX = 80         // translateY to commit a dismiss
export const SWIPE_DISMISS_VELOCITY = 800  // px/s velocity that auto-commits
export const PAN_ACTIVE_OFFSET_Y = 8       // when to start tracking the gesture
export const PAN_FAIL_OFFSET_Y = -8        // upward drag cancels
// How close to offset 0 still counts as "the inner scroll is at its top", i.e.
// has nothing left to give and may hand the surface to the pull. A few px of
// slack because a throttled onScroll can report the resting position a hair
// short of zero, and a flag stuck `false` is a surface that can never be swiped
// away again. One constant: every place that asks the question must ask it the
// same way (PullScrollView's scroll sync AND its content-size correction).
export const SCROLL_AT_TOP_PX = 8
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
// How long a finger must rest on a surface before it reads as a long press
// (chat's message-actions sheet). A gesture threshold, not a MOTION duration:
// it gates when a handler activates, it does not time an animation.
export const LONG_PRESS_MS = 400

// ── Paged lists ────────────────────────────────────────────────────────────
// Rows a server-paged list asks for at a time (group browse / search).
export const LIST_PAGE_SIZE = 20
// How much scroll is allowed to remain below the viewport before the next page
// is fetched, measured in viewports (what a virtualized list's own threshold
// speaks): one screen's worth, so the rows are already in place by the time the
// finger gets there and the list never visibly stalls.
export const LIST_PAGE_AHEAD_VIEWPORTS = 1
// How long a search field waits after the last keystroke before it asks the
// server. Not a motion duration: it gates a request. A list that can filter
// what it already holds does so immediately, so this delay costs nothing that
// the user can see.
export const SEARCH_DEBOUNCE_MS = 300

// ── Onboarding nudges ──────────────────────────────────────────────────────
// How many page1 profiles a user watches (counted from the moment the profile
// is built) before home raises the one-shot Communities awareness nudge. Small
// on purpose: the point is to explain what decides WHO shows up before the
// stream of faces has settled into a habit.
export const COMMUNITIES_NUDGE_AFTER = 3

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

// The air a popup leaves above itself once it has grown as tall as it is
// allowed to. A sheet rises from the bottom, so an over-long body used to push
// its own HEAD off the top of the screen — the group popup with a long
// description lost the owner's photo, the name and the member count before the
// text ran out. The cap (screen minus the safe-area top minus this) is what the
// body then has to fit inside, and the strip left over says the surface is a
// sheet laid on the app rather than a page of its own.
export const SHEET_TOP_GAP = LG

// ── The rhythm INSIDE a popup ──────────────────────────────────────────────
// How far apart the four things a popup is made of stand: the air above its
// first block, the gap under its title, the gap between two body blocks, and
// the air above its buttons. ONE set for every popup in the app (user directive
// 2026-07-30, read off the invite popup): a title and the sentence explaining it
// are ONE block and sit close together, and the actions stand well clear of it,
// so the eye reads "what this is" and only then "what I can do".
//
// It is a token set rather than four literals because the whole point is that
// two popups cannot differ: before this, the gap over a button row was MD in
// ConfirmDialog, LG in the groups sheet, XL on the invite card and SM in the
// group popup, and the gap under a title was SM, XS or nothing depending on
// which file you were in. A popup body therefore declares NO vertical spacing of
// its own — it composes SheetTitle / SheetDesc / SheetActions (BottomSheet.tsx),
// which are the only things allowed to read these.
//
// The bottom of a popup is NOT here: that is the app's one bottom gap, and it is
// `bottomGap(useBottomInset(), LG)` on the sheet's card.
export const SHEET_GAP = {
  /** Card top edge (or the bottom of the drag handle) → the first block. */
  title: LG,
  /** Title → the description under it. The two are one block. */
  desc: SM,
  /** Body block → the next body block (a field, a toggle, a list). */
  block: MD,
  /** The last thing said → the button row. The popup's widest gap, on purpose. */
  actions: XL,
} as const

// A bounded, scrollable block inside a popup fades out over its bottom edge to
// say there is more below it (user directive 2026-07-28 — the one gradient in
// the app, and it is a hint, not decoration: it paints the popup's own white
// over the last strip of text and lifts the moment the end is reached). This is
// how tall that fade is.
export const SCROLL_FADE = 36

// ── Loading skeleton ───────────────────────────────────────────────────────
// Geometry of the placeholder rows that stand in for a list while it loads
// (SkeletonRows in CommunityBits.tsx). A skeleton row keeps the real row's
// shape with the avatar and text swapped for pale purple bars, so the card holds the
// size it is about to have instead of collapsing around a spinner. It breathes
// on the app's one PULSE — no second rhythm, no shimmer sweep.

export const SKELETON = {
  // How many rows to paint. A caller that already knows the real count (it
  // rides in on the row that opened the screen) passes it and gets that many,
  // capped here so a 200-member group doesn't paint a screenful of bars.
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

// ── Sync hairline ──────────────────────────────────────────────────────────
// Geometry of the quietest loading mark in the app (SyncBar in OverlaySheet.tsx):
// a segment that drifts along a page's chrome edge while a round trip runs
// BEHIND content that is already painted. The skeleton above says "there is
// nothing here yet"; this says "what you are reading is not the final word".
// Deliberately thin and short — it may never read as a progress bar, only as a
// sign that something is still thinking. Its rhythm is not here: the drift runs
// on PULSE.phaseMs, the app's one attention period, so a page whose list is
// still breathing on the skeleton and one that is re-syncing move on the same
// clock instead of on two.

export const SYNC = {
  height: 2,
  /** How much of the edge the drifting segment covers. */
  segment: 0.3,
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
  // hamburger, a sheet's close X). Consumed via chromeTop() below, never added
  // to an inset by hand.
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

/** The ONE line floating chrome hangs from, measured from the top of the screen:
 *  home's hamburger, a sheet's close X, and anything a body pins LEVEL with them
 *  (a card's top-END chip column, the menu's edit-profile chip). It is what makes
 *  the hamburger visually BECOME the X when a sheet opens over it, so the four
 *  call sites read it here rather than each adding the gap to an inset itself. */
export function chromeTop(topInset: number): number {
  return topInset + OVERLAY.chromeGap
}


// ── Home art ───────────────────────────────────────────────────────────────
// The illustration that sits under home's centre button (HomeArt.tsx). It is
// TEXTURE, not content: it gives the empty page a playful ground and must
// never pull the eye off the headline or the one big action above it.

export const HOME_ART = {
  // Share of the screen width the drawing spans. Wide enough to read, short
  // enough that the whole centre column still fits a small screen — the frame
  // is not far off square (see HomeArt's FRAME), so width buys real height.
  widthRatio: 0.76,
  // Faint. Present when you look for it, quiet when you don't.
  opacity: 0.3,
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
