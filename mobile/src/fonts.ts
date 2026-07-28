// Font family config shared between the _layout root (which loads the fonts
// with useFonts) and the AppText wrapper (which applies them per-Text).
//
// Layout / spacing / radius tokens live in `./tokens.ts` — import from there.

import { PixelRatio, type TextStyle } from 'react-native'
import { isRTL } from './i18n'

export const DEFAULT_FAMILY = 'NotoSansHebrew_400Regular'
export const SINGLE_WEIGHT = false

// THE reading direction of every piece of text in the app, applied ONCE in the
// AppText wrapper (and in _layout's defaultProps safety net for stray RN Text).
//
// Why it has to be said out loud, on iOS: a Text with no explicit alignment
// gets NSTextAlignmentNatural, and iOS resolves "natural" against the app's own
// UI language — NOT against the Hebrew characters in the string, and NOT
// against I18nManager.forceRTL. The bundle has no Hebrew localization, so
// natural resolved to LEFT and every un-aligned label in an RTL layout was
// pushed to the row's END edge: the settings rows' labels sat far from the icon
// that names them, the communities rows' titles and section headings hugged the
// wrong edge, and a Hebrew sentence's trailing punctuation bidi-flipped to the
// wrong side. Setting baseWritingDirection is what makes "natural" mean "the
// direction this app reads in" (RCTTextAttributes.effectiveParagraphStyle).
//
// `writingDirection` is an iOS-only style prop — Android's text pipeline never
// reads it (it aligns per the string's own script, which is why Android has
// always looked right), so this is an iOS fix with no Android side effects.
//
// Deliberately NOT paired with `textAlign: 'left'`. That pair only lands on the
// start edge when the native view's layout direction is RTL, which depends on
// forceRTL having propagated; the writing direction alone doesn't. A call site
// that wants something OTHER than start-aligned (centred titles, a numeric
// column, an LTR-pinned code field) still overrides both, since its own style
// is applied after this one.
export const TEXT_START: TextStyle = {
  writingDirection: isRTL ? 'rtl' : 'ltr',
}

// The same rule for a FIELD, and it has to be stated physically. A TextInput's
// PLACEHOLDER is drawn from its own attributed string, which iOS never gives
// the base writing direction above — so in an RTL app every empty field showed
// its placeholder (and then the text typed into it) pinned to the LEFT edge,
// on the far side of the box from where the user reads. `textAlign` is the one
// thing that reaches both the placeholder and the value.
//
// Applied once, in AppText's TextInput wrapper, and ONLY when the call site
// stated no alignment of its own: a centred code field, a centred bio and an
// LTR-pinned value all keep saying what they want and still win.
export const INPUT_START: TextStyle = {
  textAlign: isRTL ? 'right' : 'left',
}

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

// fontWeight → the real weighted face to render it with. The app itself only
// ever asks for two of these: 400 (the default) and 600 (WEIGHT.semibold, the
// single emphasis tier — see tokens.ts). 500/700 stay mapped as the landing
// spot for a stray `fontWeight: 'bold'` or a third-party style we don't own;
// 800 is gone with the extrabold token, so nothing can resolve to a face that
// is no longer loaded (see _layout's useFonts).
export const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'NotoSansHebrew_400Regular',
  '500': 'NotoSansHebrew_500Medium',
  '600': 'NotoSansHebrew_600SemiBold',
  '700': 'NotoSansHebrew_700Bold',
  normal: 'NotoSansHebrew_400Regular',
  bold: 'NotoSansHebrew_700Bold',
}
