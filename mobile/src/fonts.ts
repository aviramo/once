// Font family config shared between the _layout root (which loads the fonts
// with useFonts) and the AppText wrapper (which applies them per-Text).
//
// Rubik renders heavier at every weight than Heebo, so each requested weight
// is mapped down one step (700→SemiBold, 800→Bold, etc.). This keeps the
// rounded letterforms of Rubik while matching the visual weight the UI was
// originally tuned against.
export const DEFAULT_FAMILY = 'Rubik_400Regular'
export const SINGLE_WEIGHT = false
export const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'Rubik_400Regular',
  '500': 'Rubik_400Regular',
  '600': 'Rubik_500Medium',
  '700': 'Rubik_600SemiBold',
  '800': 'Rubik_700Bold',
  normal: 'Rubik_400Regular',
  bold: 'Rubik_600SemiBold',
}
