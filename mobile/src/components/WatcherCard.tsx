import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Image, Pressable, I18nManager, Animated, Easing } from 'react-native'
import { Text } from './AppText'
import { invoke, publicImageUrl } from '../lib/api'
import { t, tg } from '../i18n'
import type { WatcherInfo } from '../stores/userStore'
import { ConfirmDialog } from './ConfirmDialog'
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

// Thresholds: a near distance (<1km) or recent activity (<10 min) flips the
// chip from neutral → positive. Keeps chips as lightweight signals instead
// of a uniform wall of green.

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
  // Render without the card's own bg / border / rounding so the watcher
  // row reads as a list item inside a parent container that already owns
  // the card chrome (see home.tsx visible-with-watchers layout).
  flat?: boolean
}

// Per-card enter/exit animation. Each instance mounts with a lift+fade-in.
// When `exiting` flips true, the card runs a matching fade/slide/collapse and
// invokes `onExited` so the parent can unmount it.
export function WatcherCard({ watcher, units, exiting, onExited, flat }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const distance = formatDistance(watcher.distance, units)
  const lastSeen = formatLastSeen(watcher.last_seen)

  // 0 = hidden, 1 = shown. Drives opacity + translateY + scaleY collapse.
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

  const onPress = () => { tap(); setConfirmOpen(true) }
  const onCancel = () => { if (!removing) setConfirmOpen(false) }
  const onConfirm = async () => {
    if (removing) return
    tap()
    setRemoving(true)
    try {
      await invoke('app/remove', { user_id: watcher.user_id })
      setConfirmOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
        <Pressable
          style={[styles.card, flat && styles.cardFlat]}
          onPress={onPress}
        >
          <View style={styles.avatar}>
            {watcher.image ? (
              <Image
                source={{ uri: publicImageUrl(watcher.user_id, 'blur', watcher.image) }}
                style={styles.avatarImage}
                resizeMode="cover"
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
      <ConfirmDialog
        visible={confirmOpen}
        title={watcher.title}
        description={tg('home.watcherRemoveConfirmDesc', watcher.is_male ?? null)}
        cancelLabel={t('home.hideConfirmCancel')}
        confirmLabel={t('home.watcherRemove')}
        onCancel={onCancel}
        onConfirm={onConfirm}
        busy={removing}
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  // Flat variant (used inside the big white outer card in home.tsx) —
  // strips the chrome so watchers read as rows in the parent card.
  cardFlat: {
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  // Fixed 3:4 portrait avatar so every card has the exact same image size
  // regardless of how many chips wrap in the body. The Image fills the
  // wrapper via width/height 100% + cover so RN's intrinsic dimensions
  // don't override the layout.
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
