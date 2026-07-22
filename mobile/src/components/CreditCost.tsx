import { View, StyleSheet } from 'react-native'
import { Text } from './AppText'
import { CoinIcon } from './icons'
import { FONT_SCALE } from '../fonts'
import { XS, SM, TEXT, WEIGHT, RADII, ICON } from '../tokens'

// The credits-cost badge shown INSIDE an action button in place of its icon:
// a rounded capsule holding a coin glyph and the number of credits the
// action spends. One component so the invite / approve / broadcast buttons
// all render the cost identically. The coin (not a heart) is what makes the
// badge legible on the invite button, whose own glyph IS a heart.
//
// The capsule INVERTS its host button: on the gold action buttons it is a
// solid BORDEAUX capsule carrying GOLD content, so the badge reads as its own
// object rather than dissolving into the fill (a faint tint of the label
// colour was invisible on gold). The caller passes both, so a badge on some
// future dark button can invert the other way.
//
// No "×" — the user wants just the heart glyph and the amount (the
// multiplication sign was removed).
export function CreditCost({
  cost,
  color,
  bg,
}: {
  cost: number
  /** Coin + text color. Match the host button's label color. */
  color: string
  /** Capsule fill. A faint tint of `color` reads as a chip on the button. */
  bg: string
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <CoinIcon color={color} size={ICON.sm} />
      <Text
        style={[styles.text, { color }]}
        maxFontSizeMultiplier={FONT_SCALE.ui}
        numberOfLines={1}
      >
        {/* Just the amount — the "×" was removed at the user's request. */}
        {`${cost}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: XS,
    paddingHorizontal: SM,
    paddingVertical: XS,
    borderRadius: RADII.pill,
  },
  text: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.extrabold,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontVariant: ['tabular-nums'],
  },
})
