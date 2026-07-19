export const BLACK = '#111111'
export const WHITE        = '#FFFFFF'

// ── Black-alpha overlay scale ──────────────────────────────────────────────
// Three tiers. Don't add intermediate values — "almost SOFT" reads identically
// to SOFT and creates drift across components. Each tier owns a clear role.
export const BLACK_SOFT   = 'rgba(0,0,0,0.08)'   // scrims, dividers, soft borders, slider track, inactive chip bg, illustration fill
export const BLACK_MID    = 'rgba(0,0,0,0.30)'   // inactive bar/pill, spinner track, input placeholder, checkbox border, Terms link
export const BLACK_STRONG = 'rgba(0,0,0,0.60)'   // muted icon, secondary label, body text on chips, sign-out icon, menu emphasis

// ── White-alpha overlay scale ──────────────────────────────────────────────
// Used inside dark surfaces (chat bubbles for me, dark dialogs) where text
// or controls sit on a tinted color. Three tiers matching BLACK_*.
export const WHITE_SOFT   = 'rgba(255,255,255,0.20)' // subtle fills (audio play btn on my bubble, schedule cells, attach-bar pressed)
export const WHITE_MID    = 'rgba(255,255,255,0.40)' // borders, spinner track on PRIMARY, light scrims
export const WHITE_STRONG = 'rgba(255,255,255,0.85)' // strong text/active state on my bubble, replace-floating btn bg

// ── Primary brand color ──────────────────────────────────────────────────
// Pure black. A confident, premium dark brand hue (white text and icons sit
// on it with maximum contrast). PRIMARY_BG is just PRIMARY at 10%
// (#000000 = rgb(0,0,0)) — keep the two in lockstep.
export const PRIMARY      = '#000000'
export const PRIMARY_BG   = 'rgba(0,0,0,0.10)'
// Solid "light coral" surface — used as a full-screen background where a
// translucent overlay would be wrong (the status bar can't accept alpha on
// Android and would mismatch the screen underneath). Designed to read as
// clearly coral while staying bright enough for BLACK text + icons.
export const PRIMARY_LIGHT = '#FFE9E0'

// ── Header (global top tab strip) ─────────────────────────────────────────
// Flat, no gradients and no drop-shadow (the user removed both). The header
// is a solid `PRIMARY` (deep wine) block, seamless with the PRIMARY status
// bar; its only separation from the white content below is the color
// contrast. Square, full-width bottom edge. Consumed only by home.tsx's
// `tabStripContainer`, which references PRIMARY directly for the fill — the
// only header-specific tokens are the white-text depth and the selected-tab
// lozenge below.
//
// Low-alpha depth behind the active (white) header label/timer on the dark
// header. Tracks selection because it's only on the active cross-fade layer
// — the wordmark gains a faint emboss exactly as its tab becomes selected.
export const HEADER_TEXT_SHADOW = 'rgba(0,0,0,0.30)'
// Selected-tab gliding "lozenge": a borderless glass chip that slides and
// resizes behind the active tab, tracking the pager swipe. A native
// BlurView (expo-blur) provides the frosted-glass material; a soft drop
// shadow gives it depth. No border, no gradient. The typography cross-fade
// rides on top of it.
//   • HEADER_PILL_TINT — the BlurView `tint`. `light` reads as a luminous
//     frosted overlay; on iOS it adapts to the system material; on Android
//     with `experimentalBlurMethod='dimezisBlurView'` the BlurView blurs
//     whatever lives behind it (the solid PRIMARY black) and renders a
//     visible frosted chip on its own.
//   • HEADER_PILL_INTENSITY — 0..100. Higher = more material visible.
//   • HEADER_PILL_IOS_BASE — iOS-only translucent white base laid BENEATH
//     the BlurView. The header is opaque PRIMARY (black), so on iOS the
//     `UIVisualEffectView` has nothing translucent to blur and renders
//     near-invisible (the original design assumed the header would
//     eventually turn translucent — it never did). The base gives the chip
//     a visible body on iOS while the system blur still composites on top
//     (still reads as glass). Android keeps the proven `dimezisBlurView`
//     path with no base, so its chip is byte-identical to before.
export const HEADER_PILL_TINT = 'light' as const
export const HEADER_PILL_INTENSITY = 55
export const HEADER_PILL_SHADOW = '0px 6px 18px rgba(0,0,0,0.32)'
export const HEADER_PILL_IOS_BASE = 'rgba(255,255,255,0.18)'

