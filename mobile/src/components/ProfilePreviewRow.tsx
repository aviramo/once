import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Image, Animated, Easing, PanResponder, Dimensions, I18nManager } from 'react-native'

// Profile preview carousel. Renders a 5-slot virtual strip (−2,−1,0,1,2)
// around the current index and translates it horizontally. Auto-advances
// every 5s, resets the timer on user interaction, and snaps with a quick
// spring that carries the gesture's momentum forward.
//
// Image pool is built per user from four buckets (gender × age bucket).
// Selection respects is_for_male / is_for_female and weights the two age
// buckets by how much the user's [age_from, age_to] overlaps each one, so
// a user looking 25–40 sees a balanced mix while 25–31 sees mostly young.

// ── Asset buckets ──────────────────────────────────────────────────────────

const M_18_30 = [
  require('../../assets/profiles/18-30/man_02.jpg'),
  require('../../assets/profiles/18-30/man_03.jpg'),
  require('../../assets/profiles/18-30/man_05.jpg'),
  require('../../assets/profiles/18-30/man_06.jpg'),
  require('../../assets/profiles/18-30/man_07.jpg'),
  require('../../assets/profiles/18-30/man_09.jpg'),
  require('../../assets/profiles/18-30/man_10.jpg'),
  require('../../assets/profiles/18-30/man_11.jpg'),
  require('../../assets/profiles/18-30/man_12.jpg'),
  require('../../assets/profiles/18-30/man_13.jpg'),
  require('../../assets/profiles/18-30/man_15.jpg'),
  require('../../assets/profiles/18-30/man_16.jpg'),
  require('../../assets/profiles/18-30/man_17.jpg'),
  require('../../assets/profiles/18-30/man_18.jpg'),
  require('../../assets/profiles/18-30/man_19.jpg'),
  require('../../assets/profiles/18-30/man_21.jpg'),
  require('../../assets/profiles/18-30/man_22.jpg'),
  require('../../assets/profiles/18-30/man_23.jpg'),
  require('../../assets/profiles/18-30/man_24.jpg'),
  require('../../assets/profiles/18-30/man_25.jpg'),
  require('../../assets/profiles/18-30/man_26.jpg'),
  require('../../assets/profiles/18-30/man_27.jpg'),
  require('../../assets/profiles/18-30/man_28.jpg'),
  require('../../assets/profiles/18-30/man_29.jpg'),
  require('../../assets/profiles/18-30/man_30.jpg'),
  require('../../assets/profiles/18-30/man_32.jpg'),
  require('../../assets/profiles/18-30/man_34.jpg'),
  require('../../assets/profiles/18-30/man_35.jpg'),
  require('../../assets/profiles/18-30/man_36.jpg'),
  require('../../assets/profiles/18-30/man_37.jpg'),
  require('../../assets/profiles/18-30/man_38.jpg'),
  require('../../assets/profiles/18-30/man_39.jpg'),
  require('../../assets/profiles/18-30/man_40.jpg'),
  require('../../assets/profiles/18-30/man_41.jpg'),
  require('../../assets/profiles/18-30/man_42.jpg'),
  require('../../assets/profiles/18-30/man_43.jpg'),
  require('../../assets/profiles/18-30/man_44.jpg'),
  require('../../assets/profiles/18-30/man_45.jpg'),
  require('../../assets/profiles/18-30/man_47.jpg'),
  require('../../assets/profiles/18-30/man_49.jpg'),
  require('../../assets/profiles/18-30/man_50.jpg'),
]

