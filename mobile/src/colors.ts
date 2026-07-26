// ── Purples on beige — the single source of truth for colour ───────────────
//
// A LIGHT scheme. The whole palette is a handful of purples, THREE beiges, WHITE,
// and one semi-transparent BLACK for shadows. Nothing else. The constant NAMES
// `GREEN`/`ORANGE` are kept as legacy labels for their ROLES (like `BLACK`
// aliasing the ink) — the values are purple, the jobs are unchanged:
//
//   INK/GREEN/PRIMARY = the ONE regular purple. Everything: all text, headings,
//                      titles, SELECTED surfaces, AND every in-app action — the
//                      buttons, the heart, presence, positive signals. Ink on a
//                      filled one is WHITE (user directive 2026-07-25: one purple
//                      in-app, no separate action hue).
//   PRESSED = the darkest step. The ONLY place the deep purple survives: a button
//                      momentarily HELD DOWN. Never text, never a resting fill.
//   ORANGE  = the BRAND MARK only. #6C3FB2 survives solely on the launcher / store
//                      icon disc + web --brand; nothing INSIDE the app uses it.
//
// The purples, dark → light:
//   PRESSED           #33265B  pressed/hover ONLY (the one deep step)
//   INK/GREEN/PRIMARY #5C4A94  EVERYTHING in-app: text, headings, selected, actions
//   GREEN_HALF        #8A7DB2  muted: placeholders, hints, empty states
//   ORANGE            #6C3FB2  the brand-mark disc (icon + web) ONLY
//   PRIMARY_GROUND    #D1C2D9  pale surfaces: icon ground, washes, soft tiles
//
// THERE ARE NO GREYS: every muted step is a translucent INK purple, so the
// surface never drifts to neutral grey. Every `rgba()` below is one of these
// at an opacity — transparency, not another colour.

// ── Surfaces: three beiges + white ──────────────────────────────────────────
// The scheme is warm end to end: even the surfaces that lift OFF the page are a
// beige now, not white. Three warm steps, lightest → darkest:
//   SURFACE  #FAF6EE  beige-3, the LIGHTEST: every surface that sits ABOVE the
//                     page (cards, chips, list rows, fields, buttons, on-photo
//                     chrome). A gentle warm lift off BG, where white used to be.
//   BG       #F3EEE6  beige-1: the page itself, the sheets, the popups.
//   BORDER   #E5DFD4  beige-2: the one hairline / rule, and inset wells.
// WHITE is no longer a surface — it survives ONLY as ink/glyphs on a dark or
// purple fill (see WHITE below).
export const BG           = '#F3EEE6'  // beige-1: the page, sheets, popups
export const SURFACE      = '#FAF6EE'  // beige-3 (LIGHTEST): cards, chips, rows, fields, buttons — the warm lift off the page
export const SURFACE_LIFT = SURFACE    // a barely-lifted band = light beige over the page beige
export const BORDER_SOFT  = '#E5DFD4'  // beige-2: the one hairline / rule colour
export const SURFACE_SUNK = BORDER_SOFT // inset rows, input wells = the same beige-2

// ── Ink (the REGULAR brand purple) ───────────────────────────────────────────
// Text is the brand PURPLE, never a neutral black. `BLACK` is the legacy name
// (~100 call sites) and aliases INK. It is NOT black: the only real black is
// SCRIM_BLACK, for shadows. INK is the MEDIUM purple #5C4A94 — the same value as
// GREEN. All text, titles, headings and selected states are this one regular
// purple; the deep #33265B is PRESSED, reserved for held-down states only
// (user directive 2026-07-25).
export const INK   = '#5C4A94'
export const BLACK = INK
// Pure white — INK ONLY now (text / glyphs / spinner arcs on a dark or purple
// fill). Never a surface: every white tile became the light beige SURFACE above.
export const WHITE = '#FFFFFF'
// The one deep step, HELD-DOWN states only (a pressed row/button). Never text,
// never a resting fill — the sole survivor of the old darkest purple.
export const PRESSED = '#33265B'
export const INK_2 = 'rgba(92,74,148,0.72)'  // secondary / body
export const INK_3 = 'rgba(92,74,148,0.48)'  // muted: hints, timestamps

// ── Muted INK ramp (INK at three opacities) ─────────────────────────────────
// BLACK_* is the legacy name — nothing here is black, it is INK purple laid
// translucent. WHITE_* is its counterpart on a dark or filled surface.
export const BLACK_SOFT   = 'rgba(92,74,148,0.10)'  // dividers, soft borders, tracks, inactive chip bg
export const BLACK_MID    = 'rgba(92,74,148,0.32)'  // inactive bar/pill, spinner track, placeholder, checkbox border
export const BLACK_STRONG = 'rgba(92,74,148,0.62)'  // muted icon, secondary label, disabled text

export const WHITE_SOFT   = 'rgba(255,255,255,0.20)'  // subtle fills on a purple surface
export const WHITE_MID    = 'rgba(255,255,255,0.42)'  // borders, spinner track on a purple fill
export const WHITE_STRONG = 'rgba(255,255,255,0.86)'  // strong text / active state on a filled surface

