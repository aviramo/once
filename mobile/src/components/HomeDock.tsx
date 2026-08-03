import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Text } from './AppText'
import { NotifyDot } from './RoundButton'
import { OptionStrip, type StripOption } from './OptionStrip'
import { useCountBlink } from '../hooks/useCountBlink'
import { inkOffset, FONT_SCALE } from '../fonts'
import { XS, MD, TEXT, WEIGHT, DOCK_SHADOW, MARK_SHADOW, PILL_RADIUS } from '../tokens'
import { INK, INK_SUBTLE, PAGE, PHOTO_CHROME } from '../colors'

// ── The dock — home's strip of four ────────────────────────────────────────
//
// What used to stand at the foot of home was the app's NAME: a wordmark says who
// we are, and the page had nowhere at all to say what a user can DO that is not
// "find someone" — every one of those things was behind a hamburger. These four
// are that menu, on the page: profile, circles, preferences, settings.
//
// IT IS A STRIP, NOT A ROW OF BUTTONS (user directive 2026-07-30, replacing the
// arched keys it opened as) — and it is THE strip, `OptionStrip`, which the bar
// under a profile card shares since 2026-07-31. A plain band of glyphs with a
// thin vertical rule between each option and nothing else: no tile, no arch, no
// circle, no fill of its own, no rounding. Everything that made the keys read as
// objects standing on the page was exactly what had to go; what is left is the
// page with four marks along its bottom. The option itself — the glyph, the word
// under it, the rule, the marker slot, the fades — lives in that component; what
// stays here is what the dock is standing ON, and what its four keys say.
//
// Its ground IS the page's (`PAGE`), which is the point rather than an omission:
// the strip must not read as a separate surface laid over home. (It was tried
// white on 2026-07-30 and put back the same day — a white band under a
// page-tinted screen is a second surface, which is exactly what this is not.)
//
// There is NO rule along its top, and there must never be one. What stands
// between the strip and the page is a SHADOW (user directive 2026-07-30): the
// band HOVERS over the page rather than being fenced from it, so the eye reads a
// foreground the same colour as its background without a line having to say so.
// `DOCK_SHADOW` in tokens.ts — a deeper, heavier stop than the bottom sheet's,
// and deliberately so: a sheet is its own colour and needs only an edge, while
// this band's colour IS the page's, so the shadow is doing the whole job on its
// own. The glyphs and their words are `INK`, the app's one purple.
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
  /** A live QUANTITY behind this entry, in the dot's own place (user directive
   *  2026-07-30): the requests waiting in Circles, the people watching me, the
   *  credits I hold. Where a dot says "there is something here", the number says
   *  how much of it — so an entry whose surface opens on a quantity states that
   *  quantity on the key itself.
   *
   *  A NUMBER AND NOTHING ELSE (user directive 2026-07-30): no tile, no fill, no
   *  shadow, the same purple as the glyph it stands beside. It began as the app's
   *  `Chip` — the very tile each of these numbers wears on the ROW its popup
   *  opens — and a tile in this corner reads as a second object stuck to a mark
   *  that is already only 24dp wide. Bare ink is the whole statement, exactly as
   *  the chat composer's controls are glyphs and nothing else.
   *
   *  It is a number, not a node, because the dock owns how a quantity looks here
   *  and three call sites must not each decide. `undefined` = nothing to say (a
   *  zero watcher count is not a fact worth painting); the credits key passes 0,
   *  which IS a fact. Never both this and `badge` on one entry — they occupy the
   *  same place, and the number is the fuller statement.
   *
   *  A CHANGE IN IT BLINKS (user directive 2026-07-31) — see DockMarker. */
  count?: number
  /** A SECOND quantity of the same kind, at the glyph's other top corner (user
   *  directive 2026-08-01): the credits standing in a DEPOSIT — one that left
   *  the wallet when I sent an invitation and is still ours until that
   *  invitation resolves — beside the balance the key already states. It is
   *  money the user has, and since 2026-07-31 money he can spend (a deposit pays
   *  for an accept), so a wallet that showed only the balance was
   *  under-reporting itself to the one person it belongs to.
   *
   *  A BARE NUMBER, FAINTER THAN THE BALANCE (user directive 2026-08-01: "some
   *  transparency, so it doesn't look like the credits; and drop the plus, just
   *  a number"). It opened as a "+1" — the sign saying "on top of the other
   *  number" — and a sign is a second thing to read on a mark two digits wide.
   *  What separates the two is STRENGTH: the balance is what I can spend and it
   *  is full `INK`; the deposit is spoken for, and it says so by standing back.
   *  Everything else stays the count's: the same size, the same slot geometry
   *  mirrored, the same blink when it changes. `undefined` = no deposit; a
   *  deposit of zero is not a deposit. */
  held?: number
  /** This entry is not available to this user YET (Circles before the profile is
   *  built). The glyph AND its word fade together — one `opacity` on the whole
   *  key rather than a muted colour per part, so the two can never fade by
   *  different amounts and the entry reads as one dimmed object.
   *
   *  It stays PRESSABLE on purpose: a dead key teaches nothing, so the tap must
   *  still land on whatever explains the closed door (the members-only popup,
   *  which offers the way out of it). See OptionStrip's `dimmed`. */
  dimmed?: boolean
}

