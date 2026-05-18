import { View, StyleSheet } from 'react-native'
import { Text } from './AppText'
import { StarIcon } from './icons'
import { FONT_SCALE } from '../fonts'
import { XS, SM, TEXT, WEIGHT, RADII, ICON } from '../tokens'

// The stars-cost badge shown INSIDE an action button in place of its icon:
// a rounded capsule holding a star glyph and the number of stars the action
// spends (e.g. ★ 2). One component so the invite / approve / broadcast
// buttons all render the cost identically; the caller passes the content
// `color` and capsule `bg` to fit the button it sits on (PRIMARY content on
// a white button, WHITE content on a PRIMARY one). No "×" — the user wants
// just the star glyph and the amount (the multiplication sign was removed).
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
      <StarIcon color={color} size={ICON.sm} />
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
