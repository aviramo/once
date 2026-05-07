import { useEffect, useRef, useCallback } from 'react'
import { View, StyleSheet, Pressable, I18nManager, Animated, Easing, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Path, Circle, Line } from 'react-native-svg'
import { Text } from './AppText'
import { t, tg } from '../i18n'
import type { Profile } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon } from './Chip'
import { FONT_SCALE, RADIUS } from '../fonts'
import { TEXT_PRIMARY, WHITE, BLACK, PRIMARY } from '../colors'

// ── Format helpers ────────────────────────────────────────────────────────

function formatDistance(m: number | null | undefined, units?: string | null): string {
  if (m == null || isNaN(m)) return ''
  if (m < 250) return t('home.distanceHere')
  if (units === 'imperial') {
    const miles = m / 1609.344
    if (miles < 0.1) return t('home.distanceHere')
    if (miles < 10) return `${miles.toFixed(1)} ${t('settings.miles')}`
    return `${Math.round(miles).toLocaleString()} ${t('settings.miles')}`
  }
  if (m < 1000) return `${Math.round(m)} ${t('settings.meter')}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()} ${t('settings.km')}`
  return `${km.toFixed(1)} ${t('settings.km')}`
}

function formatLastSeen(iso: string | null | undefined, isMale: boolean | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return tg('match.justNow', isMale)
  if (diff < 3600) {
    const n = Math.floor(diff / 60)
    return tg(n === 1 ? 'match.minAgo' : 'match.minsAgo', isMale).replace('{n}', String(n))
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600)
    return tg(n === 1 ? 'match.hrAgo' : 'match.hrsAgo', isMale).replace('{n}', String(n))
  }
  const n = Math.floor(diff / 86400)
  return tg(n === 1 ? 'match.dayAgo' : 'match.daysAgo', isMale).replace('{n}', String(n))
}

const ONLINE_SECONDS = 60
const NEW_SECONDS = 3600

function isOnlineNow(iso?: string | null) {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) / 1000 < ONLINE_SECONDS
}
function isRecentlyCreated(iso?: string | null) {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) / 1000 < NEW_SECONDS
}

// ── Eye-off overlay icon (small badge on the blurred photo) ───────────────

function EyeOffBadge() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12s3.5-7 10-7c2.1 0 3.9.7 5.4 1.7M22 12s-3.5 7-10 7c-2.1 0-3.9-.7-5.4-1.7" stroke={WHITE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={3} stroke={WHITE} strokeWidth={2} />
      <Line x1={3} y1={3} x2={21} y2={21} stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  watcher: Profile
  units?: string | null
  exiting?: boolean
  onExited?: () => void
  onPress?: () => void
}

export function WatcherCard({ watcher, units, exiting, onExited, onPress }: Props) {
  const distance = formatDistance(watcher.distance ?? undefined, units)
  const lastSeen = formatLastSeen(watcher.last_seen, watcher.is_male)
  const online = isOnlineNow(watcher.last_seen)
  const isNew = isRecentlyCreated(watcher.created_at)
  const hash = watcher.images?.[0]?.hash

  const anim = useRef(new Animated.Value(0)).current
  const exitedRef = useRef(false)

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [anim])

  useEffect(() => {
    if (!exiting || exitedRef.current) return
    exitedRef.current = true
    Animated.timing(anim, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onExited?.()
    })
  }, [exiting, anim, onExited])

  const opacity    = anim
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] })
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })

  // Track finger movement to suppress onPress when the user swipes
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const wasDragged = useRef(false)
  const DRAG_THRESHOLD = 10

  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    pressOrigin.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }
    wasDragged.current = false
  }, [])

  const handlePressOut = useCallback((e: GestureResponderEvent) => {
    if (pressOrigin.current) {
      const dx = Math.abs(e.nativeEvent.pageX - pressOrigin.current.x)
      const dy = Math.abs(e.nativeEvent.pageY - pressOrigin.current.y)
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) wasDragged.current = true
    }
  }, [])

  const handlePress = useCallback(() => {
    if (!wasDragged.current) onPress?.()
  }, [onPress])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <Pressable
        style={styles.card}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        <View style={styles.avatar}>
          {hash ? (
            <Image
              placeholder={{ blurhash: hash }}
              placeholderContentFit="cover"
              style={styles.avatarImage}
            />
          ) : null}
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{t('home.watchingMeNew')}</Text>
            </View>
          ) : null}
          <View style={styles.eyeBadge}>
            <EyeOffBadge />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{watcher.title}</Text>
          <View style={styles.chipRow}>
            {distance ? (
              <Chip
                renderIcon={color => <PinIcon color={color} />}
                text={distance}
                tone="neutral"
              />
            ) : null}
            {lastSeen ? (
              <View style={styles.onlineChip}>
                <ClockIcon color="rgba(0,0,0,0.6)" />
                <Text
                  style={styles.onlineChipText}
                  numberOfLines={1}
                  maxFontSizeMultiplier={FONT_SCALE.heading}
                >{lastSeen}</Text>
                {online ? <View style={styles.onlineDot} /> : null}
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: RADIUS,
    backgroundColor: '#FFF0EB',
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  avatar: {
    width: 84,
    height: 108,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  newBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    backgroundColor: PRIMARY,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS,
  },
  newBadgeText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  eyeBadge: {
    position: 'absolute',
    bottom: 6,
    start: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 108,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  onlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  onlineChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2BB673',
  },
})