const W_18_30 = [
  require('../../assets/profiles/18-30/woman_100.jpg'),
  require('../../assets/profiles/18-30/woman_51.jpg'),
  require('../../assets/profiles/18-30/woman_52.jpg'),
  require('../../assets/profiles/18-30/woman_53.jpg'),
  require('../../assets/profiles/18-30/woman_54.jpg'),
  require('../../assets/profiles/18-30/woman_55.jpg'),
  require('../../assets/profiles/18-30/woman_56.jpg'),
  require('../../assets/profiles/18-30/woman_58.jpg'),
  require('../../assets/profiles/18-30/woman_59.jpg'),
  require('../../assets/profiles/18-30/woman_60.jpg'),
  require('../../assets/profiles/18-30/woman_61.jpg'),
  require('../../assets/profiles/18-30/woman_62.jpg'),
  require('../../assets/profiles/18-30/woman_63.jpg'),
  require('../../assets/profiles/18-30/woman_64.jpg'),
  require('../../assets/profiles/18-30/woman_65.jpg'),
  require('../../assets/profiles/18-30/woman_66.jpg'),
  require('../../assets/profiles/18-30/woman_68.jpg'),
  require('../../assets/profiles/18-30/woman_69.jpg'),
  require('../../assets/profiles/18-30/woman_70.jpg'),
  require('../../assets/profiles/18-30/woman_71.jpg'),
  require('../../assets/profiles/18-30/woman_72.jpg'),
  require('../../assets/profiles/18-30/woman_73.jpg'),
  require('../../assets/profiles/18-30/woman_74.jpg'),
  require('../../assets/profiles/18-30/woman_75.jpg'),
  require('../../assets/profiles/18-30/woman_76.jpg'),
  require('../../assets/profiles/18-30/woman_77.jpg'),
  require('../../assets/profiles/18-30/woman_78.jpg'),
  require('../../assets/profiles/18-30/woman_79.jpg'),
  require('../../assets/profiles/18-30/woman_80.jpg'),
  require('../../assets/profiles/18-30/woman_81.jpg'),
  require('../../assets/profiles/18-30/woman_82.jpg'),
  require('../../assets/profiles/18-30/woman_83.jpg'),
  require('../../assets/profiles/18-30/woman_84.jpg'),
  require('../../assets/profiles/18-30/woman_85.jpg'),
  require('../../assets/profiles/18-30/woman_86.jpg'),
  require('../../assets/profiles/18-30/woman_87.jpg'),
  require('../../assets/profiles/18-30/woman_88.jpg'),
  require('../../assets/profiles/18-30/woman_89.jpg'),
  require('../../assets/profiles/18-30/woman_90.jpg'),
  require('../../assets/profiles/18-30/woman_91.jpg'),
  require('../../assets/profiles/18-30/woman_92.jpg'),
  require('../../assets/profiles/18-30/woman_93.jpg'),
  require('../../assets/profiles/18-30/woman_94.jpg'),
  require('../../assets/profiles/18-30/woman_95.jpg'),
  require('../../assets/profiles/18-30/woman_96.jpg'),
  require('../../assets/profiles/18-30/woman_97.jpg'),
  require('../../assets/profiles/18-30/woman_98.jpg'),
  require('../../assets/profiles/18-30/woman_99.jpg'),
]

const M_30_50 = [
  require('../../assets/profiles/30-50/man_01.jpg'),
  require('../../assets/profiles/30-50/man_02.jpg'),
  require('../../assets/profiles/30-50/man_03.jpg'),
  require('../../assets/profiles/30-50/man_04.jpg'),
  require('../../assets/profiles/30-50/man_05.jpg'),
  require('../../assets/profiles/30-50/man_06.jpg'),
  require('../../assets/profiles/30-50/man_07.jpg'),
  require('../../assets/profiles/30-50/man_09.jpg'),
  require('../../assets/profiles/30-50/man_10.jpg'),
  require('../../assets/profiles/30-50/man_11.jpg'),
  require('../../assets/profiles/30-50/man_12.jpg'),
  require('../../assets/profiles/30-50/man_13.jpg'),
  require('../../assets/profiles/30-50/man_14.jpg'),
  require('../../assets/profiles/30-50/man_15.jpg'),
  require('../../assets/profiles/30-50/man_16.jpg'),
  require('../../assets/profiles/30-50/man_17.jpg'),
  require('../../assets/profiles/30-50/man_18.jpg'),
  require('../../assets/profiles/30-50/man_19.jpg'),
  require('../../assets/profiles/30-50/man_20.jpg'),
  require('../../assets/profiles/30-50/man_21.jpg'),
  require('../../assets/profiles/30-50/man_22.jpg'),
  require('../../assets/profiles/30-50/man_23.jpg'),
  require('../../assets/profiles/30-50/man_24.jpg'),
  require('../../assets/profiles/30-50/man_25.jpg'),
  require('../../assets/profiles/30-50/man_26.jpg'),
  require('../../assets/profiles/30-50/man_27.jpg'),
  require('../../assets/profiles/30-50/man_28.jpg'),
  require('../../assets/profiles/30-50/man_29.jpg'),
  require('../../assets/profiles/30-50/man_31.jpg'),
  require('../../assets/profiles/30-50/man_32.jpg'),
  require('../../assets/profiles/30-50/man_33.jpg'),
  require('../../assets/profiles/30-50/man_34.jpg'),
  require('../../assets/profiles/30-50/man_36.jpg'),
  require('../../assets/profiles/30-50/man_37.jpg'),
  require('../../assets/profiles/30-50/man_38.jpg'),
  require('../../assets/profiles/30-50/man_40.jpg'),
  require('../../assets/profiles/30-50/man_41.jpg'),
  require('../../assets/profiles/30-50/man_42.jpg'),
  require('../../assets/profiles/30-50/man_43.jpg'),
  require('../../assets/profiles/30-50/man_44.jpg'),
  require('../../assets/profiles/30-50/man_45.jpg'),
  require('../../assets/profiles/30-50/man_46.jpg'),
  require('../../assets/profiles/30-50/man_47.jpg'),
  require('../../assets/profiles/30-50/man_48.jpg'),
  require('../../assets/profiles/30-50/man_50.jpg'),
]

