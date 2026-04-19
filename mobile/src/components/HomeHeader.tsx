import { useEffect, useState } from 'react'
import { View, StyleSheet, I18nManager, Modal, Pressable } from 'react-native'
import { Text } from './AppText'
import Svg, { Circle, Path } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, Easing,
} from 'react-native-reanimated'
import { IconPressable } from './IconPressable'
import { CountBadge } from './CountBadge'
import { tapMedium } from '../lib/haptics'
import { FONT_SCALE, SINGLE } from '../fonts'
import { TEXT, GREEN, PURPLE_BG } from '../colors'
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
  /** Status chip text shown next to the settings button. */
  statusLabel?: string
  /** Status chip tone: true = green, false = neutral gray. */
  statusGreen?: boolean
  /** Custom status chip color (overrides green). */
  statusColor?: string
  /** When provided, shows an arrow icon and makes the title tappable. */
  arrow?: {
    direction: 'down' | 'side'
    onPress: () => void
  }
  /** Badge count shown next to the title (e.g. chat unread). */
  badge?: number
  /** Badge color override (defaults to GREEN). */
  badgeColor?: string
  /** Status menu options. When provided, the chip becomes tappable and opens a dropdown. */
  statusMenu?: Array<{ label: string; color?: string; onPress: () => void }>
  /** Settings gear callback. */
  onSettingsPress: () => void
  /** Disable the arrow button. */
  disabled?: boolean
  /** Show spinner instead of icon. */
  loading?: boolean
}

export function HomeHeader({
  title,
  statusLabel,
  statusGreen,
  statusColor,
  arrow,
  badge,
  badgeColor,
  statusMenu,
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
        {badge != null && (
          <CountBadge value={badge} color={badgeColor ?? GREEN} />
        )}
      </IconPressable>
    ) : (
      <View style={styles.titleRow}>
        <IconSlot loading={loading}>{icon}</IconSlot>
        <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && (
          <CountBadge value={badge} color={badgeColor ?? GREEN} />
        )}
      </View>
    )
  ) : <View />

  const [menuOpen, setMenuOpen] = useState(false)

  const handleChipPress = () => {
    if (statusMenu && statusMenu.length > 0) {
      tapMedium()
      setMenuOpen(true)
    }
  }

  return (
    <View style={styles.header}>
      {titleContent}
      <View style={styles.endRow}>
        {statusLabel != null && (
          statusMenu && statusMenu.length > 0 ? (
            <IconPressable
              style={[
                styles.statusChip,
                statusColor ? { backgroundColor: statusColor + '18', borderColor: statusColor + '40' } :
                statusGreen ? [styles.statusChipGreen, styles.statusChipTappableGreen] :
                styles.statusChipTappable,
              ]}
              pressedStyle={styles.statusChipPressed}
              onPress={handleChipPress}
              disabled={disabled || loading}
            >
              <Text style={[styles.statusChipText, statusColor ? { color: statusColor } : statusGreen && styles.statusChipTextGreen]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.ui}>{statusLabel}</Text>
            </IconPressable>
          ) : (
            <View style={[
              styles.statusChip,
              statusColor ? { backgroundColor: statusColor + '18' } :
              statusGreen && styles.statusChipGreen,
            ]}>
              <Text style={[styles.statusChipText, statusColor ? { color: statusColor } : statusGreen && styles.statusChipTextGreen]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.ui}>{statusLabel}</Text>
            </View>
          )
        )}
        <IconPressable
          style={styles.settingsBtn}
          pressedStyle={styles.settingsBtnPressed}
          onPress={onSettingsPress}
        >
          <SettingsIcon />
          <SettingsArrowIcon />
        </IconPressable>
      </View>

      {menuOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={styles.menuCard}>
              {statusMenu!.map((opt, i) => (
                <IconPressable
                  key={i}
                  style={styles.menuOption}
                  pressedStyle={styles.menuOptionPressed}
                  onPress={() => { setMenuOpen(false); opt.onPress() }}
                >
                  <View style={[styles.menuDot, { backgroundColor: opt.color ?? 'rgba(0,0,0,0.25)' }]} />
                  <Text style={[styles.menuOptionText, opt.color ? { color: opt.color } : null]} maxFontSizeMultiplier={FONT_SCALE.ui}>{opt.label}</Text>
                </IconPressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}
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
    lineHeight: 26,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusChip: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusChipTappable: {
    borderColor: 'rgba(0,0,0,0.15)',
  },
  statusChipTappableGreen: {
    borderColor: 'rgba(21,128,61,0.25)',
  },
  statusChipGreen: {
    backgroundColor: 'rgba(21,128,61,0.1)',
  },
  statusChipPressed: {
    opacity: 0.55,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT,
  },
  statusChipTextGreen: {
    color: GREEN,
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
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 105,
    paddingEnd: SINGLE,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: SINGLE,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuOptionPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  menuDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  menuOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT,
  },
})
