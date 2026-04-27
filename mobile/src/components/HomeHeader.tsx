import { useEffect, useState } from 'react'
import { View, StyleSheet, I18nManager, Pressable, ActivityIndicator } from 'react-native'
import { Text } from './AppText'
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withRepeat, withSequence, Easing,
} from 'react-native-reanimated'
import { IconPressable } from './IconPressable'
import { CountBadge } from './CountBadge'
import { tapMedium } from '../lib/haptics'
import { FONT_SCALE, SINGLE } from '../fonts'
import { TEXT, GREEN, GRAY_400, RED } from '../colors'

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

function SearchIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M 16.5 16.5 L 21 21" />
    </Svg>
  )
}

function ChatIcon({ color = TEXT }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  )
}

function SendInviteIcon({ color = TEXT }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="M17 8l-5-5-5 5" />
      <Path d="M12 3v12" />
    </Svg>
  )
}

function ReceiveInviteIcon({ color = TEXT }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="M7 10l5 5 5-5" />
      <Path d="M12 15V3" />
    </Svg>
  )
}

function HamburgerIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M 4 6 L 20 6" />
      <Path d="M 4 12 L 20 12" />
      <Path d="M 4 18 L 20 18" />
    </Svg>
  )
}

function BackArrowIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 9 6 L 15 12 L 9 18' : 'M 15 6 L 9 12 L 15 18'} />
    </Svg>
  )
}

function DownArrowIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5 L12 19 M5 13 L12 20 L19 13" />
    </Svg>
  )
}

function SideArrowIcon({ color = TEXT }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M 15 6 L 9 12 L 15 18' : 'M 9 6 L 15 12 L 9 18'} />
    </Svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6 L9 17 L4 12" />
    </Svg>
  )
}

