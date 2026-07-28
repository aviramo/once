// ── Purple on white — the single source of truth for colour ────────────────
//
// A LIGHT scheme with exactly TWO ingredients: PURPLE and WHITE. There is no
// beige, no grey, no second accent hue, no red, no green (user directive
// 2026-07-28 — the warm palette is gone, and so are the old hue-named tokens
// `GREEN` / `ORANGE` / `BLACK`, which named a colour the value had not been for
// months).
//
// Every name here says the ROLE and the STRENGTH, never a hue that could drift:
//   PAGE / SURFACE / SURFACE_SUNK / LINE  — what a pixel of background is
//   INK, INK_PRESSED, INK_MUTED, INK_PALE — solid purple, dark → light
//   INK_BODY … INK_WASH                   — the SAME purple laid translucent
//   WHITE, WHITE_STRONG … WHITE_SOFT      — white, solid and translucent
//
// The solid purples, dark → light:
//   INK_PRESSED  #33265B  the one deep step — HELD-DOWN states only
//   INK          #5C4A94  EVERYTHING: text, headings, selected, every action,
//                         AND the brand mark itself (the launcher / store icon
//                         glyph, the web --brand). There is no separate brand
//                         hue any more: the old #6C3FB2 `BRAND_MARK` was the
//                         last colour in the app that was not this purple, and
//                         it is gone (user directive 2026-07-28).
//   INK_MUTED    #8A7DB2  muted but still purple: placeholders, hints, empties
//   INK_PALE     #DACFEC  pale ground: incoming bubbles, soft tiles
//
// THERE ARE NO GREYS: every muted step is a translucent INK purple, so a
// surface can never drift to neutral grey. Every `rgba()` below is INK (or
// white) at an opacity — transparency, not another colour.

// ── The one white ──────────────────────────────────────────────────────────
// White is half the palette: it is the lifted SURFACE (see below) AND the ink
// on any filled purple (text, glyphs, spinner arcs).
export const WHITE = '#FFFFFF'

// ── Surfaces: white + the palest purples ───────────────────────────────────
// Cool end to end. Two steps of background plus the one rule colour:
//   SURFACE       #FFFFFF  every surface that sits ABOVE the page (cards,
//                          chips, list rows, fields, buttons, on-photo
//                          chrome) AND every POPUP / rising sheet (user
//                          directive 2026-07-28: popups are white). The clean
//                          lift off PAGE.
//   PAGE          #F1EEF8  the page itself, and only the page — INK laid at
//                          ~9% over white, so the page is a purple whisper and
//                          a white card or popup visibly floats on it.
//   SURFACE_SUNK  #E2DEEC  INK at ~18%: inset rows and input wells, and the
//                          one hairline / rule (LINE is the same value under
//                          its own name, because a rule is not a surface).
export const PAGE         = '#F1EEF8'
export const SURFACE      = WHITE
export const SURFACE_SUNK = '#E2DEEC'
export const LINE         = SURFACE_SUNK

// ── INK — the ONE purple ───────────────────────────────────────────────────
// All text, titles, headings and selected states are this single regular
// purple, and so is every in-app action: the buttons, the heart, presence, the
// positive signals. Ink on a filled one is WHITE (user directive 2026-07-25:
// one purple in-app, no separate action hue).
export const INK = '#5C4A94'
// The one deep step, HELD-DOWN states only (a pressed row / button). Never
// text, never a resting fill.
export const INK_PRESSED = '#33265B'
// Where a muted element must still read PURPLE (a placeholder, a hint, an empty
// state) a low-alpha ink would wash out — so this is a SOLID half-strength
// purple, not a transparency.
export const INK_MUTED = '#8A7DB2'
// The pale step: a solid pale purple for surfaces where alpha can't go —
// incoming chat bubbles, soft tiles, the pale wash behind a sheet's close X.
export const INK_PALE = '#DACFEC'

// ── INK at alpha (transparency, not new colours) ───────────────────────────
// One ramp, strongest → faintest. Pick by the ROLE listed, never by hunting a
// number: two things that should read the same weight take the same token.
export const INK_BODY   = 'rgba(92,74,148,0.72)'  // secondary / body text
export const INK_SUBTLE = 'rgba(92,74,148,0.62)'  // muted icon, secondary label, disabled text
export const INK_HINT   = 'rgba(92,74,148,0.48)'  // hints, timestamps
export const INK_DIM    = 'rgba(92,74,148,0.32)'  // inactive bar/pill, spinner track, placeholder, checkbox border
export const INK_WASH   = 'rgba(92,74,148,0.12)'  // a FILL: selected row grounds, soft washes

// ── WHITE at alpha (on a filled purple surface) ────────────────────────────
export const WHITE_STRONG = 'rgba(255,255,255,0.86)'  // strong text / active state on a purple fill
export const WHITE_MID    = 'rgba(255,255,255,0.42)'  // borders, spinner track on a purple fill
export const WHITE_SOFT   = 'rgba(255,255,255,0.20)'  // subtle fills on a purple surface

// ── Role aliases ───────────────────────────────────────────────────────────
// One value, named where a call site reads better for it. Never a new colour.

// Everything ON TOP OF A PHOTO — the chips, every round overlay button — is a
// white tile; the photo underneath is arbitrary so it must supply its own
// contrast.
export const PHOTO_CHROME = SURFACE
// The fade behind the OS status glyphs (`StatusBarBand`): INK, applied at a
// 0.5 → 0 vertical fade in the component (the stops live there).
export const STATUS_BAND = INK
// Presence dot: someone is here NOW.
export const PRESENCE = INK
// An error, or a removed-stars delta (-N). No red in the palette (2026-07-25).
export const NEGATIVE = INK
// Paid / premium affordances — the same purple as the heart.
export const PREMIUM = INK

// ── Text selection ─────────────────────────────────────────────────────────
// Must stay translucent: an opaque highlight under the ink renders an unreadable
// solid block. The caret stays opaque via cursorColor.
export const SELECTION = 'rgba(92,74,148,0.25)'

// ── The one black: shadows only ────────────────────────────────────────────
// The ONLY black in the palette, and the only place black is allowed. Its job
// is to SUBTRACT LIGHT: drop shadows (shadowColor = this, opacity set per
// elevation) and the dim scrim behind a rising sheet. Never a surface, a
// border, or text.
export const SHADOW_BLACK = '#000000'

// The soft lift shadow every floating tile over a photo casts — the round
// overlay buttons AND the on-photo chips — so they read as one fabric sitting
// off the image. Discrete RN shadow props (not a boxShadow string) so it also
// carries the Android `elevation` the buttons rely on. Single source: both
// RoundButton and Chip spread this, never re-type the numbers.
export const LIFT_SHADOW = {
  shadowColor: SHADOW_BLACK,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 6,
} as const
