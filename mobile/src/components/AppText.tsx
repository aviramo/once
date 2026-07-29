import { forwardRef } from 'react'
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native'
import { DEFAULT_FAMILY, FONT_SCALE, INPUT_START, SINGLE_WEIGHT, TEXT_START, WEIGHT_TO_FAMILY } from '../fonts'
import { INK, SELECTION } from '../colors'

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

// This Text measures NOTHING. It used to: a string carrying the meta separator
// was laid out once, the lines the platform reported were read back, and it was
// re-rendered with hard newlines and no interpunct across them — the rule that a
// separator dot never opens or closes a line. That mechanism is gone
// (2026-07-29). It rested on `onTextLayout` reporting the TEXT of each line, and
// on the device it did not: the dot came back at the start of a wrapped line in
// the shared-circles popup. The rule now lives where it cannot fail, in the fact
// line itself (components/MetaLine.tsx), which lays its facts out as elements
// and simply stops painting a separator that lands at a break — so the base Text
// is back to being a base Text, with no layout handlers on every string in the
// app.
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
  // Start-align every field, unless the call site already said where its text
  // goes — as a prop or in its style (see INPUT_START in ../fonts).
  const aligned = props.textAlign != null || flatten(props.style)?.textAlign != null
  return (
    <RNTextInput
      ref={ref}
      maxFontSizeMultiplier={FONT_SCALE.body}
      selectionColor={SELECTION}
      cursorColor={INK}
      {...props}
      style={[TEXT_START, aligned ? null : INPUT_START, props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})
