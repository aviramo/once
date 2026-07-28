// Shared community primitives — the member/owner Avatar and the list skeleton —
// used by the Communities sheet AND the group chip's shared-groups popup.
// Extracted here so both surfaces render the exact same avatar and loading
// placeholder (DRY: one definition, two call sites). The count wording
// (memberLabel and friends) is plain text with no JSX, so it lives beside the
// rest of the communities text helpers in lib/communities.ts.
import { useEffect, useState } from 'react'
import { I18nManager, Image, View, StyleSheet } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Path } from 'react-native-svg'
import { Text } from './AppText'
import { Glyph } from './icons'
import { publicImageUrl } from '../lib/api'
import { type MemberImage } from '../lib/communities'
import { XS, SM, MD, TEXT, WEIGHT, PULSE, SKELETON, SYNC, lh } from '../tokens'
import { INK, INK_DIM, WHITE, LINE, SURFACE_SUNK } from '../colors'

export const AVATAR = 40

// A member's / person's / owner's main photo, or their initial on a brand
// ground. The literal '★' name renders the friends star instead of a letter.
export function Avatar({ userId, name, image, size = AVATAR }: { userId: string; name: string | null; image: MemberImage; size?: number }) {
  const uri = image?.normal ? publicImageUrl(userId, 'normal', image.normal) : null
  const label = (name ?? '').trim()
  const initial = label.charAt(0) || '?'
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}>
      {label === '★' ? (
        <StarGlyph size={size * 0.5} color={WHITE} />
      ) : (
        <Text style={{ color: WHITE, fontWeight: WEIGHT.semibold, fontSize: size * 0.4 }}>{initial}</Text>
      )}
    </View>
  )
}

export const StarGlyph = ({ size, color }: { size: number; color: string }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
    <Path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95z" />
  </Glyph>
)

// The placeholder a roster wears while it loads: the real row geometry with the
// avatar and text swapped for pale purple bars, breathing on the app's one PULSE.
// Drop it INSIDE the card the list will fill, so the card keeps its shape and
// the rows fade in where the bars already were instead of after a spinner
// collapses. `rows` takes the real count when the caller knows it; `lines` is
// how many text lines the real row carries (a name, or a name plus meta).
// `first` is false when the placeholder follows REAL rows inside the same card
// (the hub's one list, where My friends is painted already): the top bar then
// keeps its hairline instead of merging into the row above it. `avatar` is off
// for a list whose rows carry no leading lane at all (group search, whose rows
// are all text), so the bars start where the words will.
export function SkeletonRows({ rows = SKELETON.maxRows, lines = 1, first = true, avatar = true }: { rows?: number; lines?: number; first?: boolean; avatar?: boolean }) {
  const breath = useSharedValue(1)
  useEffect(() => {
    breath.value = withRepeat(withTiming(PULSE.opacity, { duration: PULSE.phaseMs }), -1, true)
  }, [breath])
  const pulse = useAnimatedStyle(() => ({ opacity: breath.value }))

  const count = Math.max(1, Math.min(Math.round(rows), SKELETON.maxRows))
  return (
    <Animated.View style={pulse} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => {
        const w = SKELETON.widths[i % SKELETON.widths.length]
        return (
          <View key={i} style={[sk.row, lines > 1 && sk.rowTall, i === 0 && first && sk.rowFirst]}>
            {avatar ? <View style={sk.avatar} /> : null}
            <View style={sk.text}>
              {/* Each bar sits centred in a box the height of the LINE OF TEXT
                  it stands for, so the placeholder is exactly as tall as the
                  strip that replaces it and the bars get the same air the words
                  will (user directive 2026-07-28). The bar's own height stays
                  slim — it is a placeholder, not a block. */}
              <View style={sk.line}><View style={[sk.bar, { width: `${w * 100}%` }]} /></View>
              {Array.from({ length: Math.max(0, lines - 1) }, (_, j) => (
                <View key={j} style={sk.line}><View style={[sk.meta, { width: `${w * SKELETON.metaOfTitle * 100}%` }]} /></View>
              ))}
            </View>
          </View>
        )
      })}
    </Animated.View>
  )
}