const W_30_50 = [
  require('../../assets/profiles/30-50/woman_100.jpg'),
  require('../../assets/profiles/30-50/woman_51.jpg'),
  require('../../assets/profiles/30-50/woman_52.jpg'),
  require('../../assets/profiles/30-50/woman_53.jpg'),
  require('../../assets/profiles/30-50/woman_54.jpg'),
  require('../../assets/profiles/30-50/woman_55.jpg'),
  require('../../assets/profiles/30-50/woman_56.jpg'),
  require('../../assets/profiles/30-50/woman_57.jpg'),
  require('../../assets/profiles/30-50/woman_58.jpg'),
  require('../../assets/profiles/30-50/woman_59.jpg'),
  require('../../assets/profiles/30-50/woman_60.jpg'),
  require('../../assets/profiles/30-50/woman_61.jpg'),
  require('../../assets/profiles/30-50/woman_62.jpg'),
  require('../../assets/profiles/30-50/woman_63.jpg'),
  require('../../assets/profiles/30-50/woman_64.jpg'),
  require('../../assets/profiles/30-50/woman_65.jpg'),
  require('../../assets/profiles/30-50/woman_66.jpg'),
  require('../../assets/profiles/30-50/woman_67.jpg'),
  require('../../assets/profiles/30-50/woman_68.jpg'),
  require('../../assets/profiles/30-50/woman_69.jpg'),
  require('../../assets/profiles/30-50/woman_70.jpg'),
  require('../../assets/profiles/30-50/woman_71.jpg'),
  require('../../assets/profiles/30-50/woman_73.jpg'),
  require('../../assets/profiles/30-50/woman_74.jpg'),
  require('../../assets/profiles/30-50/woman_75.jpg'),
  require('../../assets/profiles/30-50/woman_76.jpg'),
  require('../../assets/profiles/30-50/woman_77.jpg'),
  require('../../assets/profiles/30-50/woman_78.jpg'),
  require('../../assets/profiles/30-50/woman_79.jpg'),
  require('../../assets/profiles/30-50/woman_80.jpg'),
  require('../../assets/profiles/30-50/woman_81.jpg'),
  require('../../assets/profiles/30-50/woman_82.jpg'),
  require('../../assets/profiles/30-50/woman_83.jpg'),
  require('../../assets/profiles/30-50/woman_84.jpg'),
  require('../../assets/profiles/30-50/woman_85.jpg'),
  require('../../assets/profiles/30-50/woman_88.jpg'),
  require('../../assets/profiles/30-50/woman_89.jpg'),
  require('../../assets/profiles/30-50/woman_90.jpg'),
  require('../../assets/profiles/30-50/woman_91.jpg'),
  require('../../assets/profiles/30-50/woman_92.jpg'),
  require('../../assets/profiles/30-50/woman_93.jpg'),
  require('../../assets/profiles/30-50/woman_95.jpg'),
  require('../../assets/profiles/30-50/woman_96.jpg'),
  require('../../assets/profiles/30-50/woman_97.jpg'),
  require('../../assets/profiles/30-50/woman_98.jpg'),
  require('../../assets/profiles/30-50/woman_99.jpg'),
]

// Exposed so the Home screen can preload them via Asset.loadAsync before
// revealing the UI — prevents the gallery popping in after the message.
export const PROFILE_ASSETS = [...M_18_30, ...W_18_30, ...M_30_50, ...W_30_50]

