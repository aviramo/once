import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chip, ChipStack } from './Chip'
import { useBottomInset } from '../hooks/useBottomInset'
import { MD, SM, ICON, bottomGap } from '../tokens'

// ── THE menu that opens WHERE THE FINGER IS ────────────────────────────────
// (user directive 2026-07-31, written for the photo actions on the own-profile
// card.) A short list of actions ABOUT the thing just tapped is not a popup. A
// popup is a surface the app RAISES to say something, and it earns the bottom of
// the screen, a title, a paragraph and a row of named buttons. This says nothing
// at all — it is the tapped object's own set of verbs — so it is a little tile
// that grows out of the tap and stands over it.
//
// It is therefore the one surface in the app that is not a `BottomSheet`, and the
// exception is stated here, once, so no call site invents a second one: a
// contextual menu is not a bottom-anchored dialog, and the sheet's rules (the
// title, the rhythm, the bottom gap) describe a thing this is not. Everything the
// app raises of its own accord is still a BottomSheet.
//
// IT IS ONE WHITE TILE WITH HAIRLINES ACROSS IT, AND EVERY ROW IS A GLYPH AND A
// WORD (user directive 2026-07-31) — the very object the match card's fact set
// is: `ChipStack`, whose rows are ordinary `Chip`s divided by the app's one rule.
// One set of verbs about one thing is one object, exactly as one set of facts
// about one person is. (It spent an afternoon as separate icon-only tiles laid
// out as a cross around the finger; separate tiles read as separate things, and a
// bare mark makes the reader guess at what it does.)
//
// ONLY WHAT IS AVAILABLE IS SHOWN (user directive 2026-07-31). Everywhere else in
// the app a shut control stays on screen wearing `DISABLED_OPACITY`, because it is
// a door the user will want and must be told about. These are not doors: "move
// this photo up" when it is already first is not a thing being withheld, it is a
// thing that does not exist, and a tile this small has no room to explain. So the
// caller passes what applies and the tile is exactly that tall.
//
// THE SAFETY MARGIN IS THE PAGE'S OWN: the tile is centred on the finger's column
// and stood clear of the finger itself, then pushed back inside the page gutter
// and both safe areas, so a photo tapped at the edge of the screen still opens its
// menu fully on-screen — and it is never WIDER than that band either, so a row
// carrying a whole sentence wraps inside the tile instead of running off the edge
// of the screen (the first-open photo tutorial, Hebrew at a large font scale,
// 2026-08-01).

/** How far the tile stands off the finger, so the thumb that opened the menu is
 *  not resting on the row it opened. */
const FINGER_GAP = SM

/** The pop is a ZOOM AND NOTHING ELSE (user directive 2026-07-31): the tile grows
 *  from nothing to full size out of the tap point, with no fade riding along.
 *  Starting at zero is also what hides it before it has been measured — there is
 *  no opacity anywhere in this file, so there is nothing that could blink on, and
 *  nothing that puts a translucent shadowed tile into an offscreen compositing
 *  layer over a photograph (which is what made the old separate tiles flicker on
 *  Android). */
const POP_FROM = 0

export type TapMenuAction = {
  key: string
  /** Handed the row's own ink. */
  renderIcon: (color: string) => ReactNode
  /** What this row DOES, in words. Every row says itself: a mark alone makes the
   *  reader guess, and this tile has room for the sentence. */
  label: string
  onPress: () => void
}

/** Where the menu opens, in WINDOW coordinates — i.e. a touch's own
 *  `pageX`/`pageY`. Null closes it. Hold it in state at the call site, so the
 *  point cannot change identity under an open menu. */
export type TapPoint = { x: number; y: number }

/** The size a row's mark renders at: the leading glyph of a chip, like every
 *  other glyph standing beside a line of text in the app. */
export const TAP_MENU_ICON = ICON.sm

/** Where the tile is allowed to be: the page's gutter on the sides, and the app's
 *  own air off the top and bottom system bands — the same numbers every other
 *  piece of chrome keeps off the screen edge, because this IS chrome standing on
 *  the page rather than a surface of its own. */
type Bounds = { screenW: number; minTop: number; maxBottom: number }

export function TapMenu({ at, actions, onDismiss }: {
  at: TapPoint | null
  /** What can be done, top to bottom — and ONLY what can be done right now (see
   *  above). An empty list opens nothing. */
  actions: TapMenuAction[]
  onDismiss: () => void
}) {
  // Every measurement is read HERE, out in the app's own tree, and handed down as
  // plain numbers: a `Modal` is a separate native window, and the safe-area
  // provider inside one can report zeros (the same reason chat's lightbox is
  // passed its top inset rather than reading one).
  const insets = useSafeAreaInsets()
  const bottomInset = useBottomInset()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const bounds: Bounds = {
    screenW,
    minTop: insets.top + MD,
    maxBottom: screenH - bottomGap(bottomInset, MD),
  }
  const open = at != null && actions.length > 0

  return (
    // Its own native window, like every other overlay in the app. What this opens
    // over is a card inside a rising sheet, with its own transforms and its own
    // clipping, while a touch reports pageX/pageY in WINDOW coordinates — and a
    // window is the one place those two agree with nothing having to be measured.
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      {/* THE WINDOW IS LAID OUT LTR, and that is load-bearing (user report
          2026-07-31: in Hebrew the menu opened mirrored, on the wrong side of the
          finger). `left` is not a physical edge for an ABSOLUTELY positioned box:
          Yoga resolves an absolute child's cross-axis position against its
          parent's direction, so in an RTL container a `left` is read as the
          TRAILING offset and measured from the right edge — which mirrors a point
          that came from a touch and is physical by definition. Pinning the box
          this is measured in to LTR is what makes a window coordinate mean itself.
          The tile's ROWS still read start-to-end: a `Chip` states its own
          direction. */}
      <View style={styles.window}>
        {/* No scrim. This is a small tile over a photo the user is still looking
            at; dimming the screen for it would say a surface had been raised,
            which is precisely what this is not. The backdrop is here only to catch
            the tap that puts the menu away. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        {/* Mounted only while there IS a point, so every open starts with nothing
            measured. Held across opens, the previous menu's box would place the
            next one for the frame between the tap and its own layout. */}
        {open ? <TapMenuTile at={at} bounds={bounds} actions={actions} /> : null}
      </View>
    </Modal>
  )
}

