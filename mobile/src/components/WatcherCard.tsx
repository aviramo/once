import { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Image, Pressable, I18nManager, Animated, Easing } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Text } from './AppText'
import { invoke, publicImageUrl } from '../lib/api'
import { t, tg } from '../i18n'
import type { WatcherInfo } from '../stores/userStore'
import { Chip, PinIcon, ClockIcon, BellOnIcon } from './Chip'
import { tap } from '../lib/haptics'

// ── Format helpers ────────────────────────────────────────────────────────

function formatDistance(m: number | null | undefined, units?: string | null): string {
  if (m == null || isNaN(m)) return ''
  if (m < 250) return t('home.distanceHere')
  if (units === 'imperial') {
    const miles = m / 1609.344
    if (miles < 0.1) return t('home.distanceHere')
    if (miles < 10) return `${miles.toFixed(1)}${t('settings.miles')}`
    return `${Math.round(miles).toLocaleString()}${t('settings.miles')}`
  }
  if (m < 1000) return `${Math.round(m)}${t('settings.meter')}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()}${t('settings.km')}`
  return `${km.toFixed(1)}${t('settings.km')}`
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('match.justNow')
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('match.minsAgo')}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('match.hrsAgo')}`
  return `${Math.floor(diff / 86400)}${t('match.daysAgo')}`
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

// ── Swipe geometry ────────────────────────────────────────────────────────
// Reveal direction is opposite to the settings pane: in RTL the settings pane
// sits physically on the left, so the watcher row swipes physically LEFT
// (negative translateX) to expose the delete button on its start-side edge.
// LTR mirrors. The delete surface is pinned to the logical `start`, so when
// the card slides away the button appears from under it.

const isRTL = I18nManager.isRTL
const DELETE_WIDTH = 92
const SWIPE_SIGN = isRTL ? -1 : 1
const REVEAL_X = SWIPE_SIGN * DELETE_WIDTH

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  watcher: WatcherInfo
  units?: string | null
  exiting?: boolean
  onExited?: () => void
  flat?: boolean
}

export function WatcherCard({ watcher, units, exiting, onExited, flat }: Props) {
  const [removing, setRemoving] = useState(false)
  const distance = formatDistance(watcher.distance, units)
  const lastSeen = formatLastSeen(watcher.last_seen)

  const anim = useRef(new Animated.Value(0)).current
  const swipeX = useRef(new Animated.Value(0)).current
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
    Animated.parallel([
      Animated.timing(anim, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(swipeX, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onExited?.()
    })
  }, [exiting, anim, swipeX, onExited])

  const opacity    = anim
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] })
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })
  const baseRef = useRef(0)
  const [revealed, setRevealed] = useState(false)

  const snapTo = (target: 0 | typeof REVEAL_X) => {
    baseRef.current = target
    setRevealed(target !== 0)
    Animated.spring(swipeX, {
      toValue: target,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start()
  }

  const pan = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX(
        revealed
          ? [-6, 6]
          : (isRTL ? [-6, 9999] : [-9999, 6])
      )
      .failOffsetY([-10, 10])
      .onUpdate(e => {
        const next = baseRef.current + e.translationX
        const lo = Math.min(0, REVEAL_X)
        const hi = Math.max(0, REVEAL_X)
        swipeX.setValue(Math.max(lo, Math.min(hi, next)))
      })
      .onEnd(e => {
        const cur = baseRef.current + e.translationX
        const past = Math.abs(cur) > DELETE_WIDTH * 0.4
        const vx = e.velocityX
        const flickReveal = SWIPE_SIGN < 0 ? vx < -500 : vx > 500
        const flickClose  = SWIPE_SIGN < 0 ? vx >  500 : vx < -500
        if (flickClose) snapTo(0)
        else if (flickReveal || past) snapTo(REVEAL_X)
        else snapTo(0)
      })
      .runOnJS(true)
  , [revealed])

  const handleCardPress = () => {
    if (revealed) snapTo(0)
  }

  const handleDelete = async () => {
    if (removing) return
    tap()
    setRemoving(true)
    try {
      await invoke('app/remove', { user_id: watcher.user_id })
    } catch (e) {
      console.error(e)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <View style={[styles.swipeRoot, flat ? styles.swipeRootFlat : styles.swipeRootCard]}>
        <View style={styles.deleteLayer}>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
            onPress={handleDelete}
            disabled={!revealed || removing}
          >
            <Text style={styles.deleteX}>✕</Text>
          </Pressable>
        </View>
        <GestureDetector gesture={pan}>
          <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
            <Pressable
              style={[styles.card, flat && styles.cardFlat]}
              onPress={handleCardPress}
            >
              <View style={styles.avatar}>
                {watcher.image ? (
                  <Image
                    source={{ uri: publicImageUrl(watcher.user_id, 'blur', watcher.image) }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                    blurRadius={50}
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
                  ) : null}
                </View>
              </View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  swipeRoot: {
    position: 'relative',
    overflow: 'hidden',
  },
  swipeRootCard: {
    borderRadius: 16,
  },
  swipeRootFlat: {
    borderRadius: 0,
  },
  deleteLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    width: DELETE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(17,24,39,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: {
    backgroundColor: 'rgba(17,24,39,0.12)',
  },
  deleteX: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderTopEndRadius: 16,
    borderBottomEndRadius: 16,
    borderTopStartRadius: 0,
    borderBottomStartRadius: 0,
    backgroundColor: '#fff',
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
    borderRadius: 10,
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
    color: '#111',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
})
