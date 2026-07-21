// ── Bordeaux & Gold — the single source of truth for colour ────────────────
//
// The app is a FIXED DARK scheme: deep bordeaux surfaces, gold content, and
// NO white anywhere. It is the same palette the marketing site wears, value
// for value — the hexes below are byte-identical to the site's CSS custom
// properties (web/public/styles.css), so the two can never drift apart:
//
//   app            web                 value
//   BG             --bg                #2C0A14
//   SURFACE_LIFT   --bg-2              #37101C
//   SURFACE        --surface           #42121F
//   SURFACE_SUNK   --surface-sunk      #260810
//   INK            --ink               #ECD7A0
//   INK_2          --ink-2             rgba(236,215,160,0.75)
//   INK_3          --ink-3             rgba(236,215,160,0.50)
//   GOLD           --brand             #E3B457
//   GOLD_STRONG    --brand-strong      #C79A3A
//   PRIMARY        --brand-ink         #2C0A14
//
// Change a value here and change it in styles.css in the same edit.

// ── Bordeaux surface ramp (darkest → lightest) ─────────────────────────────
// Every background in the app is one of these four. Nothing is ever white.
export const SURFACE_SUNK = '#260810'  // inset / recessed (input wells, tracks)
export const BG           = '#2C0A14'  // the page itself — screens, sheets
export const SURFACE_LIFT = '#37101C'  // a band lifted off the page
export const SURFACE      = '#42121F'  // cards / panels / dialogs

// ── Gold ink ramp (text + icons) ───────────────────────────────────────────
// Three tiers, mirroring the site's --ink ramp. INK is the primary reading
// colour; INK_2 is secondary/body; INK_3 is muted (hints, timestamps).
export const INK   = '#ECD7A0'
export const INK_2 = 'rgba(236,215,160,0.75)'
export const INK_3 = 'rgba(236,215,160,0.50)'

// Legacy names. The app used to be a light scheme (white surfaces, black
// ink), and ~270 call sites still say BLACK/WHITE for "the foreground
// colour". Both roles collapsed onto the one gold ink when the app went
// dark, so both alias INK rather than being re-typed at every call site —
// exactly how the site keeps its legacy --coral* names pointing at gold.
// Aliases, never a second copy of the value.
export const BLACK = INK
export const WHITE = INK

// ── Alpha overlay scales ───────────────────────────────────────────────────
// Both scales now sit on a DARK bordeaux surface, so both are gold-alpha.
// The two names survive from the light era (BLACK_* was "on a light surface",
// WHITE_* was "on a dark one"); they kept their separate tiers because the
// call sites lean on the different weights, not because the hue differs.
//
// BLACK_* — the quieter ramp: dividers, hairlines, soft chip fills, tracks.
export const BLACK_SOFT   = 'rgba(227,180,87,0.10)'  // dividers, soft borders, slider track, inactive chip bg
export const BLACK_MID    = 'rgba(227,180,87,0.28)'  // inactive bar/pill, spinner track, placeholder, checkbox border
export const BLACK_STRONG = 'rgba(236,215,160,0.62)' // muted icon, secondary label, body text on chips

// WHITE_* — the brighter ramp: fills and active states that must read as lit.
export const WHITE_SOFT   = 'rgba(227,180,87,0.14)'  // subtle fills (audio play btn, schedule cells, pressed bar)
export const WHITE_MID    = 'rgba(227,180,87,0.32)'  // borders, spinner track on a gold fill, scrims
export const WHITE_STRONG = 'rgba(236,215,160,0.85)' // strong text / active state on a filled bubble

// ── Gold accent ────────────────────────────────────────────────────────────
// The brand's action colour: primary buttons, selected states, highlights.
// GOLD is the site's --brand; GOLD_STRONG its --brand-strong (hover/pressed).
export const GOLD        = '#E3B457'
export const GOLD_STRONG = '#C79A3A'
export const GOLD_DEEP   = '#9A6F1E'  // deepest step, for a gold-on-gold edge
export const GOLD_SOFT   = 'rgba(227,180,87,0.14)'  // faint gold wash (chips, badges)
// Legacy alias: call sites that asked for the brightest gold. Same value.
export const GOLD_BRIGHT = GOLD

