// ── Green & Orange on white — the single source of truth for colour ────────
//
// A LIGHT scheme: warm off-white pages, white cards, near-black ink, with two
// hues that each own one job and never trade places:
//
//   ORANGE = ACTION.  Every surface the user acts on: primary buttons, the
//                     invite panel, the heart, the home centre disc, selected
//                     states. Also the positive signals (a like, presence, a
//                     positive delta) — acting and good news are one hue here.
//                     Ink on an orange fill is always WHITE.
//   GREEN  = INK.     The brand's text colour: chip labels and glyphs,
//                     headings, emphasis. Green is read, never pressed.
//
// Everything on top of a PHOTO is a WHITE chip with BLACK ink — the photo is
// the loudest thing on the card, so its chrome stays neutral and lets the two
// brand hues mean something.
//
// Taken from the two reference designs: the match card (white chips, black
// text, orange heart) and the invite popup (cream sheet, green headings,
// green primary button, white/green outlined secondary).

// ── Surfaces ───────────────────────────────────────────────────────────────
export const BG           = '#F6F3ED'  // the page / a popup sheet — warm off-white
export const SURFACE      = '#FFFFFF'  // cards, chips, list rows
export const SURFACE_LIFT = '#FBF9F5'  // a barely-lifted band
export const SURFACE_SUNK = '#EFEAE0'  // inset rows inside a sheet, input wells

// ── Ink ────────────────────────────────────────────────────────────────────
// Text is the deep brand GREEN, never a neutral black. Every reading surface
// in the app — a bio, a popup title, a settings row, a chip label — is inked
// in this one colour, which is what makes green read as "the app's voice"
// rather than as an accent sprinkled here and there.
//
// `BLACK` is the legacy name (~100 call sites predate the green scheme) and
// aliases INK. One definition, two names, never two copies. It is NOT black:
// for something that must actually subtract light, see SCRIM_BLACK.
export const INK   = '#2B4F40'
export const BLACK = INK
export const WHITE = '#FFFFFF'
export const INK_2 = 'rgba(43,79,64,0.72)'  // secondary / body
export const INK_3 = 'rgba(43,79,64,0.48)'  // muted: hints, timestamps

// ── Alpha overlay scales ───────────────────────────────────────────────────
// BLACK_* sits on a LIGHT surface, WHITE_* on a dark one (a photo, a green
// fill). Three tiers each — don't add intermediate values, "almost SOFT"
// reads identically to SOFT and drifts across components.
export const BLACK_SOFT   = 'rgba(0,0,0,0.06)'  // dividers, soft borders, tracks, inactive chip bg
export const BLACK_MID    = 'rgba(0,0,0,0.28)'  // inactive bar/pill, spinner track, placeholder, checkbox border
export const BLACK_STRONG = 'rgba(0,0,0,0.58)'  // muted icon, secondary label, body text on chips

export const WHITE_SOFT   = 'rgba(255,255,255,0.20)'  // subtle fills on a dark/green surface
export const WHITE_MID    = 'rgba(255,255,255,0.42)'  // borders, spinner track on a green fill
export const WHITE_STRONG = 'rgba(255,255,255,0.86)'  // strong text / active state on a filled surface

// ── GREEN — the action colour ──────────────────────────────────────────────
// Primary buttons, selected states, headings, popup row icons. WHITE is the
// ink that sits on a green fill; GREEN_DEEP is green used AS text on the
// light page (a heading), where the button green is a touch light to read.
export const GREEN        = '#417A62'
export const GREEN_STRONG = '#35634F'  // pressed / hover
// Green used AS text on the page. That is exactly what INK is, so this is an
// alias — the same hex written twice would be free to drift.
export const GREEN_DEEP   = INK
export const GREEN_SOFT   = 'rgba(65,122,98,0.12)'  // faint green wash (chips, row fills)

// ── ORANGE — the positive colour ───────────────────────────────────────────
// The heart, a like, presence, a positive delta. Status, not navigation.
export const ORANGE       = '#E4573D'
export const ORANGE_SOFT  = 'rgba(228,87,61,0.14)'
// A lighter orange for SECONDARY text that belongs to the orange group (a row
// subtitle under an orange label). Alpha rather than a second hex so it can
// never drift away from ORANGE itself.
export const ORANGE_MUTED = 'rgba(228,87,61,0.72)'

