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
// A radius bigger than any box that takes it: what makes a tile a PILL, and a
// square one a circle. Stated once so "fully round" is a token rather than a
// number re-typed at each call site.
export const PILL_RADIUS = 999

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
// (`KeyboardSurface`, src/hooks/useKeyboard). One air, whatever furniture happens to
// be standing below the page — which is why nothing in this path may be made
// keyboard-aware.
export const BOTTOM_AIR = LG
export const BOTTOM_BAND_HINT_MAX = XL
// The tallest a system bottom BAND can honestly be: Android's 3-button
// navigation bar is 48, and nothing the app must clear at the bottom of the
// window is taller. A reported inset above this is not furniture — it is the
// KEYBOARD's inset leaking into the safe area (edge-to-edge + adjustResize:
// WindowInsetsCompat folds the IME into the bottom inset on some devices), and
// taking it at face value is permanent, because `useBottomInset` holds a
// high-water mark: one chat session and the dock stood ~300dp off the bottom of
// the screen for the rest of the run (user report 2026-08-03).
export const BOTTOM_BAND_MAX = 64
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

// (The Circles emblem's diameter stood here, with `CirclesButton.tsx`. Both went
// with the menu page that hung the disc on the seam between its profile photo and
// its list — Circles is an entry on home's dock now, 2026-07-30.)

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

// HOW FAR A PULL MUST TRAVEL DEPENDS ON WHAT LETTING GO *DOES*, and there are
// exactly two answers (see usePullBehavior's `weight`).
//
// A pull that DECIDES something about the person on the card — page1's skip,
// the invitation's decline — must be half the screen and must ignore speed
// (user directive: "regardless of swipe speed, only if the finger and the card
// together passed the half"). It is the one gesture in the app that cannot be
// taken back, so it is deliberately expensive to make by accident.
export const PULL_COMMIT_FRACTION = 0.5
// A pull that merely TAKES A SURFACE AWAY — every overlay sheet, every Circles
// page, chat, and every state of home's card that is NOT the skip — costs a
// TENTH of the screen and honours a flick. Putting a page away is reversible
// (the thing behind it is still there and re-opening it is one tap), so it must
// be as cheap as putting a popup away: a `BottomSheet` dismisses at
// SWIPE_DISMISS_PX (80), and a tenth of a phone screen is that same ~85px. A
// fifth (~170px) still read as the surface INSISTING on springing back the
// moment it was dragged (user report 2026-08-03), which is the one thing only
// the skip is allowed to do.
export const PULL_CLOSE_FRACTION = 0.1
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

// ── "You cannot use this yet" ──────────────────────────────────────────────
// THE fade for a control that is present but not available to this user — the
// app's one answer, so a door that is shut looks the same wherever it is. It is
// deliberately a FADE and not a removal: the control stays where it will be, and
// it stays PRESSABLE, because a dimmed key that says nothing when tapped only
// tells the user he is stuck. Every use of it must open something that explains
// (home's dock fades Circles until the profile is built and taps into the
// members-only popup, which offers the way out).
export const DISABLED_OPACITY = 0.45

// The app's one press fade, for a control that answers a finger by dimming (the
// round button, home's centre disc). A FILLED purple control darkens its fill
// to INK_PRESSED as well; the fade alone is barely visible on a big disc.
export const PRESSED_OPACITY = 0.85

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

// ── Motion (animation durations, ms) ───────────────────────────────────────
// Three-tier duration scale. Every timed animation (fade, slide, scale,
// spinner) references one of these — inline `duration: 260` literals are DRY
// violations. Pick the tier whose *role* matches the animation, never the one
// whose old raw number was closest.
//
//   fast — quick fades on small UI (chat bubble in, typing indicator in/out).
//   rise — A SURFACE ARRIVING FROM BELOW, and its exit: every popup
//          (BottomSheet) and every rising surface (RisingCard, so the pages and
//          home's cards). It is the one motion the user waits ON — nothing is
//          answerable until it lands — so it is a step under `base` (user
//          directive 2026-08-03). It is a tier and not a one-off because the
//          popups and the pages must arrive at the same speed: they are the same
//          gesture from the user's side.
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
  rise: 200,
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

