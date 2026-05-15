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
// Deep wine / burgundy. A confident, premium dark brand hue (white text and
// icons sit on it with strong contrast). PRIMARY_BG is just PRIMARY at 10%
// (#890824 = rgb(137,8,36)) — keep the two in lockstep.
export const PRIMARY      = '#890824'
export const PRIMARY_BG   = 'rgba(137,8,36,0.10)'
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
// Selected-tab gliding "lozenge": a flat translucent-white chip (NO
// gradient) that slides and resizes behind the active tab, tracking the
// pager swipe. A crisp hairline rim and a soft dark lift make it read as a
// chip floating on the deep-wine header. The typography cross-fade rides on
// top of it.
export const HEADER_PILL_FILL = 'rgba(255,255,255,0.18)'
export const HEADER_PILL_BORDER = 'rgba(255,255,255,0.38)'
export const HEADER_PILL_SHADOW = '0px 4px 14px rgba(0,0,0,0.22)'

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
export const SELECTION = 'rgba(137,8,36,0.25)'

// ── Misc surface colors ──────────────────────────────────────────────────
// Soft border used on white pills/inputs.
export const BORDER_SOFT = '#E2DADA'
// Online dot / success indicator.
export const ONLINE_GREEN = '#2BB673'

// ── Premium ──────────────────────────────────────────────────────────────
// Purple band reserved for paid / premium affordances. Distinct hue from
// the brand coral so a premium control reads as "different surface" at a
// glance, not just "another orange button".
export const PREMIUM       = '#8B5CF6'

// ── Illustration palette ──────────────────────────────────────────────────
// The empty-state spot illustrations (telescope = "visible/scanning",
// crescent moon = "hidden") used to be painted in a stray peach/tan set
// (#FAD7C9 / #F1E8E2 / #E0CFC4 / #C9B8AE) that belonged to no other surface
// and clashed with the deep-wine PRIMARY header sitting right above them.
// They are now a single tonal set in the SAME wine/rose family as PRIMARY,
// so the artwork reads as the same brand surface as the header instead of
// an unrelated sticker. Both illustrations share this one palette by
// contract (they are the same scene in two modes) — defined once here,
// never re-inlined per component.
//
// The app surface is now the deep-wine PRIMARY everywhere, so the ramp was
// re-tuned to read as a clean, premium white/rose line illustration ON wine
// (it used to be a dark-on-white ramp). Same contract: both illustrations
// share this one palette, defined once here, never re-inlined per component.
//
// NOTE: opaque, hand-tuned hues — NOT low-alpha white. A translucent white
// over wine desaturates into a chalky pink that reads as washed-out; solid
// hues at each step keep the artwork crisp on the saturated wine field.
//
// Layered for depth on the wine (PRIMARY) sheet:
//   WASH   = PRIMARY itself — the moon's crescent cutout / lens-disc core,
//            i.e. the parts "carved back to the background"
//   CLOUD  dusty rose — drifting clouds, recede behind the figure (0.85 op.)
//   BODY   white — the tube / moon face, the brightest shape
//   LINE   soft rose — tube/moon outline & shade, craters (between body & bg)
//   STRUCT white — tripod legs & mount, the load-bearing lines
//   ACCENT warm light — sparkles & lens ring (was PRIMARY; invisible on wine)
export const ILLUSTRATION_WASH   = PRIMARY
export const ILLUSTRATION_CLOUD  = '#B86E80'
export const ILLUSTRATION_BODY   = WHITE
export const ILLUSTRATION_LINE   = '#E89AAB'
export const ILLUSTRATION_STRUCT = WHITE
export const ILLUSTRATION_ACCENT = PRIMARY_LIGHT