export function HomeDock({ items, bottom }: {
  items: DockItem[]
  /** How far the strip's content stands above the screen edge. The caller's,
   *  because only it knows what furniture is down there (`bottomGap` +
   *  useBottomInset). It is PADDING, not a margin: the band itself runs to the
   *  very bottom edge, and only the glyphs are held clear of the navigation bar. */
  bottom: number
}) {
  const options: StripOption[] = items.map(({ key, label, icon, onPress, dimmed, count, held, badge }) => ({
    key, label, icon, onPress, dimmed,
    // What this key has to say, if anything. One component rather than the
    // ternary that used to stand here, because WHICH mark it is can change while
    // the dock is up (a request arrives behind a key that was clean) and the
    // number has to know it changed — see DockMarker.
    // The deposit hangs UNDER it (user directive 2026-08-02), in the same corner
    // rather than at the mirrored one: the two are one wallet said twice, so they
    // read down a single column instead of straddling the glyph from either side.
    // The SAME component again, so the two halves are the same mark down to the
    // blink. Passed even when there is nothing to say, for the reason the marker
    // itself always is — a deposit APPEARING is the change most worth marking,
    // and a component that mounts with it has nothing to compare against.
    marker: <DockMarker count={count} badge={badge} below={<DockMarker count={held} muted />} />,
  }))
  return <OptionStrip options={options} style={[styles.strip, { paddingBottom: bottom }]} />
}

