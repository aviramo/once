// Shared community primitives — the member/owner Avatar and the list skeleton —
// used by the Communities sheet AND the group chip's shared-groups popup.
// Extracted here so both surfaces render the exact same avatar and loading
// placeholder (DRY: one definition, two call sites). The count wording
// (memberLabel and friends) is plain text with no JSX, so it lives beside the
// rest of the communities text helpers in lib/communities.ts.
import { useEffect } from 'react'
import { Image, View, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Path } from 'react-native-svg'
import { Text } from './AppText'
import { Glyph } from './icons'
import { publicImageUrl } from '../lib/api'
import type { MemberImage } from '../lib/communities'
import { XS, SM, MD, WEIGHT, PULSE, SKELETON } from '../tokens'
import { GREEN, WHITE, BORDER_SOFT, SURFACE_SUNK } from '../colors'

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
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
      {label === '★' ? (
        <StarGlyph size={size * 0.5} color={WHITE} />
      ) : (
        <Text style={{ color: WHITE, fontWeight: WEIGHT.extrabold, fontSize: size * 0.4 }}>{initial}</Text>
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
// avatar and text swapped for beige bars, breathing on the app's one PULSE.
// Drop it INSIDE the card the list will fill, so the card keeps its shape and
// the rows fade in where the bars already were instead of after a spinner
// collapses. `rows` takes the real count when the caller knows it; `lines` is
// how many text lines the real row carries (a name, or a name plus meta).
export function SkeletonRows({ rows = SKELETON.maxRows, lines = 1 }: { rows?: number; lines?: number }) {
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
          <View key={i} style={[sk.row, i === 0 && sk.rowFirst]}>
            <View style={sk.avatar} />
            <View style={sk.text}>
              <View style={[sk.bar, { width: `${w * 100}%` }]} />
              {Array.from({ length: Math.max(0, lines - 1) }, (_, j) => (
                <View key={j} style={[sk.meta, { width: `${w * SKELETON.metaOfTitle * 100}%` }]} />
              ))}
            </View>
          </View>
        )
      })}
    </Animated.View>
  )
}

const sk = StyleSheet.create({
  // Mirrors CommunitiesPage's `memberRow` — same gutters, same hairline, same
  // avatar lane, so a bar sits exactly where its name will.
  row: { flexDirection: 'row', alignItems: 'center', gap: MD, paddingHorizontal: MD, paddingVertical: SM, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER_SOFT },
  rowFirst: { borderTopWidth: 0 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: SURFACE_SUNK },
  text: { flex: 1, minWidth: 0, gap: XS },
  bar: { height: SKELETON.barHeight, borderRadius: SKELETON.barHeight / 2, backgroundColor: SURFACE_SUNK },
  meta: { height: SKELETON.metaHeight, borderRadius: SKELETON.metaHeight / 2, backgroundColor: SURFACE_SUNK },
})