// ── Primary brand ──────────────────────────────────────────────────────────
// The bordeaux itself. Two jobs, one value: the deep brand fill, and the text
// colour that sits ON a gold surface (a gold button's label) — the site's
// --brand-ink. PRIMARY_BG is the faint brand wash; on a dark page that has to
// be a GOLD tint, since a bordeaux tint on bordeaux is invisible.
export const PRIMARY      = BG
export const PRIMARY_BG   = 'rgba(227,180,87,0.10)'
// A solid, lifted bordeaux used where a translucent overlay would be wrong
// (the Android status bar cannot accept alpha and would mismatch the screen
// underneath). Reads as clearly bordeaux while staying distinct from BG.
export const PRIMARY_LIGHT = SURFACE

// ── Borders ────────────────────────────────────────────────────────────────
// Gold hairlines, matching the site's --border / --border-strong.
export const BORDER_SOFT   = 'rgba(227,180,87,0.16)'
export const BORDER_STRONG = 'rgba(227,180,87,0.34)'

// ── Header chrome ─────────────────────────────────────────────────────────
// Flat, no gradients and no drop-shadow. Low-alpha depth behind the active
// label on the bordeaux header.
export const HEADER_TEXT_SHADOW = 'rgba(0,0,0,0.30)'
// Selected-tab gliding "lozenge": a borderless glass chip that slides behind
// the active tab. A native BlurView (expo-blur) provides the material.
//   • HEADER_PILL_TINT — the BlurView `tint`. `dark` matches the bordeaux
//     chrome; on Android `experimentalBlurMethod='dimezisBlurView'` blurs
//     whatever sits behind it and renders a visible chip on its own.
//   • HEADER_PILL_INTENSITY — 0..100. Higher = more material visible.
//   • HEADER_PILL_IOS_BASE — iOS-only translucent base laid BENEATH the
//     BlurView, which otherwise renders near-invisible over an opaque fill.
export const HEADER_PILL_TINT = 'dark' as const
export const HEADER_PILL_INTENSITY = 55
export const HEADER_PILL_SHADOW = '0px 6px 18px rgba(0,0,0,0.32)'
export const HEADER_PILL_IOS_BASE = 'rgba(227,180,87,0.18)'

// ── Photo-caption legibility ──────────────────────────────────────────────
// Gold text or gold SVG strokes laid directly over a user photo can vanish on
// a bright image. The mechanism is a dark scrim behind them, never a
// per-element shadow or halo: an element-level trick has to be re-invented for
// each element type (text takes textShadow, an SVG glyph does not), and the
// two never end up matching. A shared backdrop is uniform by construction.
// TRANSLUCENT BORDEAUX — the single fabric every piece of chrome wears when it
// sits ON TOP OF A PHOTO: the on-photo chips, every round overlay button, the
// spinner badge and the replacing overlay. It is the direct heir of the old
// 60%-black wash that did this job before the scheme went dark: same weight,
// same role, bordeaux instead of black, carrying GOLD ink instead of white.
//
// Deliberately TRANSLUCENT. An opaque chip covers the photograph, and the
// photograph is the point of the card — the scrim only has to darken enough
// for the gold to read, not hide what is underneath.
//
// The caption scrim on the profile card is the same idea but must be a
// gradient, and an SVG <Stop> needs a solid colour plus its own stopOpacity —
// so that one uses BG with stopOpacity, not this rgba. Same hue either way.
export const PHOTO_CHROME = 'rgba(44,10,20,0.60)'  // = BG at 60%
// The one opaque black in the palette, and the ONLY place black is allowed.
// It is not a brand colour and never a surface: it exists purely for DROP
// SHADOWS, whose whole job is to subtract light. A bordeaux or gold shadow
// does not read as a shadow. Never use it for a fill, a border or text.
export const SCRIM_BLACK = '#000000'

