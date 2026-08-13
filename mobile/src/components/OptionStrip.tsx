import { Fragment, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { XS, SM, ICON, TEXT, WEIGHT, DISABLED_OPACITY, PRESSED_OPACITY_BARE } from '../tokens'
import { INK, LINE } from '../colors'

// ── THE shape: A MARK, WITH ONE WORD UNDER IT ──────────────────────────────
// Three values make it, and they are exported because exactly one other thing in
// the app wears it: the group popup's purple invitation, standing beside an
// option of this very strip (`Button`'s `stack`). A pair whose marks are
// different sizes, or whose words sit at different ranks, reads as two controls
// that happened to share a row — which is what the first cut of that pair was,
// a button re-typing the shape in its own type and glyph size (user report
// 2026-07-31: "they are not the same component").
//
// The mark is the app's DEFAULT glyph size, which is what every option's call
// site already passes as its icon's own `size`.
export const STRIP_GLYPH = ICON.xxl
export const STRIP_GLYPH_GAP = XS
// The word: one rank BELOW the body (see `label`). No colour of its own — the
// strip's ink is INK, a filled button's is whatever its variant paints on.
export const STRIP_LABEL: TextStyle = {
  fontSize: TEXT.sm,
  fontWeight: WEIGHT.medium,
  textAlign: 'center',
}

// ── THE strip of options ───────────────────────────────────────────────────
//
// A row of things the user can do, each a GLYPH WITH ONE WORD UNDER IT, divided
// by the app's one hairline and standing on nothing at all: no tile, no fill, no
// arch, no rounding. It exists once and has two hosts — home's dock
// (`HomeDock.tsx`) and the bar under a profile card (`ProfileActionBar` in
// MatchCard.tsx) — because they are the same object: a set of marks along the
// foot of a surface, read at a glance, none of them the surface's purpose.
//
// The dock opened as arched keys and was cut back to this on 2026-07-30
// ("everything that made the keys read as objects standing on the page was
// exactly what had to go"); the profile bar was a column of full-width tinted
// tiles until 2026-07-31, when it was cut back to the same thing for the same
// reason — a stack of filled pills under a face reads as the page ASKING
// something, and a person page asks nothing. Two options side by side, the mark
// over its word, with the rule between them doing all the dividing a set of two
// needs.
//
// What is NOT here: the ground, the lift and the outer padding. Those say what
// the strip is standing ON, which only the host knows (the dock is the page's own
// colour under a shadow; the bar is a popup's white), so they arrive as `style`.
// The one other thing a host knows is whether the strip is the whole row: the
// account popup and chat's leave/block stand their single quiet option beside a
// purple action, which is what `hug` is for.

export type StripOption = {
  /** Stable identity for the option — never rendered. */
  key: string
  /** The one word under the glyph. */
  label: string
  /** Already coloured and sized by the caller, like every other glyph slot. */
  icon: ReactNode
  /** Owns its own haptic, exactly as a `Button`'s call site does — nothing here
   *  fires one, so a destructive option can pick its own. */
  onPress: () => void
  /** A mark standing beside the glyph — the dock's notification dot or its live
   *  count. Placed here so the two hosts can never place one differently; WHAT it
   *  is belongs to the host — including a host that hands over one component and
   *  lets it decide (the dock's `DockMarker`, which must stay mounted through a
   *  count appearing so it can tell that arrival from a mount). The anchor it
   *  hangs in is a zero-size absolute box, so one that paints nothing costs
   *  nothing and moves nothing. */
  marker?: ReactNode
  /** THE SAME SLOT, MIRRORED: the glyph's other top corner, for a second mark of
   *  the same kind standing against the first (the dock's credit deposit beside
   *  its balance, user directive 2026-08-01 — "let there be symmetry with the
   *  regular credits number"). It is one geometry stated once and reflected, so
   *  the pair straddles the glyph evenly and neither mark reads as the odd one;
   *  a corner with nothing to say paints nothing, exactly as this one does when
   *  no host passes it. */
  markerStart?: ReactNode
  /** This option is in flight: a spinner stands in its glyph's own place, the
   *  same "say it where the mark is" the photo rows give a slow picker. A busy
   *  option is never faded — it is the one that is working. */
  busy?: boolean
  /** Faded but STILL PRESSABLE: a door this user cannot go through yet, whose tap
   *  lands on whatever explains it (the dock's Circles before a profile exists).
   *  Never `disabled` — a dead key teaches nothing. */
  dimmed?: boolean
  /** Faded AND inert: another option on this strip is in flight, so nothing else
   *  may be started until it lands. */
  disabled?: boolean
}

// How far a marker is pulled back TOWARD its glyph from standing wholly clear of
// it. Bare ink can sit nearer than a tile could without ever touching the glyph's
// stroke, because what closes the gap is the mark's own side bearing rather than
// a fill's edge — but only just: a full XS put the digit against the mark, so it
// is half a step (user directive 2026-07-30, "a bit further, only a bit").
const MARKER_NUDGE = XS / 2

export function OptionStrip({ options, hug, style }: {
  options: StripOption[]
  /** THE STRIP IS NOT THE WHOLE ROW: each option takes the room its own glyph
   *  and word need instead of an equal share. For the hosts that stand the strip
   *  BESIDE something else — the account popup's delete and chat's block, each
   *  next to the purple action — where an even split would give one small word
   *  half the row and wrap the action being offered onto two lines. Every
   *  full-width host leaves it off, the group popup's own foot included: there,
   *  the equal share IS the layout (two options divide the strip in half, four
   *  land the rules on the quarters). */
  hug?: boolean
  /** The host's ground, lift and outer padding — see the note above. */
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.strip, style]}>
      {options.map((o, i) => {
        // A working option keeps its full strength: the spinner is already
        // saying it cannot be tapped, and fading it too would read as shut.
        const faded = (o.dimmed || o.disabled) && !o.busy
        return (
          <Fragment key={o.key}>
            {/* Between the options and nowhere else: no rule at either end of
                the strip, and none along its top or bottom. */}
            {i > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              onPress={() => { if (!o.disabled) o.onPress() }}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ disabled: !!o.disabled }}
              // A faded option is still pressed, so the two fades COMPOUND
              // rather than override: with a plain [faded, pressed] array the
              // press style simply wins and a faded key gets BRIGHTER under the
              // finger.
              style={({ pressed }) => [
                styles.item,
                hug ? styles.itemHug : styles.itemFill,
                faded && styles.itemFaded,
                pressed && (faded ? styles.itemFadedPressed : styles.itemPressed),
              ]}
            >
              {/* ONE marker slot per corner, whatever the mark is (user directive
                  2026-07-30: a dot and a number must sit identically over their
                  glyphs). The rule: the marker stands off the glyph's box on the
                  END side, pulled back toward it by MARKER_NUDGE, its box centred
                  on the glyph's TOP edge. A badge centred on the corner — where
                  both of these started — puts a quarter of itself over the mark
                  it is annotating, and on a 24dp glyph that reads as damage to
                  the glyph rather than a badge on it.

                  It takes an anchor because a run of ink whose width depends on
                  its digits cannot be offset by itself in a stylesheet:
                  `markerAnchor` is a zero-size box AT the corner, and what places
                  the mark against it is the anchor's own alignment —
                  `flex-start` across (its start edge on the corner, so it grows
                  outward, in either reading direction) and `center` along
                  (straddling the top edge).

                  THE INNER VIEW IS OUT OF FLOW, AND THAT IS THE WHOLE TRICK: an
                  IN-FLOW child of a zero-size box is measured against zero — text
                  laid out one character per line, which is what the first cut of
                  this painted. Yoga measures an ABSOLUTE child with no width and
                  no opposing insets at its natural size instead (nothing to
                  constrain it), and still places it by the parent's own
                  align/justify.

                  The START corner is that rule reflected and nothing else: the
                  anchor moves to the other side, the ink's END edge takes the
                  corner instead of its start, and the nudge back toward the
                  glyph closes the gap from the other direction. */}
              <View style={styles.glyph}>
                {o.busy ? <ActivityIndicator color={INK} /> : o.icon}
                {o.marker ? (
                  <View style={[styles.markerAnchor, styles.markerAnchorEnd]}>
                    <View style={[styles.markerFree, styles.markerFreeEnd]}>{o.marker}</View>
                  </View>
                ) : null}
                {o.markerStart ? (
                  <View style={[styles.markerAnchor, styles.markerAnchorStart]}>
                    <View style={[styles.markerFree, styles.markerFreeStart]}>{o.markerStart}</View>
                  </View>
                ) : null}
              </View>
              <Text style={styles.label}>{o.label}</Text>
            </Pressable>
          </Fragment>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // The row. `alignItems:'stretch'` is what lets the dividers run the full height
  // of the content beside them without anyone measuring it. No ground and no
  // border of its own: the host says what this is standing on.
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // One option: the mark over the word, at the shape's own gap.
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: STRIP_GLYPH_GAP,
    paddingVertical: SM,
    paddingHorizontal: XS,
  },
  // Its share of the strip, which is the one thing `hug` decides. FILL: an equal
  // share, so two options divide the strip in half and four land the rules on the
  // quarters — what a strip that IS the row wants. HUG: what the option's own
  // glyph and word measure, for a strip standing beside something else, with the
  // shrink so a long word gives back to its neighbour rather than pushing the
  // strip past its host. `minWidth: 0` in both, so what gives is the WORD (which
  // is free to wrap) and never the box.
  itemFill: { flex: 1, minWidth: 0 },
  itemHug: { flexShrink: 1, minWidth: 0 },
  // The app's one press feedback for a control with no tile to tint, shared with
  // a `plain` Button — there is no surface here to flash, so the ink answers.
  itemPressed: { opacity: PRESSED_OPACITY_BARE },
  // Shut, or shut-but-answering — THE app's one shut-door fade, on the whole
  // option so the glyph and its word fade as one object rather than by a muted
  // colour per part.
  itemFaded: { opacity: DISABLED_OPACITY },
  // Both at once, multiplied: a shut door the finger is on is still a shut door,
  // and it must not brighten under the touch that opens its explanation.
  itemFadedPressed: { opacity: DISABLED_OPACITY * PRESSED_OPACITY_BARE },
  // THE hairline, the app's one (`LINE`) — thin enough to separate the options
  // without drawing a grid over the surface they stand on.
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  // `minHeight` at the default glyph size, so the smaller spinner that stands in
  // for a working option's mark cannot shift the word under it. A caller passing
  // a bigger glyph simply grows the box.
  glyph: { minHeight: STRIP_GLYPH, alignItems: 'center', justifyContent: 'center' },
  // The number's anchor: a point, not a box. Zero on both axes, at one of the
  // glyph's top corners. Nothing here clips (neither host has an overflow of its
  // own, and both hold more air above the glyph than half a line of this size),
  // which is the same thing the dot beside it already relies on. Along the
  // glyph's top edge it is CENTRED, i.e. the mark straddles that edge — the one
  // thing both corners share and the reason a pair of them reads as one line.
  markerAnchor: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    justifyContent: 'center',
  },
  // The two corners, and the whole difference between them: which side the point
  // sits on, and which of the mark's edges is pinned to it. `flex-start` puts the
  // ink's START edge on the END corner so it grows outward; `flex-end` is that
  // sentence with both words swapped. Logical, so both mirror with the language.
  markerAnchorEnd: { end: 0, alignItems: 'flex-start' },
  markerAnchorStart: { start: 0, alignItems: 'flex-end' },
  // Out of the anchor's flow, so nothing constrains the measurement (see the
  // render). No insets on purpose: with none given, the anchor's own alignment
  // decides where it lands — and the one margin is the nudge back toward the
  // glyph, on whichever side of the mark faces it.
  markerFree: { position: 'absolute' },
  markerFreeEnd: { marginStart: -MARKER_NUDGE },
  markerFreeStart: { marginEnd: -MARKER_NUDGE },
  // One word, under the glyph. The rank BELOW the body: the caption names the
  // glyph over it, it does not compete with whatever the surface is built around.
  // Centred, and free to wrap — the strip grows, the word is never cut.
  label: { ...STRIP_LABEL, color: INK },
})
