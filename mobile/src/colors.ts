import { useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { useThemeStore, type ThemeMode } from './stores/themeStore'

// ════════════════════════════════════════════════════════════════════════
// LEGACY STATIC TOKENS (do not delete during the theme migration)
// ────────────────────────────────────────────────────────────────────────
// These flat constants are the pre-theme palette. They are kept verbatim so
// any screen NOT yet migrated to useColors() keeps compiling and rendering
// exactly as before. Migrated screens read the themed, symmetric values from
// useColors() instead. Once every consumer is migrated these can be removed.
// ════════════════════════════════════════════════════════════════════════

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
export const SELECTION = 'rgba(0,0,0,0.25)'

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

// ════════════════════════════════════════════════════════════════════════
// THEMED PALETTE — perfect light/dark inversion (the new source of truth)
// ────────────────────────────────────────────────────────────────────────
// The user's spec: LIGHT = white background + dark elements; DARK = the
// EXACT inverse (black background + light elements); complete symmetry.
//
// So the model is dead simple and risk-free:
//   • LIGHT = the current static palette, verbatim (reuses the consts above
//     — DRY). A screen migrated to useColors() therefore looks IDENTICAL to
//     today in light mode → zero visual regression to reason about.
//   • DARK  = every LIGHT token run through invert() (per-channel RGB
//     inversion, alpha preserved). Because the inversion is uniform, every
//     token keeps its RELATIVE role (a surface stays a surface, ink stays
//     ink, a hairline stays a hairline) — just flipped. That makes the
//     per-screen migration purely MECHANICAL: prefix color identifiers with
//     `c.`, no per-call-site judgement, correct in both themes.
//
// `useThemedStyles(makeStyles)` keeps the per-component change to one line.
// ════════════════════════════════════════════════════════════════════════

export type Scheme = 'light' | 'dark'
export type { ThemeMode }

// Per-channel color inversion. Handles #rgb / #rrggbb, rgb()/rgba() (alpha
// kept), the literal 'transparent', and any string that merely CONTAINS
// colors (e.g. a boxShadow like '0px 4px 14px rgba(0,0,0,0.22)') — every
// color token inside is inverted, the rest of the string is untouched.
function invHex(h: string): string {
  let s = h.slice(1)
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  const n = parseInt(s.slice(0, 6), 16)
  const r = 255 - ((n >> 16) & 255)
  const g = 255 - ((n >> 8) & 255)
  const b = 255 - (n & 255)
  const h2 = (v: number) => v.toString(16).padStart(2, '0')
  return '#' + h2(r) + h2(g) + h2(b)
}
function invRgb(m: string): string {
  const p = m.replace(/rgba?\(|\)/g, '').split(',').map((x) => x.trim())
  const r = 255 - Number(p[0]), g = 255 - Number(p[1]), b = 255 - Number(p[2])
  return p.length > 3 ? `rgba(${r},${g},${b},${p[3]})` : `rgb(${r},${g},${b})`
}
export function invert(s: string): string {
  if (s === 'transparent') return s
  return s
    .replace(/rgba?\([^)]*\)/g, invRgb)
    .replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, invHex)
}

export interface Colors {
  scheme: Scheme
  // Semantic tokens (used by newly written code / _layout).
  bg: string
  fg: string
  fgMuted: string
  fgFaint: string
  line: string
  fill: string
  // Legacy-name keys — identical names to the static consts above, so a
  // screen migrates by a mechanical `X` → `c.X` prefix with NO renames and
  // NO semantic decisions (inversion preserves every token's role).
  BLACK: string
  WHITE: string
  BLACK_SOFT: string
  BLACK_MID: string
  BLACK_STRONG: string
  WHITE_SOFT: string
  WHITE_MID: string
  WHITE_STRONG: string
  PRIMARY: string
  PRIMARY_BG: string
  PRIMARY_LIGHT: string
  HEADER_TEXT_SHADOW: string
  HEADER_PILL_FILL: string
  HEADER_PILL_BORDER: string
  HEADER_PILL_SHADOW: string
  DESTRUCTIVE: string
  DESTRUCTIVE_BG: string
  SELECTION: string
  BORDER_SOFT: string
  ONLINE_GREEN: string
  PREMIUM: string
  ILLUSTRATION_WASH: string
  ILLUSTRATION_CLOUD: string
  ILLUSTRATION_BODY: string
  ILLUSTRATION_STRUCT: string
  ILLUSTRATION_LINE: string
  ILLUSTRATION_ACCENT: string
}

// LIGHT = today's palette, verbatim (reuses the consts → single source).
const LIGHT: Colors = {
  scheme: 'light',
  bg: WHITE,
  fg: BLACK,
  fgMuted: BLACK_STRONG,
  fgFaint: BLACK_MID,
  line: BORDER_SOFT,
  fill: BLACK_SOFT,
  BLACK, WHITE,
  BLACK_SOFT, BLACK_MID, BLACK_STRONG,
  WHITE_SOFT, WHITE_MID, WHITE_STRONG,
  PRIMARY, PRIMARY_BG, PRIMARY_LIGHT,
  HEADER_TEXT_SHADOW, HEADER_PILL_FILL, HEADER_PILL_BORDER, HEADER_PILL_SHADOW,
  DESTRUCTIVE, DESTRUCTIVE_BG,
  SELECTION, BORDER_SOFT, ONLINE_GREEN, PREMIUM,
  ILLUSTRATION_WASH, ILLUSTRATION_CLOUD, ILLUSTRATION_BODY,
  ILLUSTRATION_STRUCT, ILLUSTRATION_LINE, ILLUSTRATION_ACCENT,
}

// DARK = LIGHT with every color inverted (scheme tag excepted).
const DARK: Colors = (Object.fromEntries(
  Object.entries(LIGHT).map(([k, v]) => [k, k === 'scheme' ? 'dark' : invert(v)]),
) as unknown) as Colors

export const PALETTES: Record<Scheme, Colors> = { light: LIGHT, dark: DARK }

/** Resolve the effective scheme from the user's mode + device setting.
 * 'system' follows the device; 'light'/'dark' force it. */
export function resolveScheme(mode: ThemeMode, device: 'light' | 'dark' | null | undefined): Scheme {
  if (mode === 'light' || mode === 'dark') return mode
  return device === 'dark' ? 'dark' : 'light'
}

/** The themed palette for the current screen. Re-renders on device theme
 * change (useColorScheme) and on the settings toggle (themeStore) — the
 * whole app flips live, in perfect light/dark symmetry. */
export function useColors(): Colors {
  const device = useColorScheme()
  const mode = useThemeStore((s) => s.mode)
  return PALETTES[resolveScheme(mode, device)]
}

/** One-liner per component: `const styles = useThemedStyles(makeStyles)`.
 * `makeStyles` is a module-level `(c: Colors) => StyleSheet.create({...})`.
 * Recomputes only when the scheme actually changes (palette refs are
 * stable singletons). */
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const c = useColors()
  return useMemo(() => factory(c), [c])
}