// ── GREEN (the REGULAR brand purple; legacy name) ────────────────────────────
// Headings, selected states, popup row icons, chips. Same value as INK — the
// text ink and the brand are ONE regular purple now. WHITE is the ink on a
// filled brand surface. GREEN_DEEP folds into INK (a heading is the regular
// purple, not a deeper one); GREEN_STRONG is the held-down PRESSED step (the
// one place the deep purple survives).
export const GREEN        = INK        // the regular purple = the text ink
export const GREEN_STRONG = PRESSED    // pressed / hover = the deep step
export const GREEN_DEEP   = INK        // this hue used AS page text = INK
export const GREEN_SOFT   = 'rgba(92,74,148,0.12)'  // faint brand wash (chips, row fills)
// Bio text on its beige band = the medium brand purple.
export const BIO_INK = GREEN

// ── GREEN_HALF (purple #3 — muted) ───────────────────────────────────────────
// Where a muted element must still read PURPLE (a placeholder, a hint, an empty
// state) a low-alpha ink would desaturate to grey — so this is a SOLID
// half-strength purple. GREEN_WASH is its pale-surface partner, folded into the
// pale ground (purple #5) so incoming bubbles and soft tiles share it.
export const GREEN_HALF = '#8A7DB2'  // muted purple INK: placeholders, hints, empty states

// ── ORANGE (the brand-mark purple; legacy name) ──────────────────────────────
// #6C3FB2 is now ONLY the app's brand mark: the launcher / store icon disc, the
// splash, the favicon / og-image, and the web landing page's --brand. NOTHING
// inside the app uses it anymore — every in-app action / positive / heart /
// presence was unified onto the ONE regular purple (see PRIMARY below), so the UI
// reads as a single purple while the icon keeps its established brand tone.
export const ORANGE       = '#6C3FB2'
export const ORANGE_SOFT  = 'rgba(108,63,178,0.14)'  // brand-mark wash (web only)

// ── Primary brand (the in-app action purple) ─────────────────────────────────
// The in-app action fill = the ONE regular purple (GREEN/INK #5C4A94), the SAME
// value as every heading and selected surface. Buttons, the heart, chat "mine"
// bubbles, chips and every positive signal are this single purple now (user
// directive 2026-07-25) — the saturated #6C3FB2 stays on the brand ICON only.
// A held-down button darkens to PRESSED; ink on the fill is WHITE.
export const PRIMARY      = GREEN
export const PRIMARY_BG   = GREEN_SOFT

// ── PRIMARY_GROUND (purple #5 — the pale step) ───────────────────────────────
// ORANGE flattened over BG at 25% into a solid hex, for the surfaces where alpha
// can't go: the launcher icon, adaptive-icon background, splash, web favicon /
// og-image (app.json). `scripts/build-icons.mjs` recomputes this mix and refuses
// to build if it has drifted, so it is derived, never hand-picked. Every other
// pale-purple surface folds into it: incoming chat bubbles / soft tiles (GREEN_WASH).
export const PRIMARY_GROUND = '#D1C2D9'  // ORANGE at 25% over BG
export const GREEN_WASH     = PRIMARY_GROUND  // muted purple SURFACE: incoming bubbles, soft tiles

// ── Status strip ─────────────────────────────────────────────────────────────
// The fade behind the OS status glyphs (`StatusBarBand`), the regular INK
// purple, applied at a 0.5 → 0 vertical fade in the component (stops live there).
export const STATUS_BAND = INK

// ── On-photo chrome ───────────────────────────────────────────────────────
// Everything ON TOP OF A PHOTO — the chips, every round overlay button — is a
// light-beige tile (the same beige-3 SURFACE as every other lifted surface);
// the photo underneath is arbitrary so it must supply its own contrast.
export const PHOTO_CHROME = SURFACE

// ── The one black: shadows only ──────────────────────────────────────────────
// The ONLY black in the palette, and the only place black is allowed. Its job is
// to SUBTRACT LIGHT: drop shadows (shadowColor = this, opacity set per elevation)
// and the soft dark halo that keeps white on-photo glyphs legible over any photo.
// Never a surface, a border, or text. PHOTO_INK_SHADOW is this same black baked
// at the halo's opacity (a text/SVG shadow can't take a separate opacity prop),
// and PHOTO_INK_SHADOW_FILTER is the ready-to-use CSS drop-shadow string.
export const SCRIM_BLACK = '#000000'
export const PHOTO_INK_SHADOW = 'rgba(0,0,0,0.9)'
export const PHOTO_INK_SHADOW_FILTER = 'drop-shadow(0px 1px 4px rgba(0,0,0,0.9))'

// The soft lift shadow every floating tile over a photo casts — the round
// overlay buttons AND the on-photo chips — so they read as one fabric sitting
// off the image. Discrete RN shadow props (not a boxShadow string) so it also
// carries the Android `elevation` the buttons rely on. Single source: both
// RoundButton and Chip spread this, never re-type the numbers.
export const LIFT_SHADOW = {
  shadowColor: SCRIM_BLACK,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 6,
} as const

// ── Text selection ────────────────────────────────────────────────────────
// Must stay translucent: an opaque highlight under the ink renders an unreadable
// solid block. The caret stays opaque via cursorColor.
export const SELECTION = 'rgba(92,74,148,0.25)'

// ── Semantic signals ──────────────────────────────────────────────────────
// No red in the palette (2026-07-25): NEGATIVE, an error or a removed-stars
// delta, is the regular INK purple. No second accent hue, and no deep tone —
// the deep purple is PRESSED-only now (user directive 2026-07-25).
export const ONLINE_GREEN = PRIMARY  // presence dot: someone is here NOW (the one purple)
export const NEGATIVE     = INK      // an error / a removed-stars delta (-N)

// ── Premium ──────────────────────────────────────────────────────────────
// Paid / premium affordances are the one action purple — the same hue as the heart.
export const PREMIUM = PRIMARY

