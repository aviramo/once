import { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { GlyphScale } from './icons'
import { FONT_SCALE, inkOffset } from '../fonts'
import { TEXT, lh, TAP_SLOP } from '../tokens'

// The probe's content: one non-breaking space. It paints nothing, but it is
// what makes the text engine lay out a line at all (an empty string collapses).
const PROBE_CHAR = ' '

// ── THE way the app learns how tall a real line of text is ─────────────────
// An invisible one-character `Text` carrying a label's own fontSize and
// font-scale ceiling — and, like every label in the app, NO declared lineHeight,
// so the font's own leading sets its box exactly as it sets the label's (see
// FONT_LINE_RATIO in ../fonts). It is laid out by the same text engine that draws
// the label, so it is right by construction on every OS version, density and
// font scale — which no JS arithmetic can be: Android 14+ runs a declared
// `lineHeight` through its own non-linear font-scale curve and does NOT cap it
// with maxFontSizeMultiplier (measured: a 22dp line box rendering ~37dp at
// font_scale 2.0), while `fontSize` stays capped. That divergence is why nothing
// declares one any more, and why this probe never did the arithmetic.
//
// Two callers, one probe. `GlyphSlot` below lets it SET the height of the box it
// centres a glyph in. `Chip` reads that height back through `onHeight` to work
// out the padding that keeps its tile exactly a round chrome button tall — a
// reader passes a `style` that takes the probe out of flow, so it measures
// without occupying anything.
export function LineProbe({
  size,
  cap,
  style,
  onHeight,
}: {
  size: number
  cap: number
  style?: StyleProp<TextStyle>
  onHeight?: (height: number) => void
}) {
  return (
    <Text
      style={[styles.probe, { fontSize: size }, style]}
      maxFontSizeMultiplier={cap}
      onLayout={onHeight ? e => onHeight(e.nativeEvent.layout.height) : undefined}
    >
      {PROBE_CHAR}
    </Text>
  )
}

// ── THE way a glyph stands beside a line of text ───────────────────────────
// One implementation for every icon that labels a line: the chip's leading and
// trailing glyphs, the settings row's leading glyph, the button's start icon.
// Two things have to be true and neither is free:
//
// 1. The glyph centres on the label's FIRST line, never on the whole block —
//    a wrapped label is two lines tall and a glyph centred on that floats into
//    the gap between them. So the slot is exactly ONE line tall.
// 2. It centres on that line's INK, not on its line box (see `inkOffset`).
//
// The load-bearing detail is HOW the slot gets to be one line tall: the
// `LineProbe` above, laying out a line at the same fontSize and font-scale
// ceiling as the label it stands beside. NOT a height computed in JS from
// `lh(...)` — see the probe's own note for why that can never be right on a
// large-font device.
//
// The glyph is centred against that probe by flexbox and then nudged down by
// `inkOffset` — the one correction that stays a pure function of the font size
// and of WHICH SCRIPT the label is written in, which is why `label` is worth
// passing: Hebrew ink stops lower than Latin ink, and a person's name is user
// data, not UI language (see inkOffset).
export function GlyphSlot({
  size = TEXT.md,
  cap = FONT_SCALE,
  width,
  label,
  onPress,
  style,
  children,
}: {
  /** The font size of the label this glyph stands beside. */
  size?: number
  /** The label's own `maxFontSizeMultiplier`. The glyph inherits it too, so a
   *  large-font device can never grow the icon past the text it labels. */
  cap?: number
  /** Fixes the slot's width so a column of rows starts its labels at the same
   *  x even when one glyph is drawn wider than the others. Omit to hug. */
  width?: number
  /** THE TEXT THIS GLYPH STANDS BESIDE. Not for reading — for measuring: the
   *  line's own script decides how far below its box centre its ink sits, and a
   *  label is not always the app's language (a name, a number). Omitted, the
   *  nudge falls back to the app's direction, which is what every call site did
   *  before there was a way to say otherwise. */
  label?: string
  /** Makes the glyph its own press target (the chip's report shield). */
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const Container: any = onPress ? Pressable : View
  return (
    <Container
      onPress={onPress}
      hitSlop={onPress ? TAP_SLOP : undefined}
      style={[styles.slot, width != null ? { width } : null, style]}
    >
      <LineProbe size={size} cap={cap} />
      <GlyphScale cap={cap}>
        <View style={{ transform: [{ translateY: inkOffset(size, cap, label) }] }}>{children}</View>
      </GlyphScale>
    </Container>
  )
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Zero width so the probe adds height and nothing else: it is a measuring
  // stick, not content. At width 0 its advance never reaches the slot's own
  // width, so a hugging slot is still exactly as wide as its glyph.
  probe: { width: 0 },
})
