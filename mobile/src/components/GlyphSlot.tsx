import { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { GlyphScale } from './icons'
import { FONT_SCALE, inkOffset } from '../fonts'
import { TEXT, lh, TAP_SLOP } from '../tokens'

// The probe's content: one non-breaking space. It paints nothing, but it is
// what makes the text engine lay out a line at all (an empty string collapses).
const PROBE_CHAR = ' '

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
// The load-bearing detail is HOW the slot gets to be one line tall: an
// invisible one-character `Text`, carrying the same fontSize / lineHeight /
// font-scale ceiling as the label it stands beside. NOT a height computed in
// JS from `lh(...)` — Android 14+ runs `lineHeight` through its own non-linear
// font-scale curve and does NOT cap it with maxFontSizeMultiplier, so on a
// large-font device the real line box is far taller than any JS arithmetic
// predicts (measured: a 22dp line box rendering at ~37dp at font_scale 2.0)
// and every computed box put its glyph too high. The probe is measured by the
// same text engine that draws the label, so it is right by construction on
// every OS version, density and font scale.
//
// The glyph is centred against that probe by flexbox and then nudged down by
// `inkOffset` — the one correction that stays a pure function of the font size.
export function GlyphSlot({
  size = TEXT.md,
  cap = FONT_SCALE.body,
  width,
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
      <Text style={[styles.probe, { fontSize: size, lineHeight: lh(size) }]} maxFontSizeMultiplier={cap}>
        {PROBE_CHAR}
      </Text>
      <GlyphScale cap={cap}>
        <View style={{ transform: [{ translateY: inkOffset(size, cap) }] }}>{children}</View>
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
