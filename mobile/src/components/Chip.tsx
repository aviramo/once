import { StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import Svg, { Path, Circle, Line } from 'react-native-svg'
import { FONT_SCALE } from '../fonts'
import { GREEN, GREEN_BG, GRAY, GRAY_BG } from '../colors'

// Shared pill chip used across cards (watcher list + match card). A soft
// tint of the tone color as background + same-hue icon/text — chips read as
// lightweight fabric swatches instead of bordered stickers.

const TONES = {
  neutral:  { fg: 'rgba(0,0,0,0.6)', bg: 'rgba(0,0,0,0.06)' },
  positive: { fg: GREEN, bg: GREEN_BG },
  negative: { fg: GRAY,  bg: GRAY_BG  },
} as const

export type ChipTone = keyof typeof TONES

export function Chip({
  renderIcon,
  text,
  tone = 'neutral',
}: {
  renderIcon?: (color: string) => React.ReactNode
  text: string
  tone?: ChipTone
}) {
  const { fg, bg } = TONES[tone]
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {renderIcon?.(fg)}
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.heading}>{text}</Text>
    </View>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────
// All chip icons render at 12×12 so chips share one baseline across cards.

const ICON_SIZE = 12

export function PinIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={9} r={2.5} stroke={color} strokeWidth={2} />
    </Svg>
  )
}

export function ClockIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function BellOnIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function BellOffIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={2} y1={2} x2={22} y2={22} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
