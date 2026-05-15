import { forwardRef } from 'react'
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native'
import { DEFAULT_FAMILY, SINGLE_WEIGHT, WEIGHT_TO_FAMILY } from '../fonts'
import { BLACK } from '../colors'

// Drop-in replacement for react-native's Text that applies Heebo as the
// default font family and picks the correct weighted face (real bold, not
// synthetic) based on the fontWeight in the provided style. Replaces the
// monkey-patch of Text.render that stopped working under React 19.

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
      {...props}
      style={[props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput(props, ref) {
  const family = resolveFamily(props.style)
  return (
    <RNTextInput
      ref={ref}
      selectionColor={BLACK}
      cursorColor={BLACK}
      {...props}
      style={[props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})