// ── Layout constants ──────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width
const CARD_W   = Math.round(SCREEN_W * 0.55)
const CARD_H   = Math.round(CARD_W * 0.9)
const GAP      = 10

// Total fixed height the carousel reserves on the screen. Exported so the
// Home layout can pin the gallery row at a constant height regardless of
// message length.
export const GALLERY_HEIGHT = CARD_H
const STRIDE   = CARD_W + GAP
const SLOTS    = [-2, -1, 0, 1, 2] as const
const AUTO_MS  = 5000
const POOL_SIZE = 14
const DIR = I18nManager.isRTL ? -1 : 1

// ── Helpers ───────────────────────────────────────────────────────────────

const mod = (n: number, m: number) => ((n % m) + m) % m

function seededShuffle<T>(arr: T[], seed: number): T[] {
  return arr
    .map((v, i) => [v, Math.sin(seed + i * 97)] as const)
    .sort((a, b) => a[1] - b[1])
    .map(p => p[0])
}

// Pull `count` items from `arr` deterministically by `seed`. If count >
// arr.length we just return the (shuffled) whole array.
function pickN<T>(arr: T[], count: number, seed: number): T[] {
  if (count <= 0 || arr.length === 0) return []
  return seededShuffle(arr, seed).slice(0, Math.min(count, arr.length))
}

// Buckets are [18, 30] and [30, 50]. The bucket weight is the fraction of
// the user's preferred range that lands inside that bucket — proportional
// to overlap. Wider overlap with one bucket means more of its images.
function bucketWeights(ageFrom: number, ageTo: number) {
  const overlapA = Math.max(0, Math.min(30, ageTo) - Math.max(18, ageFrom))
  const overlapB = Math.max(0, Math.min(50, ageTo) - Math.max(30, ageFrom))
  const total = overlapA + overlapB
  if (total === 0) return { a: 0.5, b: 0.5 }
  return { a: overlapA / total, b: overlapB / total }
}

type Props = {
  userId: string
  isForMale: boolean | null
  isForFemale: boolean | null
  ageFrom: number
  ageTo: number
  blur?: boolean
}