// HOW LONG A SENTENCE THE USER IS READING KEEPS THE SCREEN (ms). NOT a MOTION
// value: this is a floor on a UI state's lifetime, not the duration of an
// animation. Home's headline slot is one line carrying six unrelated messages
// (scanning, loading, ready, nobody nearby, the skip line, a gate notice), each
// driven by its own short-lived flag, and those flags flip several times inside
// one skip — so the slot was rewriting itself two and three times a second and
// read as churn rather than as an answer (user report 2026-08-03: "every second
// the text goes from X to Y to X to Z"). A state that does not outlive this is
// therefore never PAINTED at all: the swap waits out the remainder and then
// commits whatever is true at that moment, so a value that came and went in
// between costs nothing and the eye is asked to read one thing at a time.
export const HEADLINE_MIN_DWELL_MS = 1_200

// The ceiling on holding a profile card back while its photos load (ms). NOT a
// MOTION value either: a card is painted out of sight and only then allowed to
// rise (WarmCard), and this is the point past which waiting stops being the
// kinder answer — a hung fetch must not cost the user the card itself, least of
// all an invitation with a clock running on it. Far above any real load, so it
// can only fire on a genuine hang.
export const WARM_CARD_MAX_MS = 10_000

// How long a photo may be on its way before the card says so (ms). Not a
// duration either: every image mounts as "loading" — a memory-cache hit
// included, since the settle is a JS event that lands after the picture is
// already painted — so a spinner drawn on that flag alone blinks over complete
// photographs, worst of all on a card that was warmed before it rose. Long
// enough that a picture already in memory never shows one, short enough that a
// real wait is never silent.
export const PHOTO_WAIT_DELAY_MS = 200

// ── The lift of a surface that came from below ─────────────────────────────
// ONE upward shadow for everything in the app that stands over what is beneath
// it (user directive 2026-08-03): home's dock and the bar under a profile card,
// every BottomSheet, and every full-screen surface that rises (RisingCard).
// There were three separate strings for these — 4/24/0.12 for a popup, 8/18/0.10
// for the dock, 5/16/0.20 for a rising page — and the user read them side by
// side on the emulator: against the dock, a popup coming up looked FLAT. The
// difference was never the strength, it was the ratio of the DROP to the BLUR
// (0.44 for the dock against 0.17 for the popup): a shadow displaced far inside
// a tight blur sits above the edge at nearly its full stop before it falls off,
// which is a band the eye reads as depth, while one barely displaced inside a
// wide blur is a halo hugging the edge and reads as a line. The dock's ratio is
// the one that reads, so it is now the app's only one.
//
// The STOP stays low, and that is a correction rather than a compromise (user
// directive 2026-07-30): at 0.26 the drop stopped reading as a shadow and
// painted a visible grey BAND across the page above the strip, which on a
// purple-and-white app is a colour that does not exist in it. What makes this
// read as hovering is the distance it falls, not how dark it is.
//
// A single native boxShadow (the building-native-ui skill: never hand-stack
// shadow layers) and never an Android `elevation`, which can only drop
// downwards. There is no rule along the top edge of any of these surfaces and
// there must never be one — this is what stands in its place.
export const RISE_SHADOW = '0px -8px 18px 0px rgba(0,0,0,0.10)'

