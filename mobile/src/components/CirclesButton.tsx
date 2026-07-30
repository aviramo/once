import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { Chip } from './Chip'
import { MetaLine } from './MetaLine'
import { GroupsIcon } from './icons'
import { tap } from '../lib/haptics'
import { requestLabel } from '../lib/communities'
import type { MetaPart } from '../lib/meta'
import { SM, MD, XS, ICON, RADII, STROKE, TEXT, WEIGHT, CIRCLES_BUTTON_SIZE } from '../tokens'
import { INK, INK_PALE, LIFT_SHADOW, PAGE, SURFACE } from '../colors'
import { iconScale } from '../fonts'

// ── The Circles button — the menu's one BIG round emblem ────────────────────
//
// Circles are not a preference like the rows around them: they are what decides
// WHO the app shows you, so they are not a row at all (user directive
// 2026-07-30). Everything the menu row used to say is INSIDE this one disc — the
// app's woven-rings mark, the word itself, each count on a line of its own, and
// the solid chip for anything waiting on the user's answer, which used to ride
// the row's END edge. There is no Circles row any more; do not restore one
// beside this.
//
// THREE RINGS OF THE SAME SHAPE, read from the outside in (user directive
// 2026-07-30): the page's own pale purple as a band around the rim, the purple
// circle drawn on it, and the white the content stands on. It lives half on the
// profile photo and half on the menu's white (see settings.tsx), so the whole of
// it floats on the LIFT_SHADOW every on-photo tile casts, and it is opaque
// throughout — see `disc` and `core`.
//
// Why it is NOT a `RoundButton`, which is otherwise exactly this object: that
// component pins the glyph ceiling to FIXED_BOX_SCALE because its diameter is a
// plain dp — correct for a circle holding one glyph, and forbidden here, since
// what stands in this one is TEXT and "never for text" is the rule (see
// FIXED_BOX_SCALE in fonts.ts). This disc's diameter takes the OS font scale
// itself, through the app's one ceiling (`iconScale`), so the three lines inside
// it and the circle around them grow together and stop together. Should a label
// still outgrow that — a long empty-state line wrapping — the box grows taller
// than wide and RADII.pill turns it into a stadium rather than clipping a word.
export function CirclesButton({ title, facts, requests, onPress }: {
  /** The emblem's name — the one Circles string, shared with the hub it opens. */
  title: string
  /** The counts under it, on the app's one fact line (MetaLine): friends, then
   *  groups. What the account has none of yet says what circles are FOR. */
  facts: MetaPart[]
  /** How much is waiting on MY answer (join requests + friend requests). It
   *  rides its own solid chip INSIDE the disc, the one place the count is
   *  stated on this page. */
  requests: number
  onPress: () => void
}) {
  const size = iconScale(CIRCLES_BUTTON_SIZE)
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.disc, { width: size, minHeight: size }]}
    >
      {/* The press state belongs to the CORE, not to the band around it, so the
          children have to know it — hence the function child. */}
      {({ pressed }) => (
        <>
          {/* The white core, and the purple circle drawn around its edge: what
              is left of the disc outside it is the PAGE band (see `disc`). Three
              rings of the same shape, which is the emblem's own subject — and it
              is what makes the disc read as a mark rather than as a big round
              button someone parked on the photo. */}
          <View pointerEvents="none" style={[styles.core, pressed && styles.corePressed]} />
          <GroupsIcon color={INK} size={ICON.xxl} />
          <Text style={styles.title}>{title}</Text>
          {/* ONE FACT PER LINE, never the interpunct chain (user directive
              2026-07-30): the disc is a narrow column, so "5 friends · 4 groups"
              strung on a dot either overflows it or wraps at whatever word happens
              to reach the rim — and a break inside a chained line puts the dot at
              the end of a line, which is the one thing the fact line may never do.
              Two values, two lines, stacked. Each is still rendered BY the fact
              line, so a count in this emblem is painted exactly as the same count
              is on every row in the app; what the emblem changes is only how many
              facts go on a line. They stack tight, as one block under the name. */}
          <View style={styles.facts}>
            {facts.filter(Boolean).map(fact => (
              <MetaLine key={String(fact)} parts={[fact]} align="center" />
            ))}
          </View>
          {/* Waiting on the user, LAST and at the bottom (user directive
              2026-07-30) — under everything the emblem states about itself,
              because it is the one thing here that asks for something back. */}
          {requests > 0 ? (
            <View style={styles.waiting}><Chip small tone="solid" text={requestLabel(requests)} /></View>
          ) : null}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // A stack, centred on both axes: the mark, the name, the facts, and the chip
  // when something is waiting. RADII.pill rather than size/2 so the shape is
  // round by construction at every font scale (see above).
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: XS,
    paddingHorizontal: MD,
    paddingVertical: MD,
    borderRadius: RADII.pill,
    // The OUTER BAND is the PAGE tint (user directive 2026-07-30): the disc is
    // read from the outside in as the page's own pale purple, the purple circle
    // drawn on it, and the white the content stands on. That band is what ties
    // the emblem to the menu it belongs to rather than to the photo it happens to
    // overlap, and it is OPAQUE, so the tile still supplies its own contrast over
    // an arbitrary photo — the reason on-photo chrome is a solid tile at all.
    backgroundColor: PAGE,
    ...LIFT_SHADOW,
  },
  // The white core inside the purple circle. Inset by the same SM on all four
  // sides, so the band is one even width and the circle stays concentric with the
  // rim whatever the disc's diameter turns out to be.
  core: {
    position: 'absolute',
    top: SM, bottom: SM, start: SM, end: SM,
    borderRadius: RADII.pill,
    borderWidth: STROKE.thin,
    borderColor: INK_PALE,
    backgroundColor: SURFACE,
  },
  // The app's one press flash, on the surface that actually holds the content:
  // the PAGE tint arriving over the core's white (never a second wash token, and
  // never an alpha — a translucent fill here would show the photo through the
  // emblem for as long as the finger is down).
  corePressed: { backgroundColor: PAGE },
  // The emblem's name: the body rank, in the app's one emphasis weight — it is
  // the heading of this tile, and the tile is small enough that the heading rank
  // (TEXT.lg) would leave the facts under it nowhere to stand.
  title: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK, textAlign: 'center' },
  // The stacked counts are ONE block: no gap between them, so they read as a
  // two-line statement under the name rather than as two separate things, and the
  // disc's own XS keeps them off the name and off the chip below.
  facts: { alignItems: 'center' },
  // A TILE, not another line of text, so it stands a full step under them (the
  // disc's XS plus this one) instead of crowding the last count.
  waiting: { marginTop: XS },
})
