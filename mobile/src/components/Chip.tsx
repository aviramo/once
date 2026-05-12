import { StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import Svg, { Path, Circle } from 'react-native-svg'
import { FONT_SCALE } from '../fonts'
import { RADIUS } from '../tokens'
import { PRIMARY, PRIMARY_BG, DESTRUCTIVE, WHITE, BLACK_SOFT, BLACK_STRONG } from '../colors'

// Shared pill chip used across cards (watcher list + match card). A soft
// tint of the tone color as background + same-hue icon/text — chips read as
// lightweight fabric swatches instead of bordered stickers. When `onPhoto`
// is set, the chip switches to a dark translucent scrim + white text so it
// stays readable over a color photo.

const TONES = {
  neutral:  { fg: BLACK_STRONG, bg: BLACK_SOFT  },
  positive: { fg: PRIMARY,      bg: PRIMARY_BG  },
  negative: { fg: DESTRUCTIVE,  bg: BLACK_SOFT  },
} as const

type ChipTone = keyof typeof TONES

export function Chip({
  renderIcon,
  text,
  tone = 'neutral',
  onPhoto = false,
  renderTrailing,
}: {
  renderIcon?: (color: string) => React.ReactNode
  text: string
  tone?: ChipTone
  onPhoto?: boolean
  renderTrailing?: (color: string) => React.ReactNode
}) {
  const { fg, bg } = TONES[tone]
  const bgColor = onPhoto ? BLACK_STRONG : bg
  const fgColor = onPhoto ? WHITE : fg
  return (
    <View style={[styles.chip, { backgroundColor: bgColor }]}>
      {renderIcon?.(fgColor)}
      <Text style={[styles.chipText, { color: fgColor }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.heading}>{text}</Text>
      {renderTrailing?.(fgColor)}
    </View>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────
// All chip icons render at 16×16 so chips share one baseline across cards.

const ICON_SIZE = 16

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

export function KidsIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={7} r={3} stroke={color} strokeWidth={2} />
      <Path d="M2 21v-2a6 6 0 0 1 12 0v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={17} cy={10} r={2.2} stroke={color} strokeWidth={2} />
      <Path d="M13 21v-1a4 4 0 0 1 8 0v1" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  )
}


const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
