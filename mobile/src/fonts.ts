// Font family config shared between the _layout root (which loads the fonts
// with useFonts) and the AppText wrapper (which applies them per-Text).
//
// Layout / spacing / radius tokens live in `./tokens.ts` — import from there.

import { PixelRatio } from 'react-native'

export const DEFAULT_FAMILY = 'NotoSansHebrew_400Regular'
export const SINGLE_WEIGHT = false

// How much each class of text is allowed to grow when the user bumps the OS
// font-size slider. Pass as `maxFontSizeMultiplier` on <Text>/<TextInput>.
// - ui:      fixed-size chrome (buttons, badges, timestamps) — scaling would
//            blow out containers with hard-coded heights/widths.
// - heading: section titles and card names — small headroom so hierarchy
//            survives an accessibility bump.
// - body:    paragraph copy, descriptions, settings rows — this is the text
//            accessibility bumps are actually meant to help.
export const FONT_SCALE = {
  ui: 1.0,
  heading: 1.15,
  body: 1.3,
} as const

// Text and glyphs are sized in two different units: a `fontSize` is MULTIPLIED
// by the OS font scale before layout, while an Svg `width`/`height` in dp is
// not. At font_scale = 2.0 the labels doubled and every icon stayed put, so the
// icon column read as half-size next to its own text.
//
// `iconScale` is the other half of FONT_SCALE: it applies the same scale, with
// the same ceiling, to a glyph's dp footprint, so text and icon grow together
// and stop together. Applied once, in icons.tsx's `Glyph` wrapper — call sites
// keep passing plain ICON.* values.
//
// Clamped to `body` by default because that is the tier the icons actually sit
// beside (settings rows, chips, list labels); a glyph must never outgrow the
// text it labels. Scales below the ceiling are honoured in full.
//
// `cap` lowers that ceiling for a glyph living in a container that does NOT
// grow with the font scale. Pass FONT_SCALE.ui (1.0) inside a fixed-dp box —
// a round button is the case that matters: its diameter is a plain dp, so a
// glyph that keeps scaling changes the glyph-to-circle ratio per device and
// the same button reads crowded on one and lost on another. Call sites never
// pass this by hand; RoundButton declares it once via GlyphScale (icons.tsx).
export const iconScale = (size: number, cap: number = FONT_SCALE.body): number =>
  Math.round(size * Math.min(PixelRatio.getFontScale(), cap))

// Noto Sans Hebrew reserves more room above cap height (Latin ascenders, Hebrew
// diacritic space) than below the baseline, so the visible ink of a line sits
// BELOW the geometric centre of its line box. A glyph centred on the line box
// therefore reads a few pixels high — measured on Android at ~0.16 x the
// rendered font size, consistently across rows.
//
// `inkOffset` is that correction: nudge a glyph down by this much to centre it
// on the ink rather than on the box. Takes the UNSCALED font size and applies
// iconScale itself, so the correction tracks the OS font scale like everything
// else. includeFontPadding:false does NOT remove this — it trims the box, not
// the font's own ascent/descent asymmetry (verified on device: zero change).
// `cap` mirrors iconScale's — pass the same ceiling the labelled text is
// capped at, so the correction tracks the glyph it nudges.
export const inkOffset = (fontSize: number, cap: number = FONT_SCALE.body): number =>
  Math.round(iconScale(fontSize, cap) * 0.16)

export const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'NotoSansHebrew_400Regular',
  '500': 'NotoSansHebrew_500Medium',
  '600': 'NotoSansHebrew_600SemiBold',
  '700': 'NotoSansHebrew_700Bold',
  '800': 'NotoSansHebrew_800ExtraBold',
  normal: 'NotoSansHebrew_400Regular',
  bold: 'NotoSansHebrew_700Bold',
}
