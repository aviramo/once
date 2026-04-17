import { View, StyleSheet } from 'react-native'
import { Text } from './AppText'
import { FONT_SCALE } from '../fonts'
import { WHITE } from '../colors'

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
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text} maxFontSizeMultiplier={FONT_SCALE.ui}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: WHITE,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 16,
  },
})