// ── The screen's own two edges ─────────────────────────────────────────────
// The same lift MIRRORED, cast INWARDS out of the top and the bottom edge of
// the SCREEN — the app's one global shade, applied in exactly two places
// (`ScreenEdgeShade.tsx`, hung off the root layout) and never by a page (user
// directive 2026-08-03). The top edge was a purple 0.5 → 0 linear gradient
// painted as an SVG rect and the bottom edge had nothing at all except on the
// one screen that happens to carry the dock, so a Circles page or the sign-in
// page simply ran off the bottom of the display. Now every screen in the app is
// bounded by the same black at the same rate, whatever is drawn inside it.
//
// Same drop, same blur and — since the user read it on the emulator at 0.20 and
// asked for half (2026-08-03) — the same STOP as RISE_SHADOW, so a seam inside
// the app and the edge of the screen are one treatment in every respect. The
// purple band this replaced was at 0.5 of INK, and the point of the exercise is
// that the top of the screen stops being the loudest thing on it.
// The shade is PAINTED as a band that falls from this stop to nothing
// (`ScreenEdgeShade.tsx`) rather than cast as a shadow: neither shadow build
// survives both platforms — an outset shadow off a box past the edge is clipped
// away by Android's view group, and the inset `boxShadow` that replaced it drew
// nothing at all on an iPhone (user report 2026-08-03). The look is unchanged by
// that: the same black at the same stop, over the same reach.
// HOW STRONG THE EDGE IS, and it is NOT the lift's stop (user, 2026-08-03). It
// was halved to 0.10 to match RISE_SHADOW after being read on the EMULATOR, and
// on a real phone — both platforms — the edge could not be seen at all. A shadow
// cast under a card is read against the white beside it; this one has nothing to
// be compared against, so it needs its own strength.
export const EDGE_SHADE_ALPHA = 0.2

// How far a shade reaches in from its edge, i.e. the distance over which it has
// fallen to nothing. It is the HEIGHT of the band. Stated rather than borrowed
// from the safe-area inset, because the fall is the design's and is identical on
// every device — with the ONE exception the top edge states for itself: a shade
// that carries the OS glyphs is as deep as the strip they stand in, since an
// Android strip is ~24-30dp against a notched iPhone's 47-59.
export const EDGE_SHADE_REACH = 26

// (`MARK_SHADOW`, the dock count disc's own lift, is DELETED — user directive
// 2026-08-03: every mark and every tile in the app now casts the ONE shadow
// below, and a mark with a stop of its own was a second answer to the same
// question.)

// The lift of a CARD LYING ON THE PAGE — the white box a list of rows is drawn
// on (the Circles hub, a roster, the search results). It is not a surface that
// came from below and it is not a mark: it is a sheet of white resting on the
// page tint, so the shade is SYMMETRIC (user directive 2026-08-03) — no drop,
// no direction, the same fall on all four sides, which is what says "laid on
// the surface" rather than "hovering over it". RISE_SHADOW's displaced band
// would say the card had come from somewhere, and the page under it is the
// thing it is resting on. Small: what has to read is the card's own edge
// against a tint only a shade away from its white, not depth. A single native
// boxShadow, never an Android `elevation`, which can only drop downwards.
//
// The stop was read on a device at four strengths on 2026-08-04 and settled
// HALFWAY between the last two: 0.08 and 0.12 were no shadow at all wherever
// the two grounds are close — a purple button on the page tint, a white tile on
// a pale photograph — and the round button's 0.16 was a shade heavy once every
// tile in the app was wearing it. THERE IS ONE STOP FOR EVERYTHING:
// `CARD_SHADOW_STRONG`, which that button carried while the card's stop was
// lower, is deleted. It stays small in every other respect: what has to read is
// the EDGE, not depth.

export const CARD_SHADOW = '0px 0px 8px 0px rgba(0,0,0,0.14)'

// (There is no shadow for chat's drag handle: the bar is the popup's bar
// exactly, and what holds it legible is the band of page ground it stands on —
// see `SheetHeader`, user directive 2026-08-03.)

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
// (SkeletonRows in CircleBits.tsx). A skeleton row keeps the real row's
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

// ── Misc UI dimensions ─────────────────────────────────────────────────────

// The radius is always half the height: the bar's ends are semicircles, so it
// reads as one drawn stroke rather than as a rounded rectangle, at whatever
// thickness it is set to.
export const DRAG_HANDLE = {
  width: 48,
  height: 6,
  radius: 3,
} as const