function TapMenuTile({ at, bounds, actions }: { at: TapPoint; bounds: Bounds; actions: TapMenuAction[] }) {
  // The tile's own size, which is what decides where it can be put.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const pop = useSharedValue(POP_FROM)
  useEffect(() => { if (box) pop.value = withTiming(1) }, [box, pop])

  const w = box?.w ?? 0
  const h = box?.h ?? 0
  // Centred on the finger's column, then pushed back inside the margin. Both
  // bounds are well-formed by construction: the anchor's own padding is the band,
  // so the tile cannot be wider than it and its END margin is never past its
  // START one.
  const left = Math.min(Math.max(at.x - w / 2, MD), bounds.screenW - MD - w)
  // THE BAND IS A LAYOUT BOX AND THE PLACEMENT IS A TRANSFORM INSIDE IT (user
  // report 2026-08-02: the tile still came out flush against a screen edge). The
  // margin used to be a `maxWidth` on a box pinned at `left: 0` — i.e. a CAP the
  // tile was free to sit anywhere inside, so anything the row laid out wider than
  // the cap (a long sentence in a flex row) simply painted past it, and the
  // clamp above was clamping a width that was not the width being painted. The
  // anchor now spans the window with the page's gutter as PADDING, so the band
  // is definite: the tile is laid out in it and physically cannot be drawn
  // outside it, whatever its content does.
  //
  // It is still a transform and not a layout offset, for the reason it always
  // was: a `left` computed FROM the measured width feeds back into the width
  // Yoga offers the box, so the tile wrapped at one place, moved, re-wrapped
  // wider and moved again, converging over several renders with the zoom already
  // running. The band is the same width on every pass, so the tile is measured
  // once and then simply moved — by `left - MD`, the band's own start being
  // where an untranslated tile already stands.
  //
  // ZOOM ONLY — no opacity (user directive 2026-07-31). The origin stays the
  // finger: at any scale the window point `at.x` lands on itself, because the
  // translate rides outside the scale.
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  // ABOVE the finger by default: the thing being acted on is under it, and a list
  // laid over the photo just chosen hides the answer to "which one". Below only
  // when there is no room above.
  const above = at.y - FINGER_GAP - h >= bounds.minTop
  const top = Math.min(
    Math.max(above ? at.y - FINGER_GAP - h : at.y + FINGER_GAP, bounds.minTop),
    Math.max(bounds.minTop, bounds.maxBottom - h),
  )

  return (
    <Animated.View
      // `box-none`: the band runs the width of the window, and the empty page
      // gutter beside the tile must still be the backdrop's tap, not a dead
      // strip that answers nothing.
      pointerEvents="box-none"
      style={[
        styles.anchor,
        { top },
        // The origin IS the finger, expressed in the band's own coordinates —
        // which on the horizontal are the window's, the band being pinned to both
        // edges — so the tile grows out of the point that was touched even where
        // the margin has pushed it away from there (a photo tapped at the screen's
        // edge), rather than out of its own middle.
        { transformOrigin: [at.x, at.y - top, 0] },
        popStyle,
      ]}
    >
     <View
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setBox(cur => (cur && cur.w === width && cur.h === height ? cur : { w: width, h: height }))
      }}
      style={{ transform: [{ translateX: left - MD }] }}
     >
      {/* The card's own fact tile, carrying verbs instead of facts: white
          (`onPhoto`), the app's one hairline between rows, each row a glyph and a
          line of text.
          `stretch` is the one thing a menu needs that a fact set does not: the
          stack hugs its widest row and every row hugs its own label, so a SHORT
          row ("delete") would leave white tile beside it that answered no tap.
          Stretched, each row's press target is the whole width of the tile it is
          painted on. The tile still hugs — a stretch-aligned column takes its
          width from its widest child before stretching the rest to it. */}
      <ChipStack onPhoto style={styles.rows}>
        {actions.map(a => (
          <Chip
            key={a.key}
            renderIcon={c => a.renderIcon(c)}
            text={a.label}
            onPress={a.onPress}
          />
        ))}
      </ChipStack>
     </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // See the LTR note above: the box a window coordinate is measured in.
  window: { flex: 1, direction: 'ltr' },
  // THE BAND the tile is allowed to stand in: the whole window less the page's
  // own gutter on each side, stated as padding so it is a definite box rather
  // than a cap (see the placement note above). It holds the vertical position and
  // the zoom; `alignItems` keeps the tile hugging its widest row inside it, and
  // the real x is a translate.
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: MD,
    alignItems: 'flex-start',
  },
  // See the tile above: every row is as wide as the tile, so every row answers a
  // tap anywhere on the white it is painted on.
  rows: { alignItems: 'stretch' },
})
