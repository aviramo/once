import { useEffect, useRef, useCallback } from 'react'
import { View, StyleSheet, Pressable, I18nManager, Animated, Easing, useWindowDimensions, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import { Text } from './AppText'
import { t, tg } from '../i18n'
import type { Profile } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon } from './Chip'
import { RADII, RADIUS, SINGLE, DOUBLE, TEXT, WEIGHT } from '../tokens'
import { WHITE, PRIMARY, BLACK_SOFT, BLACK_STRONG, ONLINE_GREEN } from '../colors'
import { formatDistance } from '../lib/units'

// ── Format helpers ────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  watcher: Profile
  exiting?: boolean
  onExited?: () => void
  onPress?: () => void
}

export function WatcherCard({ watcher, exiting, onExited, onPress }: Props) {
  const distance = formatDistance(watcher.distance ?? undefined, watcher.is_male)
  const lastSeen = formatLastSeen(watcher.last_seen, watcher.is_male)
  const online = isOnlineNow(watcher.last_seen)
  const isNew = isRecentlyCreated(watcher.created_at)
  const hash = watcher.images?.[0]?.hash

  const { width: screenWidth } = useWindowDimensions()
  const cardWidth = screenWidth - SINGLE * 2
  const cardHeight = (cardWidth * 9) / 16

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
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }], width: cardWidth }}>
      <Pressable
        style={[styles.card, { width: cardWidth, height: cardHeight }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {hash ? (
          <Image
            placeholder={{ blurhash: hash }}
            placeholderContentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <View style={styles.infoOverlay}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{watcher.title}</Text>
            {isNew ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>{t('home.watchingMeNew')}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.chipRow}>
            {distance ? (
              <Chip
                renderIcon={color => <PinIcon color={color} />}
                text={distance}
                tone="neutral"
                onPhoto
              />
            ) : null}
            {lastSeen ? (
              <Chip
                renderIcon={color => <ClockIcon color={color} />}
                text={lastSeen}
                tone="neutral"
                onPhoto
                renderTrailing={online ? () => <View style={styles.onlineDot} /> : undefined}
              />
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: BLACK_SOFT,
    justifyContent: 'flex-end',
    marginVertical: SINGLE,
    borderRadius: RADIUS,
  },
  newBadge: {
    backgroundColor: PRIMARY,
    paddingHorizontal: SINGLE,
    paddingVertical: RADII.xs,
    borderRadius: RADII.chip,
  },
  newBadgeText: {
    color: WHITE,
    fontSize: TEXT.tiny,
    fontWeight: WEIGHT.bold,
    letterSpacing: 0.2,
  },
  infoOverlay: {
    paddingHorizontal: SINGLE,
    paddingTop: SINGLE,
    paddingBottom: DOUBLE,
    gap: SINGLE,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SINGLE,
  },
  title: {
    fontSize: TEXT.h2,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
    letterSpacing: -0.3,
    textShadowColor: BLACK_STRONG,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SINGLE,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: ONLINE_GREEN,
  },
})