// ── Overlay sheets ─────────────────────────────────────────────────────────
// The app is one screen (page1) with everything else rising over it as a
// full-screen sheet. See OverlaySheet.tsx.

export const OVERLAY = {
  // Gap between the safe-area top inset and floating chrome (a sheet's close X).
  // Consumed via chromeTop() below, never added to an inset by hand.
  chromeGap: SM,
  // How far in from the START/END edge floating chrome sits: a sheet's close X
  // at the START, the card's report flag at `end`. The page gutter, MD.
  chromeInset: MD,
  // Paint order. (There is no `menu` step any more — the drawer is deleted,
  // 2026-07-30. Do not renumber the rest: the gaps are deliberate room.)
  //
  // `invite` no longer competes with the other two: the page2 card is laid out
  // INSIDE page1 now (user directive 2026-07-30 — both cards the game hands the
  // user are profiles on home, so neither covers the dock), so this step orders
  // it above the page1 card and nothing else. `chat` and `subPage` are the
  // surfaces the user opens, out in the shell, and they still cover everything.
  z: {
    invite: 10,
    chat: 20,
    subPage: 40,
  },
} as const

/** The ONE line floating chrome hangs from, measured from the top of the screen:
 *  a sheet's close X, and anything a body pins LEVEL with it (a card's top-END
 *  chip column). The call sites read it here rather than each adding the gap to
 *  an inset themselves. */
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

// ── Circles art ────────────────────────────────────────────────────────────
// The drawing that OPENS the empty Circles page (CirclesArt.tsx). Same frame
// and same hand as home's, but it carries no `opacity`: home's is page TEXTURE
// under the one big action, this one is the first thing the page says, so it is
// drawn at full strength.

export const CIRCLES_ART = {
  // A step under home's, because a title, a description and two labelled
  // actions stand under it and all of them have to fit a small screen.
  widthRatio: 0.72,
} as const

// ── Chat art ───────────────────────────────────────────────────────────────
// The drawing on a chat that has nothing in it yet (ChatArt.tsx). Full strength
// like the Circles one: it is the whole of what that page has to say until the
// first message lands.

export const CHAT_ART = {
  // The Circles page's own share. Only one line stands under this one, but the
  // surface it stands in is the shorter of the two — the message list gives up
  // the keyboard's height the moment the composer is touched — so the two
  // drawings come out the same size, which is what two pages that open with a
  // picture should be.
  widthRatio: 0.72,
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

// ── A number that CHANGED ──────────────────────────────────────────────────
// The dock's counts (HomeDock.tsx) sit in a corner the eye is not on, and they
// change while the user is looking at something else entirely: a request
// arrives, a watcher appears, a credit is spent. Swapping one digit for another
// says none of that. So a count that CHANGES BLINKS — three times, over two
// seconds (user directive 2026-07-31).
//
// It is a BLINK and not the attention PULSE above, which is why it does not
// reuse that block: the pulse is a continuous heartbeat and must never fully
// vanish (a dot that disappears reads as broken), while this is a one-shot on a
// mark that is already only a couple of digits wide, and what has to be caught
// out of the corner of the eye is the digit going away and coming back.
//
// The directive fixes the whole gesture and its count; the phase is what falls
// out of them, so it is derived HERE rather than at the one call site — a
// retune of the total must not leave a stale phase behind it.
const COUNT_BLINK_TIMES = 3
const COUNT_BLINK_TOTAL_MS = 2_000

export const COUNT_BLINK = {
  /** How many times the digit goes away and comes back. */
  times: COUNT_BLINK_TIMES,
  /** The whole gesture, start to finish. */
  totalMs: COUNT_BLINK_TOTAL_MS,
  /** One direction of one blink — a blink is two of these, hence the ×2. */
  phaseMs: COUNT_BLINK_TOTAL_MS / (COUNT_BLINK_TIMES * 2),
  /** All the way down: see above. */
  opacity: 0,
} as const