// ── Destructive — DELETED 2026-07-20 ─────────────────────────────────────
// There is no destructive colour. A warning hue read as a foreign alert banner
// wherever it landed — most visibly on the photo-sheet Delete row, which
// looked like an alert next to its own siblings. (Note: gold is the brand
// accent, so a destructive act must NOT borrow it — that would read as
// "premium", not "danger".) Do not reintroduce a warning hue.
//
// Express the role with WEIGHT and CONTRAST on the existing ramp instead:
//   • error / attention text .... INK at full strength
//   • a secondary destructive act BLACK_STRONG (muted)
//   • a destructive CONFIRM ...... the normal `primary` button — a delete
//                                  confirm looks like every other confirm; the
//                                  dialog copy and the warning haptic carry it

// ── Text selection ────────────────────────────────────────────────────────
// Highlight drawn behind selected text in every TextInput. MUST stay
// translucent: an opaque highlight under the gold ink renders an unreadable
// solid block. A gold ~25% wash keeps the glyphs legible while reading as a
// selection. The caret stays opaque INK via cursorColor.
export const SELECTION = 'rgba(227,180,87,0.25)'
// Kept as a distinct name for inputs drawn directly on a photo or on a gold
// fill, where the standard wash would disappear.
export const SELECTION_ON_DARK = 'rgba(236,215,160,0.28)'

// ── Semantic signals ──────────────────────────────────────────────────────
// The only non-gold colours in the app, and the only ones allowed to be.
// They encode meaning, not brand, so they stay their own hue — brightened to
// carry on the deep bordeaux.
export const ONLINE_GREEN = '#5FB97E'  // online dot / success indicator
export const POSITIVE     = '#5FD68F'  // an added-stars delta (+N)
export const NEGATIVE     = '#FF7A7A'  // a removed-stars delta (-N)

// ── Premium ──────────────────────────────────────────────────────────────
// Paid / premium affordances are gold — the luxe half of bordeaux + gold. It
// IS the accent; reference GOLD, never a second copy of the same hex.
export const PREMIUM = GOLD

// ── Illustration palette ──────────────────────────────────────────────────
// The empty-state spot illustrations (telescope = "visible/scanning",
// crescent moon = "hidden") are GOLD line-art on the bordeaux field — the same
// gold-on-bordeaux the brand wears everywhere else. Both illustrations share
// this one palette by contract (they are the same scene in two modes) —
// defined once here, never re-inlined per component.
//
// NOTE: opaque, hand-tuned golds — NOT low-alpha. The shapes are already drawn
// with per-path `opacity`; an alpha fill would double-composite against that
// and against the bordeaux field, muddying the ramp. Solid golds at each step
// keep the artwork crisp and the depth order exact.
//
// Layered for depth on the bordeaux sheet, darkest → brightest:
//   WASH   = the background itself — the moon's crescent cutout / lens-disc
//            core, i.e. the parts "carved back to the background"
//   CLOUD  bronze — drifting clouds, recede behind the figure (0.85 op.)
//   LINE   mid-gold — tube/moon outline & shade, craters
//   BODY   bright gold — the tube / moon face, the brightest shape
//   STRUCT bright gold — tripod legs & mount, the load-bearing lines
//   ACCENT bright gold — sparkles & lens ring (drawn at low opacity, so it
//          still reads as a faint twinkle distinct from the solid body)
export const ILLUSTRATION_WASH   = BG
export const ILLUSTRATION_CLOUD  = '#8A5A2A'
export const ILLUSTRATION_BODY   = GOLD
export const ILLUSTRATION_LINE   = GOLD_STRONG
export const ILLUSTRATION_STRUCT = GOLD
export const ILLUSTRATION_ACCENT = GOLD
