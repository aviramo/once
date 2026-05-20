import { useMemo, useRef, useCallback } from 'react'
import { View, StyleSheet, Pressable, I18nManager, type GestureResponderEvent } from 'react-native'
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { Text } from './AppText'
import { t } from '../i18n'
import { resolveLocationType, type Profile, type LocationType } from '../stores/userStore'
import type { FamilyData } from '../lib/family'
import { Chip, PinIcon, HomeIcon, WorkIcon, ClockIcon, KidsIcon, PresenceDot } from './Chip'
import { buildFamilyChipText } from './FamilyCard'
import { RADII, RADIUS, SM, MD, TEXT, WEIGHT, MOTION } from '../tokens'

import { WHITE, PRIMARY, BLACK_SOFT, PHOTO_TEXT_SHADOW } from '../colors'
import { formatDistance, isDistanceHere } from '../lib/units'
import { formatLastSeen, isLastSeenJustNow } from '../lib/lastSeen'

const NEW_SECONDS = 3600

function isRecentlyCreated(iso?: string | null) {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) / 1000 < NEW_SECONDS
}

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  watcher: Profile
  onPress?: () => void
  /** Viewer's own family data — when set, the kids chip appends the
   * kid-free schedule overlap percentage (same as MatchCard). */
  viewerFamily?: FamilyData | null
  /** Viewer's (A's) own location anchor type. Chip icon follows the
   * watcher's (B's) anchor (pin/home/work); text stays live ("away") only
   * when both sides are 'device', else the passive "from the set location".
   * Pass resolveLocationType(ownProfile). */
  viewerLocationType?: LocationType | null
}

export function WatcherCard({ watcher, onPress, viewerFamily, viewerLocationType }: Props) {
  const subjectLocationType = resolveLocationType(watcher)
  const viewerType: LocationType = viewerLocationType ?? 'device'
  const distance = formatDistance(watcher.distance ?? undefined, watcher.is_male, viewerType, subjectLocationType)
  const lastSeen = formatLastSeen(watcher.last_seen, watcher.is_male)
  const online = isLastSeenJustNow(watcher.last_seen)
  const isNew = isRecentlyCreated(watcher.created_at)
  const hash = watcher.images?.[0]?.hash
  const familyChipText = useMemo(
    () => buildFamilyChipText(watcher.family, undefined, false, viewerFamily),
    [watcher.family, viewerFamily],
  )

  // Mount/unmount choreography lives on the card itself (DRY: a component
  // owns its own behavior). When the parent list adds a viewer this card
  // mounts and drops in from above (FadeInDown); when a viewer is removed
  // React unmounts this card and Reanimated keeps it alive just long enough
  // to lift it up and out (FadeOutUp); the remaining cards glide to close /
  // open the gap via LinearTransition. Same FadeInDown/FadeOutUp/
  // LinearTransition idiom the TabStrip timer uses, so list mutations read
  // consistently with the rest of the shell. The parent only has to keep the
  // list container mounted (it does) — no exiting/onExited plumbing.

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
    <Animated.View
      entering={FadeInDown.duration(MOTION.base)}
      exiting={FadeOutUp.duration(MOTION.base)}
      layout={LinearTransition.duration(MOTION.base)}
    >
      <Pressable
        style={styles.card}
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
          <View style={styles.chipsStack}>
            {lastSeen ? (
              <View style={styles.chipsLine}>
                <Chip
                  renderIcon={color => <ClockIcon color={color} />}
                  text={lastSeen}
                  tone="neutral"
                  onPhoto
                  renderTrailing={online ? () => <PresenceDot /> : undefined}
                />
              </View>
            ) : null}
            {distance ? (
              <View style={styles.chipsLine}>
                <Chip
                  renderIcon={color => subjectLocationType === 'work' ? <WorkIcon color={color} /> : subjectLocationType === 'home' ? <HomeIcon color={color} /> : <PinIcon color={color} />}
                  text={distance}
                  tone="neutral"
                  onPhoto
                  renderTrailing={isDistanceHere(watcher.distance ?? undefined) ? () => <PresenceDot /> : undefined}
                />
              </View>
            ) : null}
            {familyChipText ? (
              <View style={styles.chipsLine}>
                <Chip
                  renderIcon={color => <KidsIcon color={color} />}
                  text={familyChipText}
                  onPhoto
                  renderTrailing={() => <PresenceDot color={WHITE} />}
                />
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
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
  },
  newBadge: {
    backgroundColor: PRIMARY,
    paddingHorizontal: SM,
    paddingVertical: RADII.xs,
    borderRadius: RADII.chip,
  },
  newBadgeText: {
    color: WHITE,
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.extrabold,
    letterSpacing: 0.2,
  },
  infoOverlay: {
    paddingHorizontal: SM,
    paddingVertical: MD,
    gap: SM,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
    letterSpacing: -0.3,
    ...PHOTO_TEXT_SHADOW,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  chipsStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SM,
  },
  chipsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SM,
  },
})
