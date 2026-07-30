import { Fragment, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { NotifyDot } from './RoundButton'
import { XS, SM, MD, TEXT, WEIGHT, NOTIFY_DOT_SIZE, DOCK_SHADOW, DISABLED_OPACITY } from '../tokens'
import { INK, LINE, PAGE } from '../colors'

// ── The dock — home's strip of four ────────────────────────────────────────
//
// What used to stand at the foot of home was the app's NAME: a wordmark says who
// we are, and the page had nowhere at all to say what a user can DO that is not
// "find someone" — every one of those things was behind a hamburger. These four
// are that menu, on the page: profile, circles, preferences, settings.
//
// IT IS A STRIP, NOT A ROW OF BUTTONS (user directive 2026-07-30, replacing the
// arched keys it opened as). A plain band of glyphs with a thin vertical rule
// between each option, and nothing else: no tile, no arch, no circle, no fill of
// its own, no rounding — its top edge is STRAIGHT, and it runs to the very
// bottom of the screen. Everything that made the keys read as objects standing
// on the page was exactly what had to go; what is left is the page with four
// marks along its bottom.
//
// Its ground IS the page's (`PAGE`), which is the point rather than an omission:
// the strip must not read as a separate surface laid over home. The only
// hairlines here are the ones BETWEEN the four options — there is NO rule along
// its top, and there must never be one. What stands between the strip and the
// page is a SHADOW (user directive 2026-07-30): the band HOVERS over the page
// rather than being fenced from it, so the eye reads a foreground the same
// colour as its background without a line having to say so. `DOCK_SHADOW` in
// tokens.ts — a deeper, heavier stop than the bottom sheet's, and deliberately
// so: a sheet is its own colour and needs only an edge, while this band's colour
// IS the page's, so the shadow is doing the whole job on its own.
// The glyphs and their words are `INK`, the app's one purple.
//
// It is a FLOW SIBLING BELOW page1, never a layer over it (see home.tsx): the
// match card is laid out in the space above this strip and clipped at its top
// edge, so a card can never cover the strip and a pulled card rides off INTO it
// rather than across it.

export type DockItem = {
  /** Stable identity for the row — never rendered. */
  key: string
  /** The one word under the glyph. */
  label: string
  /** Already coloured and sized by the caller, like every other glyph slot. */
  icon: ReactNode
  /** Owns its own haptic, exactly as a RoundButton's does — the openers these
   *  entries call (openOverlay and friends) already fire one, and a tap here
   *  would double it. */
  onPress: () => void
  /** Something is waiting on the user behind this entry (join + friend requests
   *  behind Circles). THE app's one notification dot, from its one
   *  implementation — see NotifyDot. */
  badge?: boolean
  /** This entry is not available to this user YET (Circles before the profile is
   *  built). The glyph AND its word fade together — one `opacity` on the whole
   *  key rather than a muted colour per part, so the two can never fade by
   *  different amounts and the entry reads as one dimmed object.
   *
   *  It stays PRESSABLE on purpose: a dead key teaches nothing, so the tap must
   *  still land on whatever explains the closed door (the members-only popup,
   *  which offers the way out of it). Never `disabled` — see DISABLED_OPACITY. */
  dimmed?: boolean
}

// How far a key fades under the finger. Named because it is now MULTIPLIED with
// the shut-door fade rather than just written into one style (see itemDimmedPressed).
const PRESS_OPACITY = 0.55

export function HomeDock({ items, bottom }: {
  items: DockItem[]
  /** How far the strip's content stands above the screen edge. The caller's,
   *  because only it knows what furniture is down there (`bottomGap` +
   *  useBottomInset). It is PADDING, not a margin: the band itself runs to the
   *  very bottom edge, and only the glyphs are held clear of the navigation bar. */
  bottom: number
}) {
  return (
    <View style={[styles.strip, { paddingBottom: bottom }]}>
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {/* Between the options and nowhere else: no rule at either end of the
              strip, and none along its top. */}
          {i > 0 ? <View style={styles.divider} /> : null}
          <Pressable
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            // A dimmed key is still pressed, so the two fades COMPOUND rather
            // than override: with a plain [dimmed, pressed] array the press
            // style simply wins and a faded key gets BRIGHTER under the finger.
            style={({ pressed }) => [
              styles.item,
              item.dimmed && styles.itemDimmed,
              pressed && (item.dimmed ? styles.itemDimmedPressed : styles.itemPressed),
            ]}
          >
            {/* The dot rides the GLYPH: the strip has no tile to pin a marker to,
                so the marker sits where a badge sits on an app icon, straddling
                the glyph's own top-END. Its size is the app's one dot size; only
                this offset is local, and it is geometry rather than a token (the
                same rule the round buttons' arc inset is stated under). */}
            <View style={styles.glyph}>
              {item.icon}
              {item.badge ? <NotifyDot style={styles.dot} /> : null}
            </View>
            <Text style={styles.label}>{item.label}</Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // The band. `alignItems:'stretch'` is what lets the dividers run the full
  // height of the content beside them without anyone measuring it. No radius and
  // no border: its top edge is a straight line, and what makes it visible is the
  // lift under it rather than a rule on it.
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: PAGE,
    paddingTop: MD,
    boxShadow: DOCK_SHADOW,
  },
  // One option. Equal share of the strip, so four of them divide it evenly and
  // the rules between them land on quarters.
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: XS,
    paddingVertical: SM,
    paddingHorizontal: XS,
  },
  // The app's one press feedback for a control with no tile to tint: the same
  // fade a RoundButton uses, since there is no surface here to flash.
  itemPressed: { opacity: PRESS_OPACITY },
  // Not available to this user yet — THE app's one shut-door fade, on the whole
  // key so the glyph and its word fade as one object.
  itemDimmed: { opacity: DISABLED_OPACITY },
  // Both at once, multiplied: a shut door the finger is on is still a shut door,
  // and it must not brighten under the touch that opens its explanation.
  itemDimmedPressed: { opacity: DISABLED_OPACITY * PRESS_OPACITY },
  // THE hairline, the app's one (`LINE`) — thin enough to separate the options
  // without drawing a grid over the foot of the page.
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: -NOTIFY_DOT_SIZE / 2,
    end: -NOTIFY_DOT_SIZE / 2,
  },
  // One word, under the glyph. The rank BELOW the body: the caption names the
  // glyph over it, it does not compete with the headline the page is built
  // around. Centred, and free to wrap — the strip grows, the word is never cut.
  label: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: INK,
    textAlign: 'center',
  },
})
