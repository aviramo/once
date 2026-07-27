import { forwardRef } from 'react'
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native'
import { DEFAULT_FAMILY, FONT_SCALE, SINGLE_WEIGHT, TEXT_START, WEIGHT_TO_FAMILY } from '../fonts'
import { BLACK, SELECTION } from '../colors'

// Drop-in replacement for react-native's Text that applies Heebo as the
// default font family and picks the correct weighted face (real bold, not
// synthetic) based on the fontWeight in the provided style. Replaces the
// monkey-patch of Text.render that stopped working under React 19.
//
// It is also where the app's reading direction is declared, once, for every
// Text and TextInput in it — see TEXT_START in ../fonts. It goes FIRST in the
// style array so a call site's own textAlign/writingDirection still wins.

function flatten(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return style
}

function resolveFamily(style: any): string {
  const flat = flatten(style)
  const explicit = flat?.fontFamily
  if (explicit) return explicit
  const w = flat?.fontWeight != null ? String(flat.fontWeight) : '400'
  return WEIGHT_TO_FAMILY[w] ?? DEFAULT_FAMILY
}

// When the active font ships multiple weighted faces (Noto Sans Hebrew), we pin
// fontWeight to 'normal' so iOS doesn't synthesise bold on top of an
// already-bold face. For single-weight fonts (Varela Round) we leave
// fontWeight alone so the OS *does* synthesise bold for headings.
const weightOverride = SINGLE_WEIGHT ? {} : { fontWeight: 'normal' as const }

export const Text = forwardRef<RNText, TextProps>(function AppText(props, ref) {
  const family = resolveFamily(props.style)
  return (
    <RNText
      ref={ref}
      maxFontSizeMultiplier={FONT_SCALE.body}
      {...props}
      style={[TEXT_START, props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput(props, ref) {
  const family = resolveFamily(props.style)
  return (
    <RNTextInput
      ref={ref}
      maxFontSizeMultiplier={FONT_SCALE.body}
      selectionColor={SELECTION}
      cursorColor={BLACK}
      {...props}
      style={[TEXT_START, props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})