// ── Primary brand ──────────────────────────────────────────────────────────
// The brand fill IS the action orange — one value, so a "primary" surface and
// an "action" surface can never drift apart. Ink on it is WHITE.
export const PRIMARY      = ORANGE
export const PRIMARY_BG   = ORANGE_SOFT
// A solid, light brand-tinted surface for the rare full-screen case where a
// translucent overlay would be wrong (the Android status bar cannot accept
// alpha and would mismatch the screen underneath).
export const PRIMARY_LIGHT = '#E8F0EB'

// ── Borders ────────────────────────────────────────────────────────────────
export const BORDER_SOFT   = '#E5DFD4'  // hairlines on the warm page
export const BORDER_STRONG = 'rgba(65,122,98,0.38)'  // a green outline (secondary button)

// ── Header chrome ─────────────────────────────────────────────────────────
// Flat, no gradients and no drop-shadow.
export const HEADER_TEXT_SHADOW = 'rgba(0,0,0,0.18)'
// Selected-tab gliding "lozenge": a borderless glass chip that slides behind
// the active tab. A native BlurView (expo-blur) provides the material.
export const HEADER_PILL_TINT = 'light' as const
export const HEADER_PILL_INTENSITY = 55
export const HEADER_PILL_SHADOW = '0px 6px 18px rgba(0,0,0,0.18)'
export const HEADER_PILL_IOS_BASE = 'rgba(255,255,255,0.30)'

// ── On-photo chrome ───────────────────────────────────────────────────────
// Everything that sits ON TOP OF A PHOTO — the chips, every round overlay
// button — is a WHITE tile carrying BLACK ink, exactly as in the reference
// card. Opaque on purpose: the photo underneath is arbitrary, so the chip has
// to supply its own contrast rather than hope the picture is dark enough.
export const PHOTO_CHROME = '#FFFFFF'
// The one opaque black in the palette, and the ONLY place black is allowed as
// a fill. Not a brand colour: it exists for DROP SHADOWS and for SVG gradient
// stops that darken a photo behind a caption — things whose job is to
// subtract light. Never a surface, a border or text.
export const SCRIM_BLACK = '#000000'

// ── Text selection ────────────────────────────────────────────────────────
// Must stay translucent: an opaque highlight under the ink renders an
// unreadable solid block. The caret stays opaque via cursorColor.
export const SELECTION = 'rgba(65,122,98,0.25)'
// The same role inverted, for an input whose text is WHITE on a dark or green
// field, where the wash above would disappear.
export const SELECTION_ON_DARK = 'rgba(255,255,255,0.28)'

// ── Semantic signals ──────────────────────────────────────────────────────
// POSITIVE is ORANGE by explicit instruction (2026-07-21): orange is the
// app's "good news" hue, green is reserved for things you press. NEGATIVE
// keeps its own red — it is the one meaning neither brand hue can carry.
export const ONLINE_GREEN = ORANGE   // presence dot: someone is here NOW
export const POSITIVE     = ORANGE   // an added-stars delta (+N)
export const NEGATIVE     = '#C0392B' // a removed-stars delta (-N)

// ── Premium ──────────────────────────────────────────────────────────────
// Paid / premium affordances are ORANGE — the same "good news" hue as the
// heart, so buying reads as a positive, not as another navigation button.
export const PREMIUM = ORANGE

// ── Illustration palette ──────────────────────────────────────────────────
// The empty-state spot illustrations (telescope = "visible/scanning",
// crescent moon = "hidden") are GREEN line-art on the light page. Both share
// this one palette by contract (they are the same scene in two modes) —
// defined once here, never re-inlined per component.
//
// NOTE: opaque, hand-tuned steps — NOT low-alpha. The shapes are already drawn
// with per-path `opacity`; an alpha fill would double-composite against that
// and against the page, muddying the ramp.
//
// Layered for depth, lightest → darkest:
//   WASH   = the page itself — the moon's crescent cutout / lens-disc core,
//            i.e. the parts "carved back to the background"
//   CLOUD  pale green — drifting clouds, recede behind the figure
//   LINE   mid green — tube/moon outline & shade, craters
//   BODY   deep green — the tube / moon face, the anchor shape
//   STRUCT deep green — tripod legs & mount, the load-bearing lines
//   ACCENT orange — sparkles & lens ring: the one positive spark in the scene
export const ILLUSTRATION_WASH   = BG
export const ILLUSTRATION_CLOUD  = '#BBD2C6'
export const ILLUSTRATION_BODY   = GREEN_DEEP
export const ILLUSTRATION_LINE   = GREEN
export const ILLUSTRATION_STRUCT = GREEN_DEEP
export const ILLUSTRATION_ACCENT = ORANGE
