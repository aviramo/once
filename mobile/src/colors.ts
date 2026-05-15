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
export const PRIMARY      = '#FF7A5C'
export const PRIMARY_BG   = 'rgba(255,122,92,0.10)'
// Solid "light coral" surface — used as a full-screen background where a
// translucent overlay would be wrong (the status bar can't accept alpha on
// Android and would mismatch the screen underneath). Designed to read as
// clearly coral while staying bright enough for BLACK text + icons.
export const PRIMARY_LIGHT = '#FFE9E0'
// ── Destructive ──────────────────────────────────────────────────────────
// Three tiers matching the BLACK_/WHITE_ philosophy.
export const DESTRUCTIVE        = '#D96B6B'                 // opaque — text, icon, button fill
export const DESTRUCTIVE_BG     = 'rgba(217,107,107,0.10)'  // 10% bg tint — pill, banner, accent surface
export const DESTRUCTIVE_MUTED  = 'rgba(180,60,60,0.60)'    // muted fg — icon/text/border at lower visual weight

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
