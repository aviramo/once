import { forwardRef, useState } from 'react'
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native'
import { DEFAULT_FAMILY, FONT_SCALE, INPUT_START, SINGLE_WEIGHT, TEXT_START, WEIGHT_TO_FAMILY } from '../fonts'
import { META_SEP, reflowMeta } from '../lib/meta'
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

// A meta line ("Open · 21 members · 11 match you") may not leave a separator
// dot stranded at the start or the end of a line (user directive 2026-07-28).
// The composer (lib/meta.ts) glues each dot to the fact after it, which settles
// the end of a line; the start of one can only be settled by measurement, so it
// is settled HERE, in the base Text, for every string in the app: a plain-string
// child carrying the separator is laid out once, and re-rendered with hard
// newlines where it actually broke and no separator across them. Nothing opts
// in, so no screen can forget the rule (a communities-only MetaText component
// used to own this, and the rows that never adopted it kept the stranded dot).
// Text without the separator never measures: `onTextLayout` is attached only
// while a reflow is pending, and dropped for good once it lands.
function useMetaReflow(children: TextProps['children'], onTextLayout: TextProps['onTextLayout']) {
  const raw = typeof children === 'string' ? children : null
  const [flow, setFlow] = useState<{ src: string; out: string } | null>(null)
  const flowed = flow && flow.src === raw ? flow.out : null
  if (raw == null || flowed != null || !raw.includes(META_SEP)) {
    return { children: flowed ?? children, onTextLayout }
  }
  return {
    children: raw,
    onTextLayout: (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      onTextLayout?.(e)
      const out = reflowMeta(raw, e.nativeEvent.lines)
      if (out != null) setFlow({ src: raw, out })
    },
  }
}

export const Text = forwardRef<RNText, TextProps>(function AppText(props, ref) {
  const family = resolveFamily(props.style)
  const meta = useMetaReflow(props.children, props.onTextLayout)
  return (
    <RNText
      ref={ref}
      maxFontSizeMultiplier={FONT_SCALE.body}
      {...props}
      onTextLayout={meta.onTextLayout}
      style={[TEXT_START, props.style, { fontFamily: family, ...weightOverride }]}
    >
      {meta.children}
    </RNText>
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