export function ProfilePreviewRow({ userId, isForMale, isForFemale, ageFrom, ageTo, blur }: Props) {
  // Bumped on each visibility toggle so the pool memo recomputes with a
  // different seed — gives a fresh, distinct set of people after the
  // collapse/expand animation below.
  const [reshuffleToken, setReshuffleToken] = useState(0)

  const pool = useMemo(() => {
    const base = Array.from(userId || '').reduce((a, c) => a + c.charCodeAt(0), 0)
    // Large offset per token so the seeded shuffle lands in a visibly
    // different region of the sin-based ordering — not just a small shift.
    const seed = base + reshuffleToken * 1013

    // Gender-filtered halves of each bucket. If both flags are off (no
    // preference set), fall back to all images so the carousel still has
    // content to show.
    const wantMale   = !!isForMale
    const wantFemale = !!isForFemale
    const noPref     = !wantMale && !wantFemale

    const bucketA: any[] = []
    if (wantMale   || noPref) bucketA.push(...M_18_30)
    if (wantFemale || noPref) bucketA.push(...W_18_30)

    const bucketB: any[] = []
    if (wantMale   || noPref) bucketB.push(...M_30_50)
    if (wantFemale || noPref) bucketB.push(...W_30_50)

    const { a, b } = bucketWeights(ageFrom, ageTo)
    const nA = Math.round(POOL_SIZE * a)
    const nB = POOL_SIZE - nA

    const picksA = pickN(bucketA, nA, seed)
    const picksB = pickN(bucketB, nB, seed + 1)

    return seededShuffle([...picksA, ...picksB], seed + 2)
  }, [userId, isForMale, isForFemale, ageFrom, ageTo, reshuffleToken])

  const [idx, setIdx] = useState(0)
  const pan = useRef(new Animated.Value(0)).current
  // Horizontal collapse/expand played on visibility toggle. scaleX drops to
  // 0 → pool reshuffles → scales back to 1. Opacity is tied to the same
  // progress so the cards don't flash mid-swap at scaleX≈0.
  const reveal = useRef(new Animated.Value(1)).current
  const blurPrev = useRef(blur)

  useEffect(() => {
    if (blurPrev.current === blur) return
    blurPrev.current = blur
    Animated.timing(reveal, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return
      setReshuffleToken(t => t + 1)
      setIdx(0)
      pan.setValue(0)
      Animated.timing(reveal, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    })
  }, [blur, pan, reveal])
  // Pending-commit pattern — if the user grabs the carousel mid-animation
  // we commit the advance (update idx, reset pan to 0) synchronously so
  // their drag starts from a consistent baseline without any "blocked"
  // frames. The spring's finish callback is the other place this runs.
  const pendingCommit = useRef<(() => void) | null>(null)
  const [interactionTick, setInteractionTick] = useState(0)

  const advance = useCallback((delta: number, velocity = 0) => {
    if (pool.length < 2) return
    if (pendingCommit.current) pendingCommit.current()
    pendingCommit.current = () => {
      setIdx(i => mod(i + delta, pool.length))
      pan.setValue(0)
      pendingCommit.current = null
    }
    Animated.spring(pan, {
      toValue: -delta * STRIDE * DIR,
      velocity,
      tension: 90,
      friction: 18,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && pendingCommit.current) pendingCommit.current()
    })
  }, [pan, pool.length])

  useEffect(() => {
    if (pool.length < 2) return
    const t = setTimeout(() => advance(1), AUTO_MS)
    return () => clearTimeout(t)
  }, [idx, interactionTick, advance, pool.length])

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      // Refuse to surrender the gesture once we have it. Otherwise the
      // outer home-shell pan responder steals it mid-drag and the
      // carousel becomes unswipeable from inside the pager.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pan.stopAnimation()
        if (pendingCommit.current) pendingCommit.current()
        setInteractionTick(n => n + 1)
      },
      onPanResponderMove: (_, g) => {
        pan.setValue(g.dx)
      },
      onPanResponderRelease: (_, g) => {
        const forward = DIR > 0 ? g.dx < 0 : g.dx > 0
        const flick = Math.abs(g.vx) > 0.3
        const past  = Math.abs(g.dx) > STRIDE * 0.22
        let delta = 0
        if ((past || flick) && forward) delta = 1
        else if ((past || flick) && !forward) delta = -1
        if (delta === 0) {
          Animated.spring(pan, {
            toValue: 0,
            velocity: g.vx * 1000,
            tension: 90,
            friction: 18,
            useNativeDriver: true,
          }).start()
        } else {
          advance(delta, g.vx * 1000)
        }
      },
    })
  ).current

  if (pool.length === 0) return null

  return (
    <Animated.View
      style={[styles.wrap, { opacity: reveal, transform: [{ scaleX: reveal }] }]}
      {...responder.panHandlers}
    >
      <Animated.View style={[styles.strip, { transform: [{ translateX: pan }] }]}>
        {pool.map((src, poolIdx) => {
          const len = pool.length
          const half = len / 2
          let delta = poolIdx - idx
          if (delta > half) delta -= len
          if (delta < -half) delta += len
          if (Math.abs(delta) > 2) return null
          const x = delta * STRIDE * DIR
          const isCenter = delta === 0
          return (
            <View
              key={poolIdx}
              style={[
                styles.cardShadow,
                {
                  transform: [{ translateX: x }],
                  opacity: isCenter ? 1 : 0.9,
                },
              ]}
            >
              <View style={styles.cardInner}>
                <Image
                  source={src}
                  style={styles.img}
                  blurRadius={blur ? 18 : 0}
                  resizeMode="cover"
                  // Android defaults to a 300ms cross-fade when the source
                  // prop changes. With 5 slots all swapping on every
                  // advance, that read as a flicker — kill the fade so
                  // the new bitmap appears in the same frame.
                  fadeDuration={0}
                />
                {/* Muted-tones overlay — soft warm wash that desaturates
                    the photo so the carousel reads as illustrative rather
                    than as real profile photos. */}
                <View pointerEvents="none" style={styles.mutedOverlay} />
              </View>
            </View>
          )
        })}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    height: CARD_H,
    width: SCREEN_W,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  strip: {
    position: 'absolute',
    left: (SCREEN_W - CARD_W) / 2,
    top: 0,
    width: CARD_W,
    height: CARD_H,
  },
  cardShadow: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 22,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  cardInner: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  mutedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 235, 220, 0.32)',
  },
})
