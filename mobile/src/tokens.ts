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

// ── Common icon sizes ──────────────────────────────────────────────────────

export const ICON = {
  sm: 16,
  md: 18,
  lg: 20,
  xxl: 24,    // default glyph size — every standalone icon renders at this
  xxxl: 28,
  huge: 48,   // glyph inside RoundButton overlays (heart / pause / dots / add-photo / family)
} as const

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
// Skip-gesture RESISTANCE (page1 skip / page2 decline only — NOT the profile
// sheet, which should dismiss freely). The card follows the finger at this
// fraction of its speed up to the commit point, so the user must drag
// deliberately far for the card position to reach the half-screen threshold
// — a stray short drag barely moves it and can't skip a person by accident.
// Commit is keyed on the RESISTED card position (pullY), so this is also the
// effective effort gate: required finger travel ≈ commit distance / this.
// 1 = no resistance (legacy). Lower = firmer. Tune here only (single source).
export const PULL_RESIST = 0.6

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

// ── page1 candidate stack (Tinder/Bumble) ──────────────────────────────────
// Server fills relations.page1.profiles[] up to this size; every app/skip
// pops the front and the SAME call appends one fresh tail card, so the stack
// stays at STACK_SIZE forever (no separate "near the end" refill request).
// The client renders stack[0] with stack[1] mounted statically behind it and
// prefetches the images of the next few. MIRRORED in the SQL helpers
// (app_find / app_skip / app_find REFILL all hardcode 10) — keep in lockstep,
// same discipline as the credits / 30-min broadcast constants.
export const STACK_SIZE = 10
// How many upcoming stack cards' images to warm in expo-image's disk cache
// after each skip (the visible card + a small look-ahead). Purely a client
// prefetch depth; unrelated to the server stack size.
export const STACK_PREFETCH_AHEAD = 3

// ── Bottom-sheet lift shadow ───────────────────────────────────────────────
// Soft upward shadow that floats every BottomSheet off the backdrop. A single
// native boxShadow (the building-native-ui skill: never hand-stack shadow
// layers — use boxShadow). Replaces the old 20-View SHADOW_GRADIENT_* stack:
// same gentle lift, 1 node per popup instead of 20. All sheets share this; for
// a different lift fork via a prop, not by redefining the string.

