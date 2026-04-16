// Font family config shared between the _layout root (which loads the fonts
// with useFonts) and the AppText wrapper (which applies them per-Text).
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
export const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'NotoSansHebrew_400Regular',
  '500': 'NotoSansHebrew_500Medium',
  '600': 'NotoSansHebrew_600SemiBold',
  '700': 'NotoSansHebrew_700Bold',
  '800': 'NotoSansHebrew_800ExtraBold',
  normal: 'NotoSansHebrew_400Regular',
  bold: 'NotoSansHebrew_700Bold',
}
