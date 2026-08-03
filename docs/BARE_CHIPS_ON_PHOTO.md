# Bare chips on the photograph — a shelved treatment (2026-08-03)

Built and then reverted the same day, at the user's request, so that the fact set
and the bio went back to white tiles. Kept here because the user may want it
again. **This is a record, not a source of truth** — like every file in `docs/`,
it must never drive a code decision on its own. If it is ever brought back,
re-derive it against the tree as it stands then.

What it looked like: no tile at all under the match card's fact set or its bio.
White text and white glyphs standing directly on the photograph, each carrying
its own shade, with no rectangle visible anywhere.

## What survived the revert (do NOT undo these)

Two things were kept in the codebase because they were fixes, not styling:

1. **`ChipStack` no longer animates its resize.** The tile hugs its widest row,
   so a fact whose text changes under the reader (a distance ticking from
   "2 minutes" to "6") changes the tile's WIDTH — and a layout animation on a
   width interpolates the box's own ORIGIN with it, so under RTL the whole set
   visibly slid right and left every time a number changed. `CHIP_RESIZE` and the
   measure-and-arm machinery around it are gone. The rule: **a start-anchored box
   that hugs its content may not be animated on the axis it hugs.**
2. The `ScreenEdgeShade` / `RISE_SHADOW` work of the same day, which is unrelated
   to the chips.

## The mechanism

The shade is a **`filter: drop-shadow(...)` on the HOST**, never `textShadow` on
each label, and never a `boxShadow`:

- a `drop-shadow` filter hugs the ALPHA of everything painted inside its host, so
  on a host with no fill it clings to the letters and the SVG glyphs alike — one
  declaration covers both, and the reader sees no rectangle.
- `textShadow` reaches only text. The glyphs would have been left bare.
- `boxShadow` is derived from the border box and is always, unavoidably, a
  blurred rectangle.

**Unverified on iOS.** It was only ever seen on the Android emulator. RN's
`filter` support landed on Android first; if `drop-shadow` does not render on
iOS, white text is left bare on a photograph — check before shipping it.

```ts
// tokens.ts — the final value after three passes of "more shadow"
export const PHOTO_INK_SHADOW =
  'drop-shadow(0px 0px 3px rgba(0,0,0,0.65)) drop-shadow(0px 0px 14px rgba(0,0,0,0.70))'
```

Two shadows, not one stronger one: widen a single one and it becomes a grey cloud
around the words (a colour this app does not have); darken it and the halo
hardens into an outline, which reads as text with a stroke. The tight one
separates a stroke of type from a highlight in the photograph; the wide one
carries the block off its background. It started at `0.55/8px` and was raised
twice.

## Chip.tsx

A `bare` prop on `ChipStack`, handed to its rows through a **context** — the same
reason `ChipStacked` is one: no call site can put a chip in a bare stack and
leave it painting purple on a photo.

```tsx
const ChipBare = createContext(false)

// ChipStack
style={[
  styles.stack,
  bare ? styles.stackBare : [{ backgroundColor: bgColor }, onPhoto && styles.chipShadow],
  style,
]}
// no rule between rows: a hairline on a photograph divides nothing
{i && !bare ? <View style={styles.stackRule} /> : null}
<ChipStacked.Provider value={rowPos(i, rows.length)}>
  <ChipBare.Provider value={bare}>{row}</ChipBare.Provider>
</ChipStacked.Provider>

// styles
stackBare: { filter: PHOTO_INK_SHADOW },
```

Inside `Chip`, three values are shadowed once each so the fact reaches every mark
on the tile without any of them having to ask:

```tsx
const { fg: toneFg, bg } = TONES[tone]
const bare = useContext(ChipBare)
const fg = bare ? WHITE : toneFg          // label, leading glyph, trailing slot, render slots
const bold = boldProp || bare             // every word emphasised — see below
const factFg = bare ? fg : fact ? TONES[fact.tone ?? tone].fg : fg
```

- **Every word is emphasised.** On a tile, weight marks the one run that matters
  (the family sentence's "and wants more"). On a photograph there is no ordinary
  run — the whole set is text with a picture behind it, and the lighter weight is
  simply the half that is harder to read. The number pills are deliberately NOT
  in it: they are their own component with their own ground and read as marks.
- **The tones stop applying with the ground.** A bare tile has one ink, so the
  answered/unanswered split on the height+smoking row cannot be said there.
- The second fact's label had to be given `bold && styles.chipTextBold`; it never
  had it.

Row spacing: the block gutter is about the distance between a tile's text and the
tile's own EDGE. With no edge it became nothing but air, and the set read as a
list rather than a block of writing.

```ts
export const CHIP_BARE_ROW_PAD = XS / 2   // both edges, same for first/middle/last
chipBareRow: { paddingVertical: CHIP_BARE_ROW_PAD },
```

And the hug was dropped in bare mode (`!bare && hug.style`, `!bare && facts.style`)
for the same reason the resize animation was: with no tile there is no edge to end
at, so capping the rows only created a box that changed width. **If the treatment
returns, this is the half to think about again** — the resize animation is gone
from the tile path now, so uncapping may no longer be necessary.

## MatchCard.tsx

```tsx
<ChipStack onPhoto bare pointerEvents={chipsHidden ? 'none' : 'auto'}>
```

The bio, which is not a `Chip`:

```ts
photoBioCard: {
  position: 'absolute',
  start: MD,
  padding: CHIP_BLOCK_PAD,      // kept: it is what makes the bio and the fact set move together
  filter: PHOTO_INK_SHADOW,
  // no backgroundColor, no borderRadius, no LIFT_SHADOW
},
photoBioText: {
  fontSize: TEXT.md,
  color: WHITE,
  fontWeight: WEIGHT.medium,    // reaches the PLACEHOLDER too — the field is styled from here
},
```

`BioField` passed two things down for the on-photo case:

```tsx
placeholderTextColor={onPhoto ? WHITE : undefined}
buttonVariant={onPhoto ? 'onPhoto' : undefined}
```

## Button.tsx

A variant for the one control inside the set — the bio editor's Update, which was
the last white tile left on a card that had stopped having any:

```ts
onPhoto: {
  btn: { backgroundColor: 'transparent' },
  text: { color: WHITE },
  disabledText: { color: WHITE_STRONG },
  pressedBtn: { backgroundColor: WHITE_SOFT },   // a fill only while HELD
},
```

No shadow of its own: the host's `PHOTO_INK_SHADOW` already covers every mark
inside it, and a button is not a special case there. It takes a fill only while
pressed, because with no ground at rest there is nothing for a press to darken,
and a word that does not answer the finger does not read as a control.

`EditableText` grew a `buttonVariant` prop to thread it through, and `Button`'s
`Variant` type was exported for it.

## Also tried and rejected in the same session

- **A slide instead of the zoom.** The set fell straight down off the card
  (200ms, `translateY`, no scale, no opacity) instead of zooming into its pinned
  corner. Reverted with the rest. Two things learned if it is ever wanted again:
  ONE distance for the whole set, or the groups move at their own speeds and the
  set reads as coming apart on the way down; and **do not measure with `onLayout`
  on an `Animated.View`** — its props are written from the UI thread and the
  later layouts (the ones where the last fact has finally wrapped and the box is
  its real height) do not come back, so the set stops short of the edge. Measure
  a plain wrapper instead.
- Opacity in that transition, which is banned in both designs and for the same
  reason twice over: neither an Android `elevation` nor a `drop-shadow` filter
  inherits an animated opacity from its parent, so a fade holds every shade at
  full strength and pops it off at the end, leaving a dark ghost behind.
