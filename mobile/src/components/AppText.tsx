import { forwardRef, useCallback, useEffect, useRef } from 'react'
import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps } from 'react-native'
import { DEFAULT_FAMILY, FONT_SCALE, INPUT_START, SINGLE_WEIGHT, TEXT_START, WEIGHT_TO_FAMILY } from '../fonts'
import { INK, SELECTION } from '../colors'
import { useRiseArrived } from './RisingCard'

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
      // THE font-scale ceiling, for every string in the app — one number, so a
      // bumped OS font size scales the whole app by one factor instead of
      // re-ranking it (see FONT_SCALE in ../fonts). Every explicit
      // `maxFontSizeMultiplier` at a call site was deleted when this landed, and
      // nothing may reintroduce one: the only override left in the app is
      // GlyphSlot's invisible LineProbe, which is not painted text but a
      // measuring stick for a glyph's box, and needs to be able to measure at the
      // box's ceiling rather than the label's.
      maxFontSizeMultiplier={FONT_SCALE}
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
  // `autoFocus` means "focus when my surface has ARRIVED" — see RiseArrival in
  // RisingCard.tsx for why a field focused mid-entrance stays mis-measured for
  // as long as it holds focus. Captured at mount and never re-read, so a field
  // in a settled surface (every field outside a rising one) is handed the
  // platform's own autoFocus, untouched, exactly as before.
  const arrived = useRiseArrived()
  const deferred = useRef(!arrived).current
  const own = useRef<RNTextInput | null>(null)
  const focusedOnce = useRef(false)
  const setRef = useCallback((node: RNTextInput | null) => {
    own.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as { current: RNTextInput | null }).current = node
  }, [ref])
  useEffect(() => {
    if (!deferred || !arrived || !props.autoFocus || focusedOnce.current) return
    focusedOnce.current = true
    own.current?.focus()
  }, [deferred, arrived, props.autoFocus])
  return (
    <RNTextInput
      ref={setRef}
      // The same one ceiling a label gets: a field and its own label may never
      // scale apart.
      maxFontSizeMultiplier={FONT_SCALE}
      selectionColor={SELECTION}
      cursorColor={INK}
      {...props}
      autoFocus={props.autoFocus && !deferred}
      style={[TEXT_START, aligned ? null : INPUT_START, props.style, { fontFamily: family, ...weightOverride }]}
    />
  )
})
