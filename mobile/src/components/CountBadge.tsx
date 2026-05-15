import { StyleSheet } from 'react-native'
import { Text } from './AppText'
import { FONT_SCALE } from '../fonts'
import { TEXT, WEIGHT } from '../tokens'

// Pill-shaped count badge — shared across the app for inline numeric
// indicators (unread chat, watcher count, onboarding age, ...). One
// component so the size/weight/typography stay consistent when any surface
// grows a new counter.
export function CountBadge({
  value,
  color,
}: {
  value: number | string
  color: string
}) {
  const label = typeof value === 'number' && value > 99 ? '99+' : String(value)
  return (
    <Text style={[styles.text, { color }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{label}</Text>
  )
}

const styles = StyleSheet.create({
  text: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.extrabold,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 22,
  },
})
