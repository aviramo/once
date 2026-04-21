import { useEffect, useRef, useState, useCallback } from 'react'
import { View, StyleSheet, Pressable, I18nManager, Animated, Easing, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import { Text } from './AppText'
import { publicImageUrl } from '../lib/api'
import { t, tg } from '../i18n'
import type { WatcherInfo } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon, BellOnIcon, BellOffIcon } from './Chip'
import { SINGLE } from '../fonts'
import { TEXT, WHITE } from '../colors'

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

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('match.justNow')
  if (diff < 3600) return t('match.minsAgo').replace('{n}', String(Math.floor(diff / 60)))
  if (diff < 86400) return t('match.hrsAgo').replace('{n}', String(Math.floor(diff / 3600)))
  return t('match.daysAgo').replace('{n}', String(Math.floor(diff / 86400)))
}

const NEAR_METERS = 1000
const RECENT_SECONDS = 600

function isDistanceNear(m?: number | null) {
  return m != null && !isNaN(m) && m < NEAR_METERS
}
function isTimeRecent(iso?: string | null) {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) / 1000 < RECENT_SECONDS
}

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  watcher: WatcherInfo
  units?: string | null
  exiting?: boolean
  onExited?: () => void
  flat?: boolean
  onPress?: () => void
}

export function WatcherCard({ watcher, units, exiting, onExited, flat, onPress }: Props) {
  const distance = formatDistance(watcher.distance, units)
  const lastSeen = formatLastSeen(watcher.last_seen)

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
        style={[styles.card, flat && styles.cardFlat]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        <View style={styles.avatar}>
          {watcher.image ? (
            <Image
              source={publicImageUrl(watcher.user_id, 'blur', watcher.image)}
              style={styles.avatarImage}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{watcher.title}</Text>
          <View style={styles.chipRow}>
            {distance ? (
              <Chip
                renderIcon={color => <PinIcon color={color} />}
                text={distance}
                tone={isDistanceNear(watcher.distance) ? 'positive' : 'neutral'}
              />
            ) : null}
            {lastSeen ? (
              <Chip
                renderIcon={color => <ClockIcon color={color} />}
                text={lastSeen}
                tone={isTimeRecent(watcher.last_seen) ? 'positive' : 'neutral'}
              />
            ) : null}
            {watcher.subscribed ? (
              <Chip
                renderIcon={color => <BellOnIcon color={color} />}
                text={tg('home.notifOn', watcher.is_male ?? null)}
                tone="positive"
              />
            ) : (
              <Chip
                renderIcon={color => <BellOffIcon color={color} />}
                text={tg('home.notifOff', watcher.is_male ?? null)}
                tone="negative"
              />
            )}
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
    borderRadius: SINGLE,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  cardFlat: {
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  avatar: {
    width: 66,
    height: 88,
    borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
})
