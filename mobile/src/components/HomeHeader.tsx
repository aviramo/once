import { useEffect } from 'react'
import { View, StyleSheet, I18nManager } from 'react-native'
import { Text } from './AppText'
import Svg, { Circle, Path } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, Easing,
} from 'react-native-reanimated'
import { IconPressable } from './IconPressable'
import { CountBadge } from './CountBadge'
import { FONT_SCALE, SINGLE } from '../fonts'
import { TEXT, GREEN } from '../colors'
import { SyncWishLogo } from './SyncWishLogo'

const isRTL = I18nManager.isRTL

// ── Icons ────────────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  )
}

function SettingsArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 15 6 L 9 12 L 15 18' : 'M 9 6 L 15 12 L 9 18'} />
    </Svg>
  )
}

function DownArrowIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5 L12 19 M5 13 L12 20 L19 13" />
    </Svg>
  )
}

function SideArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 9 6 L 15 12 L 9 18' : 'M 15 6 L 9 12 L 15 18'} />
    </Svg>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  const rotation = useSharedValue(0)

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 700, easing: Easing.linear }),
      -1, false,
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  return (
    <Animated.View style={[{ width: 22, height: 22 }, animStyle]}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Circle cx={11} cy={11} r={8} stroke="rgba(0,0,0,0.12)" strokeWidth={2.5} fill="none" />
        <Path
          d="M 11 3 A 8 8 0 0 1 19 11"
          stroke={TEXT}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  )
}

// ── Icon slot with crossfade ──────────────────────────────────────────────────

function IconSlot({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  const iconOpacity = useSharedValue(1)
  const iconScale   = useSharedValue(1)
  const spinOpacity = useSharedValue(0)
  const spinScale   = useSharedValue(0.6)

  useEffect(() => {
    const dur = 160
    if (loading) {
      iconOpacity.value = withTiming(0, { duration: dur })
      iconScale.value   = withTiming(0.6, { duration: dur, easing: Easing.in(Easing.quad) })
      spinOpacity.value = withTiming(1, { duration: dur })
      spinScale.value   = withTiming(1, { duration: dur, easing: Easing.out(Easing.back(1.5)) })
    } else {
      spinOpacity.value = withTiming(0, { duration: dur })
      spinScale.value   = withTiming(0.6, { duration: dur, easing: Easing.in(Easing.quad) })
      iconOpacity.value = withTiming(1, { duration: dur })
      iconScale.value   = withTiming(1, { duration: dur, easing: Easing.out(Easing.back(1.5)) })
    }
  }, [loading])

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }))
  const spinStyle = useAnimatedStyle(() => ({
    opacity: spinOpacity.value,
    transform: [{ scale: spinScale.value }],
  }))

  return (
    <View style={styles.iconSlot}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.iconSlotInner, iconStyle]}>
        {children}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.iconSlotInner, spinStyle]}>
        <Spinner />
      </Animated.View>
    </View>
  )
}

// ── HomeHeader ───────────────────────────────────────────────────────────────

export type HomeHeaderProps = {
  /** Header title. Omit for no title (e.g. profile preview). */
  title?: string
  /** When provided, shows an arrow icon and makes the title tappable. */
  arrow?: {
    direction: 'down' | 'side'
    onPress: () => void
  }
  /** Badge count shown next to the title (e.g. chat unread). */
  badge?: number
  /** Settings gear callback. */
  onSettingsPress: () => void
  /** Disable the arrow button. */
  disabled?: boolean
  /** Show spinner instead of icon. */
  loading?: boolean
}

export function HomeHeader({
  title,
  arrow,
  badge,
  onSettingsPress,
  disabled,
  loading = false,
}: HomeHeaderProps) {
  const icon = arrow
    ? (arrow.direction === 'down' ? <DownArrowIcon /> : <SideArrowIcon />)
    : <SyncWishLogo size={22} color={TEXT} />

  const titleContent = title != null ? (
    arrow ? (
      <IconPressable
        style={styles.titleBtn}
        pressedStyle={styles.titleBtnPressed}
        onPress={arrow.onPress}
        disabled={disabled || loading}
      >
        <IconSlot loading={loading}>{icon}</IconSlot>
        <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && badge > 0 && (
          <CountBadge value={badge} color={GREEN} />
        )}
      </IconPressable>
    ) : (
      <View style={styles.titleRow}>
        <IconSlot loading={loading}>{icon}</IconSlot>
        <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && badge > 0 && (
          <CountBadge value={badge} color={GREEN} />
        )}
      </View>
    )
  ) : <View />

  return (
    <View style={styles.header}>
      {titleContent}
      <IconPressable
        style={styles.settingsBtn}
        pressedStyle={styles.settingsBtnPressed}
        onPress={onSettingsPress}
      >
        <SettingsIcon />
        <SettingsArrowIcon />
      </IconPressable>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SINGLE,
    height: 56,
  },
  titleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleBtnPressed: {
    opacity: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconSlot: {
    width: 22,
    height: 22,
  },
  iconSlotInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    lineHeight: 46,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  settingsBtn: {
    height: 40,
    borderRadius: SINGLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  settingsBtnPressed: {
    opacity: 0.5,
  },
})