function Ball3D({ color, size = 28 }: { color: string; size?: number }) {
  const r = size / 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id="ball" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <Stop offset="0%" stopColor="#fff" stopOpacity={0.4} />
          <Stop offset="55%" stopColor={color} stopOpacity={1} />
          <Stop offset="100%" stopColor="#000" stopOpacity={0.3} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={color} />
      <Circle cx={r} cy={r} r={r} fill="url(#ball)" />
    </Svg>
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
  statusMenu?: Array<{ label: string; color?: string; active?: boolean; onPress: () => void }>
  /** Settings gear callback. */
  onSettingsPress: () => void
  /** Disable the arrow button. */
  disabled?: boolean
  /** Show spinner instead of icon. */
  loading?: boolean
  /** Pulse the status dot (e.g. while fetching location). */
  dotPulsing?: boolean
  /** Render the title centered (absolute overlay) instead of start-aligned. */
  centered?: boolean
  /** Icon to show in the end slot. Defaults to 'settings'. Use 'none' for arrow only. */
  endIcon?: 'settings' | 'search' | 'send' | 'none'
  /** Icon to show in the start slot. Defaults to 'hamburger'. */
  startIcon?: 'hamburger' | 'back'
  /** When provided, replaces the start slot with a binoculars + arrow button. */
  page2Arrow?: { onPress: () => void; hasInvite?: boolean; hasDead?: boolean; alerting?: boolean; icon?: 'binoculars' | 'chat'; badge?: number; count?: number }
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
  dotPulsing = false,
  centered = false,
  endIcon = 'settings',
  startIcon = 'hamburger',
  page2Arrow,
}: HomeHeaderProps) {
  const icon = arrow
    ? (arrow.direction === 'down' ? <DownArrowIcon /> : <SideArrowIcon />)
    : null

  // Pulsing button animation
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (dotPulsing) {
      pulse.value = withRepeat(
        withTiming(0.45, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        -1, true,
      )
    } else {
      pulse.value = withTiming(1, { duration: 200 })
    }
  }, [dotPulsing])
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }))

  const badgeOpacity = useSharedValue(1)
  const arrowNudge = useSharedValue(0)
  useEffect(() => {
    if (page2Arrow?.alerting) {
      badgeOpacity.value = withRepeat(
        withSequence(
          withTiming(0.08, { duration: 300, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.sin) }),
        ),
        6,
        false,
      )
      arrowNudge.value = withRepeat(
        withSequence(
          withTiming(isRTL ? -10 : 10, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
        ),
        4,
        false,
      )
    } else {
      badgeOpacity.value = withTiming(1, { duration: 150 })
      arrowNudge.value = withTiming(0, { duration: 150 })
    }
  }, [page2Arrow?.alerting])
  const badgeAnimStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value }))
  const arrowNudgeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: arrowNudge.value }] }))

  const [menuOpen, setMenuOpen] = useState(false)

  const handleChipPress = () => {
    if (statusMenu && statusMenu.length > 0) {
      tapMedium()
      setMenuOpen(true)
    }
  }

  // Resolve the fill color for the title text when a menu is present.
  const titleColor = statusColor ?? (statusGreen ? GREEN : TEXT)

  const hasMenu = statusMenu && statusMenu.length > 0

  const titleContent = title != null ? (
    arrow ? (
      <IconPressable
        style={styles.titleBtn}
        pressedStyle={styles.titleBtnPressed}
        onPress={arrow.onPress}
        disabled={disabled || loading}
      >
        {icon}
        <Text style={[styles.title, hasMenu && { color: titleColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && (
          <CountBadge value={badge} color={badgeColor ?? GREEN} />
        )}
      </IconPressable>
    ) : hasMenu ? (
      <IconPressable
        style={styles.titleBtn}
        pressedStyle={styles.titleBtnPressed}
        onPress={handleChipPress}
        disabled={disabled || loading}
      >
        {loading || dotPulsing ? (
          <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size={16} color={titleColor} />
          </View>
        ) : (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={titleColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9 L12 15 L18 9" />
          </Svg>
        )}
        <Text style={[styles.title, { color: titleColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && (
          <CountBadge value={badge} color={badgeColor ?? GREEN} />
        )}
      </IconPressable>
    ) : (
      <View style={styles.titleRow}>
        <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.ui}>{title}</Text>
        {badge != null && (
          <CountBadge value={badge} color={badgeColor ?? GREEN} />
        )}
      </View>
    )
  ) : null

  return (
    <View style={styles.header}>
      {/* Start side (right in RTL): settings — navigates to settings pane to the right */}
      <View style={[styles.sideSlot, styles.sideSlotStart]}>
        <IconPressable
          style={styles.settingsBtn}
          pressedStyle={styles.settingsBtnPressed}
          onPress={onSettingsPress}
        >
          {startIcon === 'back' ? <BackArrowIcon /> : <HamburgerIcon />}
          {endIcon === 'send' ? <SendInviteIcon /> : endIcon === 'search' ? <SearchIcon /> : null}
        </IconPressable>
      </View>

      {/* End side (left in RTL): page2/chat — navigates to page2/chat pane to the left */}
      <View style={[styles.sideSlot, styles.sideSlotEnd]}>
        {page2Arrow ? (
          <IconPressable style={styles.titleBtn} pressedStyle={styles.titleBtnPressed} onPress={page2Arrow.onPress}>
            {page2Arrow.count != null && (page2Arrow.icon === 'chat' ? page2Arrow.count > 0 : true) && (
              <Animated.View style={[styles.viewerChip, (page2Arrow.hasInvite || page2Arrow.icon === 'chat') && { backgroundColor: GREEN }, page2Arrow.hasDead && { backgroundColor: RED }, badgeAnimStyle]}>
                <Text style={[styles.viewerChipText, { color: page2Arrow.hasInvite || page2Arrow.hasDead || page2Arrow.icon === 'chat' ? '#fff' : GRAY_400 }]} maxFontSizeMultiplier={FONT_SCALE.ui}>
                  {page2Arrow.hasInvite ? 1 : page2Arrow.count}
                </Text>
              </Animated.View>
            )}
            {page2Arrow.icon === 'chat' && (page2Arrow.count ?? 0) === 0 && <ChatIcon />}
            <Animated.View style={arrowNudgeStyle}>
              <SideArrowIcon color={(page2Arrow.hasInvite || (page2Arrow.icon === 'chat' && (page2Arrow.count ?? 0) > 0)) ? GREEN : undefined} />
            </Animated.View>
          </IconPressable>
        ) : !centered ? titleContent : null}
      </View>

      {/* Centered title overlay */}
      {centered && titleContent && (
        <View style={styles.titleCenter} pointerEvents="box-none">
          {titleContent}
        </View>
      )}

      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuAnchor}>
            <View style={styles.menuCard}>
              {statusMenu!.map((opt, i) => (
                opt.active ? (
                  <View key={i} style={styles.menuOptionActive}>
                    <View style={[styles.menuDot, { backgroundColor: opt.color ?? 'rgba(0,0,0,0.25)' }]} />
                    <Text style={[styles.menuOptionText, opt.color ? { color: opt.color } : null]} maxFontSizeMultiplier={FONT_SCALE.ui}>{opt.label}</Text>
                    <CheckIcon color={opt.color ?? TEXT} />
                  </View>
                ) : (
                  <IconPressable
                    key={i}
                    style={styles.menuOption}
                    pressedStyle={styles.menuOptionPressed}
                    onPress={() => { setMenuOpen(false); opt.onPress() }}
                  >
                    <View style={[styles.menuDot, { backgroundColor: opt.color ?? 'rgba(0,0,0,0.25)' }]} />
                    <Text style={[styles.menuOptionText, opt.color ? { color: opt.color } : null]} maxFontSizeMultiplier={FONT_SCALE.ui}>{opt.label}</Text>
                  </IconPressable>
                )
              ))}
            </View>
          </View>
        </>
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
    zIndex: 10,
  },
  sideSlot: {
    zIndex: 1,
    alignItems: 'flex-start',
  },
  sideSlotStart: {
    flex: 1,
  },
  sideSlotEnd: {
    alignItems: 'flex-end',
  },
  titleCenter: {
    position: 'absolute',
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 60,
  },
  titleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleBtnPressed: {
    opacity: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  page2SlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerChip: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  viewerChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 18,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusBallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  statusDotInline: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    position: 'absolute',
    top: -200,
    bottom: -1000,
    start: -200,
    end: -200,
    zIndex: 99,
  },
  menuAnchor: {
    position: 'absolute',
    top: '100%',
    start: SINGLE,
    zIndex: 100,
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
  menuOptionActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  menuOptionPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  menuDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  menuOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT,
  },
})