// ── Photo-caption legibility ──────────────────────────────────────────────
// White text or white SVG strokes laid directly over a user photo can vanish
// on a bright image. The mechanism is a BLACK_STRONG scrim behind them, never
// a per-element shadow or halo: an element-level trick has to be re-invented
// for each element type (text takes textShadow, an SVG glyph does not), and
// the two never end up matching. A shared backdrop is uniform by construction.
//
// Retired 2026-07-19: PHOTO_TEXT_SHADOW, a blurred text shadow whose last
// consumer was the settings profile-card label, sitting next to a pencil icon
// that faked the same effect with a wider black stroke underneath. They read
// as two different weights. Don't reintroduce per-element legibility.
// ── Destructive ──────────────────────────────────────────────────────────
// Warm gold/amber. The app surface is now the deep-wine PRIMARY everywhere,
// and the old red (#D96B6B) sat muddily on wine (red-on-red, low separation).
// Gold reads clearly as "caution / irreversible" on the wine field without
// competing with the brand hue, and stays inside the warm family so it does
// not look like a foreign accent. Two tiers: an opaque fill and a low-alpha
// bg tint. There is intentionally NO muted-gold foreground tier — the muted
// foreground role (Reset users / delete account / login-error border) uses
// the faded-white WHITE_MID instead, by the user's request that the gold not
// appear at lower visual weight.
export const DESTRUCTIVE        = '#E8B04B'                 // opaque — text, icon, button fill
export const DESTRUCTIVE_BG     = 'rgba(232,176,75,0.14)'   // low-alpha bg tint — pill, banner, accent surface on wine

// ── Text selection ────────────────────────────────────────────────────────
// Highlight drawn behind selected text in every TextInput (the shared
// AppTextInput default). MUST stay translucent: an opaque highlight under
// black text renders an unreadable solid block — the age-range "From" field
// (which uses selectTextOnFocus) showed a black box hiding the digits. A
// brand-tinted ~25% wash keeps the glyphs legible while reading as a
// selection. The caret stays opaque BLACK via cursorColor.
export const SELECTION = 'rgba(0,0,0,0.25)'

// ── Misc surface colors ──────────────────────────────────────────────────
// Soft border used on white pills/inputs.
export const BORDER_SOFT = '#E2DADA'
// Online dot / success indicator.
export const ONLINE_GREEN = '#2BB673'

// Signed-delta semantics (the stars +/- text in the Menu tab — no badge,
// no circle: just the coloured number). Deliberate green/red, the only
// place the app uses true semantic colour, by explicit user request.
// Brightened so the small +N / -N reads clearly on the pure-black header
// (the muted online-green was too dim there).
export const POSITIVE = '#3DDC84'  // bright green for an added-stars delta
export const NEGATIVE = '#FF5C5C'  // bright red for a removed-stars delta

// ── Premium ──────────────────────────────────────────────────────────────
// Purple band reserved for paid / premium affordances. Distinct hue from
// the brand coral so a premium control reads as "different surface" at a
// glance, not just "another orange button".
export const PREMIUM       = '#8B5CF6'

// ── Illustration palette ──────────────────────────────────────────────────
// The empty-state spot illustrations (telescope = "visible/scanning",
// crescent moon = "hidden") are white line-art on the pure-black PRIMARY
// field. The brand is strictly monochrome (black-only, no theme toggle), so
// the artwork carries NO hue at all — only a neutral white→gray ramp. An
// earlier rose/wine tint (#B86E80 / #E89AAB / #FFE9E0) was the last colored
// surface left in the app and clashed with the black-only direction; it is
// gone. Both illustrations share this one palette by contract (they are the
// same scene in two modes) — defined once here, never re-inlined per
// component.
//
// NOTE: opaque, hand-tuned greys — NOT low-alpha white. The shapes are
// already drawn with per-path `opacity`; an alpha fill would double-composite
// against that and against the black field, muddying the ramp. Solid greys at
// each step keep the artwork crisp and the depth order exact on pure black.
//
// Layered for depth on the black (PRIMARY) sheet, darkest → brightest:
//   WASH   = PRIMARY itself — the moon's crescent cutout / lens-disc core,
//            i.e. the parts "carved back to the background"
//   CLOUD  mid-grey — drifting clouds, recede behind the figure (0.85 op.)
//   LINE   light-grey — tube/moon outline & shade, craters (between body & bg)
//   BODY   white — the tube / moon face, the brightest shape
//   STRUCT white — tripod legs & mount, the load-bearing lines
//   ACCENT white — sparkles & lens ring (always drawn at low opacity, so it
//          still reads as a faint twinkle distinct from the solid-white body)
export const ILLUSTRATION_WASH   = PRIMARY
export const ILLUSTRATION_CLOUD  = '#8C8C8C'
export const ILLUSTRATION_BODY   = WHITE
export const ILLUSTRATION_LINE   = '#C4C4C4'
export const ILLUSTRATION_STRUCT = WHITE
export const ILLUSTRATION_ACCENT = WHITE