export const SHEET_SHADOW = '0px -4px 24px 0px rgba(0,0,0,0.12)'

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
  // The side tab's "a new viewer just joined your list" attention pulse is
  // deliberately SHORTER than the generic 3-blink `alerting` (chat unread /
  // incoming invite): the user asked for exactly two blinks so a rising
  // viewer count reads as a quick double-tick, not a full alarm. Same
  // `alerting` machinery, just `viewerPulseCount` repeats instead of
  // `pulseCount`. `viewerPulseTimeoutMs` is the React-flag upper bound (≈
  // viewerPulseCount × 2 × default-withTiming 300ms + margin), matching how
  // `pulseTimeoutMs` relates to `pulseCount`.
  viewerPulseCount: 2,
  viewerPulseTimeoutMs: 1600,
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
  // Vertical nudge applied to standalone tab icons (renderIndicator). Flex
  // `alignItems: center` aligns BOXES; positive value pushes the icon DOWN.
  // MECHANISM: now a STATIC `styles.iconNudge` transform on the icon's outer
  // wrapper (the icon-side twin of styles.labelNudge), NOT the press worklet
  // — so it hot-reloads reliably, same as the label nudge.
  // Bumped 3 -> 4: the user asked to move BOTH the icons and the text down
  // by 1px together (labelLift -2 -> -3 in lockstep). Tunable live now that
  // both nudges use the reliable static mechanism.
  iconBaselineNudge: 4,
  // Upward nudge (px) applied to the tab LABEL cluster so its glyph centre
  // matches the icon's. Even with lineHeight == rowHeight and
  // includeFontPadding:false, Android renders the glyph low in its line-box,
  // so a flex-centred label sits a few px below a flex-centred icon; this
  // lifts it back to the icon's centre. Transform-only (no layout/width
  // change). THE single knob for label-vs-icon vertical alignment.
  //
  // MECHANISM (changed 2026-05-17): this used to live inside the
  // `pressLabelStyle` *worklet*. Reanimated serialises worklet-captured
  // constants to the UI thread and does NOT reliably rebuild them on Fast
  // Refresh, so retuning this number appeared to do nothing until a full
  // reload — and a constant layout offset has no business in an animated
  // worklet anyway. It is now a STATIC StyleSheet transform
  // (`styles.labelNudge`) on a wrapper SEPARATE from the one carrying the
  // animated press `scale`; two different views ⇒ the RN transform-array
  // "replace not merge" hazard does not apply, and a plain style prop
  // reflects edits on a normal Fast Refresh. Tune this and it actually moves.
  //
  // MAY GO NEGATIVE. Positive = lift the word UP; negative = push it DOWN
  // (styles.labelNudge applies `translateY: -labelLift`, so −2 ⇒ +2px down).
  // Same pattern as timerGap, which is already negative. With the static
  // mechanism finally hot-reloading, the user repeatedly reported the word
  // sitting too HIGH even at +3 (and at the matched icon baseline) — so the
  // glyph's real Android line-box offset is small here and the label needs a
  // DOWNWARD nudge, not an upward one. Now −3: the user asked to move BOTH
  // the text and the icons down by 1px together (−2 → −3 here, in lockstep
  // with iconBaselineNudge 3 → 4). Applies equally to the morph "Once" and
  // every normal label (both wrappers use `styles.labelNudge`), so they stay
  // mutually aligned. Chip-vs-content centring is a SEPARATE concern owned by
  // chipBaselineNudge (left as-is).
  labelLift: -3,
  // ── Gliding selected-tab lozenge ─────────────────────────────────────────
  // A flat translucent chip that slides behind the active tab AND spans that
  // tab's full width (minus this inset each side so adjacent chips never
  // touch). Tabs are very unequal (compact icons vs the wide flex "Once").
  //
  // POSITION/SIZE MODEL (ONE live, linear, LAYOUT-driven motion — user
  // choices, 2026-05-17): each tab's geometry IS its measured `onLayout`
  // width, in child order (the RN analogue of a CSS-resolved rect; never
  // `measureInWindow`/an analytic RTL mirror). Position AND size both
  // interpolate from the SAME live pager value (tabProgress, from
  // onPageScroll on the UI thread — the RN equivalent of a CSS/native
  // constraint, not a JS-thread loop), so the slide and the resize are one
  // synced motion that is perfectly LINEAR in the pager position. Size is
  // the real layout `width`/`height` (NOT scaleX/scaleY): a non-uniformly
  // scaled rounded rect cannot keep a constant-looking corner, so scaling is
  // gone and `borderRadius` is a single CONSTANT (indicatorRadius) that
  // never lerps or distorts. The chip is a single absolutely-positioned leaf
  // in an absolute-fill overlay, so per-frame width/height re-lays out only
  // that one node (no flex-row reflow). `bottom` is statically anchored, so
  // a taller height grows the chip UPWARD only (name Y unchanged — iron
  // rule), no scaleY counter-translate needed.
  //
  // WIDTH KNOB: chipW = (selected tab's measured width) − 2*indicatorInsetX.
  // 0 ⇒ the chip spans the FULL tab width (user: "the indicator must occupy
  // the whole tab width"). The two content tabs are forced to an identical
  // explicit width in TabStrip (see flexW), so the chip is identical AND
  // full on tab1 and tab2 whenever page2 carries a profile. Only ever ONE
  // chip on screen (it slides, never coexists with a second), so a 0 inset
  // can't make two pills touch. Reduced 8 -> 4 -> 0 at the user's request.
  indicatorInsetX: 0,
  // Vertical pad around the chip (top + bottom). Bottom-anchored at
  // `-indicatorPadV`. SHORT (no-timer) height = rowHeight + 2*indicatorPadV =
  // 44. When the SELECTED tab carries a sub-label (the invite countdown /
  // broadcast status word) the chip GROWS UPWARD into a taller 2-line shape
  // that ENCLOSES the timer sitting just above the name (user choice
  // 2026-05-17, replacing the old "timer floats as a caption above the
  // chip"). It grows up only — the static bottom anchor keeps the name's Y
  // unchanged (iron rule: tab labels never move). TALL height = SHORT +
  // timerGap + timerFontSize + CHIP_TOP_BAND, where CHIP_TOP_BAND is DERIVED
  // in TabStrip from the metric tokens so the air above the timer equals the
  // air below the name by construction (timerTopPad is just a 0-default
  // residual nudge on it). Per-tab height = SHORT/TALL in the hs[i] shared
  // values (instant first, withTiming(collapseDuration) when a selected tab
  // gains/loses its timer in place); the chip's live height interpolates
  // those by the live pager value, same as width.
  indicatorPadV: 6,
  // CONSTANT corner radius — applied unchanged at SHORT and TALL and all
  // through the motion (user 2026-05-17: "the radius must always stay the
  // same"). No tall variant, no height-lerp, no scale: at SHORT (h=44) 22
  // reads as a capsule; at TALL it's the same 22 corner on a taller rounded
  // rectangle. `borderCurve: 'continuous'` keeps the non-capsule corner soft.
  indicatorRadius: 22,
  // Tight vertical gap between the name (bottom line) and the timer line
  // ABOVE it, INSIDE the grown pill. Deliberately small — the user wants the
  // timer "צמוד לשם" (attached to the name). Single knob for that breathing
  // room; also feeds the TALL height derivation so the pill always wraps the
  // timer with the same gap. (subLabelOuter.bottom = rowHeight + timerGap.)
  // May go NEGATIVE: it just shifts subLabelOuter (and the derived TALL
  // height) down by |timerGap| px, pulling the timer down into the name
  // row's empty top slack (the name is centred + lifted by -labelLift, so
  // there is real whitespace above its glyph the timer can occupy without
  // colliding). Each keeps its own text line-box so both stay legible.
  // History: 2 -> 0 -> -8 (user wanted it ever tighter), then -8 -> -4 (user
  // asked for a little more air back between the timer and the name). Single
  // knob — make it more negative for tighter, less negative for more air.
  timerGap: -4,
  // Timer / sub-label font size (also its lineHeight, see styles.subLabel).
  // 20 — a deliberate step BETWEEN TEXT.lg (18) and TEXT.xl (24): the user
  // asked to enlarge the timer twice (16 -> 18 -> 20), but it must stay
  // below the name's TEXT.xl so the timer never reads as large as the name.
  // Feeds the TALL height derivation so the pill auto-grows to keep wrapping
  // the bigger glyph. Shared by the invite countdown AND the broadcast
  // status word (one sub-label tier, DRY). Single knob — nudge to resize.
  timerFontSize: 20,
  // The transient signed stars delta — "+1" / "-3" — rendered beside the
  // Menu-tab balance for one attention pulse after the wallet changes.
  // WITHOUT a badge/circle: just a bright, vivid signed number (POSITIVE/
  // NEGATIVE). Sized comfortably below the count so it reads as a small
  // delta annotation, not a second balance; well under `timerFontSize` so
  // it stays inside the sub-label line-box and does NOT affect CHIP_TALL.
  starDeltaFontSize: 14,
  // No longer a subscript — it now centres on the count baseline (the badge
  // that needed the drop is gone), so zero offset.
  starDeltaDropY: 0,
  // RESIDUAL fine-tune (px) added on top of the DERIVED symmetric top band.
  // The "make the air above the timer equal the air below the name" maths is
  // no longer a hand-tuned number: TabStrip derives CHIP_TOP_BAND from the
  // metric tokens (chipBaselineNudge, rowHeight, TEXT.xl, labelLift) so the
  // top pad equals the bottom pad BY CONSTRUCTION and self-corrects if those
  // tokens change. This stays only as a small ± eyeball nudge for Android
  // glyph-metric drift; default 0. Positive => a touch more top air.
  timerTopPad: 0,
  // Declarative Y-centring nudge for the chip (px, pushes it DOWN). The chip
  // is geometrically centred on the mainRow box, but the visible glyph sits
  // low in that box (Android font metrics) and the label cluster is itself
  // lifted by -labelLift, so a box-centred chip reads as sitting too high
  // above the ink. This shifts the whole capsule down via a static `bottom`
  // offset (declarative in the stylesheet, NOT computed) so its centre lands
  // on the tab's optical content centre. This is the SINGLE knob to tune if
  // the chip ever drifts vs. the text — change only this number. Raised
  // 3 -> 5 at the user's request: the name still read too low inside the
  // selected pill (too much air above the glyph, too little below), so the
  // capsule needed to come down a touch more onto the ink. Larger => chip
  // lower; CHIP_TOP_BAND and the container paddingBottom both depend on this
  // and self-correct, so it stays one coherent knob.
  chipBaselineNudge: 5,
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
