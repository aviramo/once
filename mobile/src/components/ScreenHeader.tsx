import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { IconPressable } from './IconPressable'
import { BackIcon } from './icons'
import { BLACK } from '../colors'
import { SINGLE, DOUBLE, BUTTON, TEXT as FSIZE, WEIGHT } from '../tokens'

// App-wide screen / sub-page header. Single source of truth for the title bar:
// fixed height, centered title, optional back button on the leading edge, and
// an optional trailing slot for actions. Mirrored automatically via flex in
// RTL. Use this on every sub-page or modal screen; never re-implement the row.

export function ScreenHeader({
  title,
  onBack,
  trailing,
  style,
}: {
  title: string
  /** When provided, renders a leading back button calling this. */
  onBack?: () => void
  /** Optional element in the trailing slot (mirrors back in RTL). */
  trailing?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <IconPressable style={styles.btn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
      ) : (
        <View style={styles.btn} />
      )}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.btn}>{trailing ?? null}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
  },
  btn: {
    minWidth: DOUBLE + SINGLE * 2,
    paddingHorizontal: SINGLE,
    paddingVertical: BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: FSIZE.h2,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    letterSpacing: -0.5,
    lineHeight: 26,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
})