// ── What one key has to say ────────────────────────────────────────────────
//
// A quantity outranks the dot, saying everything the dot says and how many
// besides; with neither, the key says nothing and this paints nothing. It is
// ONE component so a marker slot holds ONE mark, and so that the slot's
// placement is stated in exactly one place (OptionStrip) — including the second,
// mirrored corner the credits key uses for its deposit: the same component
// again, which is what makes the pair one wallet said twice rather than two
// numbers that happen to share a glyph.
//
// A NUMBER THAT CHANGED BLINKS (user directive 2026-07-31): three times over two
// seconds, and the gesture is `useCountBlink` — one implementation, shared with
// the name chip's clock, which says the same thing in the same way.
//
// It is mounted for every key, count or no count, and that is what makes the
// FIRST number blink too: a count arriving where there was none (0 → 1 requests)
// is the change that matters most, and it would be a plain mount — nothing to
// compare against — if this component came and went with the digit. What must
// never blink is the dock simply appearing with numbers already on it, so the
// first value each marker ever sees is recorded and not announced.
function DockMarker({ count, badge, muted, below }: {
  count?: number
  badge?: boolean
  /** Paint the number a step back from the key's own ink: the deposit half of
   *  the wallet, which is an amount the user HAS but has already committed. Two
   *  bare numbers on one glyph need something telling them apart, and strength
   *  is the one difference that needs no character to say it — `INK_SUBTLE`, the
   *  ramp's own "secondary label" step. Not `INK_HINT`: at 0.48 it lands on the
   *  app's shut-door fade (DISABLED_OPACITY 0.45), and nothing here is shut. */
  muted?: boolean
  /** A second mark hanging under this one, in the same corner — the deposit
   *  under the balance. It is OUT OF FLOW (`top:'100%'`), which is the whole
   *  point: the slot centres the mark's box on the glyph's top edge, so anything
   *  taking part in that box would move the mark it hangs from. Nothing here
   *  measures anything — the pair stays honest at any font scale because the
   *  lower mark is hung off the upper one's own bottom edge. */
  below?: ReactNode
}) {
  // On the WRAPPER, not on the text: the digit is laid out by the marker slot
  // and only its paint changes, so nothing about the blink can move it. The
  // gesture itself is `useCountBlink`, shared with the name chip's clock.
  const blinkStyle = useCountBlink(count)
  // The fade is on the COLOUR, never on this wrapper's opacity: the blink owns
  // that, and a second opacity would either be overwritten by it or have to be
  // multiplied into every frame of it.
  //
  // A NUMBER AND A DOT MUST LAND ON THE SAME POINT, AND ONLY ONE OF THEM IS ITS
  // OWN BOX. The slot centres whatever it is given on the glyph's top corner —
  // exact for the dot, whose disc IS its box, and half a dp off for a digit,
  // whose line box reserves 1.068 em above the baseline against 0.292 below it
  // and therefore carries its ink lower than its centre. That difference is the
  // app's one `inkOffset`, so the digit is lifted by it and the two marks
  // coincide by construction rather than nearly. A TRANSFORM and not a margin:
  // the box must stay exactly where the slot put it, or the correction moves the
  // very centring it is correcting. The blink only ever writes `opacity`, so
  // this survives underneath it.
  //
  // The digits are handed over as the LABEL, which is what tells `inkOffset` the
  // line is a Latin-height one: a mark of bare digits reaches CAP height, and
  // left to guess from the app's direction it would measure a Hebrew letter body
  // (0.600 em against 0.714) and lift the digit by two and a half times what it
  // owes — worse than not correcting at all.
  const mark = count != null ? (
    <Animated.View style={[styles.countTile, muted && styles.countTileMuted, { transform: [{ translateY: -inkOffset(TEXT.sm, FONT_SCALE, String(count)) }] }, blinkStyle]}>
      <Text style={[styles.count, muted && styles.countMuted]}>{count}</Text>
    </Animated.View>
  ) : badge ? <NotifyDot style={styles.markerDot} /> : null
  if (!below) return mark
  return (
    <View style={styles.markStack}>
      {mark}
      <View style={styles.markBelow}>{below}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  // What the band IS, over and above being a strip of options: the page's own
  // colour, a lift instead of a top rule, and the content held clear of the
  // screen's edges. No radius and no border — its top edge is a straight line.
  strip: {
    backgroundColor: PAGE,
    paddingTop: MD,
    // The band still runs edge to edge — this insets its CONTENT, and it is the
    // outer markers' lane: a marker stands past its glyph on the side facing the
    // screen edge, and while these were TILES the last key's came out a hair off
    // the screen (Hebrew at a large font scale, 2026-07-30). Bare numbers need
    // far less of it than a chip did, but the air reads well on its own and the
    // widest count still has somewhere to go.
    paddingHorizontal: MD,
    boxShadow: DOCK_SHADOW,
  },
  // The dot goes through the marker slot like the number does, so it is IN the
  // flow of the slot's inner box — its own component pins it absolutely (it is a
  // badge on a round button everywhere else) and here that would collapse the box
  // that places it. This is the only line of the dot's placement that lives
  // outside OptionStrip, which states the rest once, for both marks.
  markerDot: { position: 'relative' },
  // THE NUMBER STANDS ON THE APP'S WHITE TILE (user directive 2026-08-02): the
  // same white ground every other small tile in the app stands on, so a count
  // beside a glyph reads as an object lifted off the page rather than as two
  // digits floating on it — which is what it was against the strip's own PAGE
  // tint. The lift is `MARK_SHADOW`, not the tiles' `LIFT_SHADOW`: a drop meant
  // for a button under a single digit reads as the digit coming loose, and this
  // one is symmetric because a disc beside a glyph has no side to rest on.
  // WITH NO PADDING: the digit's own line box is the tile, so the mark
  // stays exactly the size the slot placed it at and the tile can never push a
  // count out past the strip's marker lane. The lift lives on the wrapper and
  // not on the text, because a shadow belongs to the box.
  // AND IT IS A CIRCLE (user directive 2026-08-02) — the shape every other small
  // white mark in the app takes when it stands alone beside a glyph (the notify
  // dot, a round button): a mark annotating a key is a disc, not a card. It is
  // stated as `aspectRatio: 1` and NOT as a fixed diameter, because the tile
  // still carries no padding: the digit's own line box sizes one axis and Yoga
  // matches the other, so the disc is exactly as big as the number it holds at
  // every font scale, and a two-digit count grows the circle instead of
  // overflowing it. The ink is centred in it by plain flexbox — a mark in a tile
  // is centred in the TILE, never on a line of text.
  countTile: {
    backgroundColor: PHOTO_CHROME,
    aspectRatio: 1,
    borderRadius: PILL_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: MARK_SHADOW,
  },
  // The quantity itself: ink and nothing else, at the caption's size and weight
  // so the key's two pieces of text are one family, in the glyph's own purple.
  count: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: INK,
  },
  // The deposit's own step back. ONLY the colour changes — same size, same
  // weight, same slot — so the pair reads as one wallet at two strengths rather
  // than as two different kinds of mark.
  countMuted: { color: INK_SUBTLE },
  // THE DEPOSIT'S DISC IS THE PAGE'S OWN GROUND (user directive 2026-08-02): the
  // balance is money to spend and stands on white, the deposit is money already
  // committed and stands on the tint the strip itself is painted in, so the pair
  // is one wallet at two strengths in its GROUND as well as in its ink. Only the
  // colour changes — the same disc, the same lift, the same slot.
  countTileMuted: { backgroundColor: PAGE },
  // The column of two: the upper mark is the box the slot places, and the lower
  // one is hung off its bottom edge and out of its flow, so the pair reads down
  // one line without the balance moving because a deposit appeared. Centred on
  // the mark above it, whichever of them is the wider number.
  markStack: { alignItems: 'center' },
  markBelow: { position: 'absolute', top: '100%', marginTop: XS },
})