// ── SyncBar ────────────────────────────────────────────────────────────────
// The other half of SkeletonRows, for the other half of the wait. A roster
// opens FULL — the people the last visit left are on screen from the first
// frame — so once the round trip that corrects them is running there is no
// placeholder left to say so, and a list that quietly rearranges itself a beat
// later reads as a glitch. This is the word for that beat and nothing more: a
// hairline segment drifting along the list's TOP EDGE, over the very rows it is
// about. Absolutely positioned, so it can never move a row; no track under it,
// no percentage; gone on a fade the moment the answer lands. A list with
// NOTHING painted yet doesn't wear it — its skeleton is already saying that, and
// the two together would be two voices for one wait.
// Drop it as the LAST child of the card/box the list fills (it paints over the
// first row's top edge, and a later sibling is what puts it there on Android).
export function SyncBar({ visible }: { visible: boolean }) {
  const [width, setWidth] = useState(0)
  const progress = useSharedValue(0)
  const shown = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      progress.value = 0
      progress.value = withRepeat(
        // LINEAR, and the travel below is a segment-width longer than the edge:
        // at constant speed the segment leaves one end exactly as it enters the
        // other, so the drift never stops. withTiming's own eased default would
        // park it off-screen at both ends of every cycle and the mark would
        // blink instead of drift. The period is the app's one PULSE, the same
        // clock the skeleton above breathes on.
        withTiming(1, { duration: PULSE.phaseMs, easing: Easing.linear }),
        -1,
        false,
      )
      shown.value = withTiming(1)
      return
    }
    // The drift keeps running THROUGH the fade and stops after it: cancelling on
    // the spot would freeze the segment mid-edge while it faded out.
    shown.value = withTiming(0, undefined, done => { if (done) cancelAnimation(progress) })
  }, [visible, progress, shown])

  // Physical (left/translateX), not start/end: the transform is what carries the
  // direction, off the same flag every other RTL flip in the app reads.
  const segment = width * SYNC.segment
  const travel = width + segment
  const from = I18nManager.isRTL ? width : -segment
  const sign = I18nManager.isRTL ? -1 : 1
  const drift = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: from + progress.value * travel * sign }],
  }), [from, travel, sign])

  return (
    <View
      style={sk.syncTrack}
      pointerEvents="none"
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[sk.syncSegment, { width: segment }, drift]} />
    </View>
  )
}

// ── Meta line ──────────────────────────────────────────────────────────────
// There is no MetaText component any more (2026-07-28). A meta line's "the
// interpunct at a break DISAPPEARS" rule now lives in the app's base `Text`
// (components/AppText.tsx) and applies to every string in the app, so a plain
// <Text>{metaLine(...)}</Text> gets it — which is what the search rows and the
// menu row did NOT get while it was an opt-in component here.

const sk = StyleSheet.create({
  // Mirrors CommunitiesPage's `Strip` — same gutters, same hairline, same
  // avatar lane, same paddings, so a bar sits exactly where its name will and
  // the list does not change height when the real rows land on it.
  row: { flexDirection: 'row', alignItems: 'center', gap: MD, paddingHorizontal: MD, paddingVertical: SM, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  // The strip's own rule: a row that says something UNDER the name breathes,
  // one that is a name and nothing else stays tight.
  rowTall: { paddingVertical: MD },
  rowFirst: { borderTopWidth: 0 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: SURFACE_SUNK },
  text: { flex: 1, minWidth: 0, gap: XS },
  // One line of text, as tall as the real thing will be.
  line: { height: lh(TEXT.md), justifyContent: 'center' },
  bar: { height: SKELETON.barHeight, borderRadius: SKELETON.barHeight / 2, backgroundColor: SURFACE_SUNK },
  meta: { height: SKELETON.metaHeight, borderRadius: SKELETON.metaHeight / 2, backgroundColor: SURFACE_SUNK },
  // A lane across the list's top edge with nothing drawn in it: only the segment
  // inside is ever visible, so a list that is NOT syncing shows no line at all
  // rather than an empty track waiting to be filled.
  syncTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: SYNC.height, overflow: 'hidden' },
  // The softest ink there is: over the card's white it reads as a shade passing
  // along the edge, not as a bar laid on top of it.
  syncSegment: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: SYNC.height / 2, backgroundColor: INK_DIM },
})
