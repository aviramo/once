import { Dimensions } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg'
import { INK, INK_MUTED, INK_PALE, WHITE, WHITE_MID } from '../colors'

// ── ArtKit — the app's ONE drawing vocabulary ──────────────────────────────
//
// The illustrations (HomeArt, CirclesArt, ChatArt) are drawn from the same small
// set of objects — the frame, the profile card, the round photo, the heart, the
// message — so that any two of them read as one hand, not two. Anything
// a second drawing would otherwise re-type belongs here; a composition file
// then holds nothing but WHERE its pieces stand.
//
// Everything is react-native-svg rather than a shipped PNG: it stays crisp at
// any size and takes its colours from `colors.ts`, so no drawing carries a hex
// of its own.

// ── The frame ──────────────────────────────────────────────────────────────
/** THE shape every drawing is cut to. It is the store graphic's own frame — the
 *  "1" and the card grown by one margin (see HomeArt) — stated here as a ratio
 *  because a caller sizes ANY of these drawings by width alone, and two of them
 *  in a column must be the same shape or the pair reads as a mistake. */
export const ART_ASPECT = 750.3 / 445.9

/** The lean. ONE magnitude for the whole set, mirrored by whoever needs the
 *  opposite sign, so two objects lean INTO each other rather than drifting in
 *  parallel (user directive 2026-07-28). */
export const ART_TILT = 4

export type ArtMarks = { left: number; top: number; right: number; bottom: number }

/** The union of what a composition put on the page: its bounds, tilt and
 *  borders included. A composition states its frame from the pieces it placed
 *  rather than from numbers typed a second time. */
export const artMarks = (...boxes: ArtMarks[]): ArtMarks => ({
  left: Math.min(...boxes.map(b => b.left)),
  top: Math.min(...boxes.map(b => b.top)),
  right: Math.max(...boxes.map(b => b.right)),
  bottom: Math.max(...boxes.map(b => b.bottom)),
})

export const discMarks = (x: number, y: number, r: number): ArtMarks =>
  ({ left: x - r, top: y - r, right: x + r, bottom: y + r })

export const boxMarks = (x: number, y: number, w: number, h: number): ArtMarks =>
  ({ left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 })

/** The box an object of this size occupies once it LEANS — its own width and
 *  height projected through the tilt, so a frame built from it counts the
 *  corners the lean pushed out. */
const leanMarks = (x: number, y: number, w: number, h: number, tilt: number): ArtMarks => {
  const c = Math.abs(Math.cos((tilt * Math.PI) / 180))
  const s = Math.abs(Math.sin((tilt * Math.PI) / 180))
  return boxMarks(x, y, w * c + h * s, w * s + h * c)
}

/** A point on the way from one object to another: a trail is stated as
 *  fractions of the run between the two things it connects, so moving either
 *  end carries its own drift with it. */
export const at = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** The viewBox for a drawing: its own ink grown by ONE margin on all four
 *  sides, then grown again on the SHORT axis alone until the box is
 *  ART_ASPECT. So the ink keeps equal margins whatever it is, and every drawing
 *  comes out the same shape. A composition already drawn to that ratio (the
 *  store graphic, i.e. HomeArt) grows by nothing. */
export function artFrame(marks: ArtMarks, pad: number) {
  let x = marks.left - pad
  let y = marks.top - pad
  let w = marks.right - marks.left + pad * 2
  let h = marks.bottom - marks.top + pad * 2
  if (w / h < ART_ASPECT) {
    const grow = h * ART_ASPECT - w
    x -= grow / 2
    w += grow
  } else {
    const grow = w / ART_ASPECT - h
    y -= grow / 2
    h += grow
  }
  return { x, y, w, h, viewBox: `${x} ${y} ${w} ${h}` }
}

// Portrait-locked app (app.json), so a drawing's pixel size is settled once at
// module load — a caller can read it as a plain number for any geometry that
// has to know how tall the drawing is.
const screenW = Dimensions.get('window').width

/** The pixel box a drawing renders in: a share of the screen's width, the
 *  height following from the one ratio. */
export const artSize = (widthRatio: number) => {
  const width = Math.round(screenW * widthRatio)
  return { width, height: Math.round(width / ART_ASPECT) } as const
}

/** The `<Svg>` every drawing sits in. `opacity` is what says whether the
 *  drawing is page TEXTURE (home, faint) or something the page is actually
 *  saying (the Circles pages, full strength). */
export function ArtCanvas({ frame, size, opacity = 1, children }: {
  frame: { viewBox: string }
  size: { width: number; height: number }
  opacity?: number
  children: React.ReactNode
}) {
  return (
    <Svg
      pointerEvents="none"
      width={size.width}
      height={size.height}
      viewBox={frame.viewBox}
      opacity={opacity}
    >
      {children}
    </Svg>
  )
}

// ── The heart ──────────────────────────────────────────────────────────────
// The classic filled heart, drawn in its own 24×24 box and placed by centre.
const HEART = 'M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
/** Half the width a heart of this scale takes, for a composition keeping its
 *  drift clear of the card it is drifting toward. */
export const heartR = (s: number) => 12 * s

export const Heart = ({ x, y, s, fill = INK }: { x: number; y: number; s: number; fill?: string }) => (
  <Path transform={`translate(${x},${y}) scale(${s}) translate(-12,-12)`} fill={fill} d={HEART} />
)

// ── A quiet mark ───────────────────────────────────────────────────────────
/** Air. Scattered over the empty corners so the drawing reads as a page and not
 *  as a diagram — and always INSIDE the marks box, so it never spends the equal
 *  margins the frame just bought. */
export const Spark = ({ x, y, r, fill = INK }: { x: number; y: number; r: number; fill?: string }) => (
  <Circle cx={x} cy={y} r={r} fill={fill} />
)

// (The run of faces that filled the end of the hub's FRIENDS row lived here
// from 2026-07-31 to 2026-08-02. That lane is the INVITE BUTTON again — see
// CommunitiesPage's friends strip — so the drawing is deleted rather than left
// exported with nowhere to stand.)

// ── The pointer ────────────────────────────────────────────────────────────
// An arrow, and nothing but an arrow: it points at the one button under it on a
// page that has nothing else to do (user directive 2026-07-30). Drawn in the
// same hand as everything above — a TRAIL of dots, the drawing's own way of
// saying "from here to there", ending in a solid ink head, exactly as a trail
// of muted dots ends in a solid heart on the card it drifts toward. Sized in dp
// rather than through `artFrame`: it is a mark on a page, not a picture.
const ARROW = { w: 44, h: 62, stroke: 6 }

export function ArrowDownArt() {
  return (
    <Svg pointerEvents="none" width={ARROW.w} height={ARROW.h} viewBox={`0 0 ${ARROW.w} ${ARROW.h}`}>
      {/* The trail. A round cap on a zero-length dash IS a dot, so the shaft is
          the same run of marks the drawing puts between two people. */}
      <Path
        d="M 22 4 C 27 16, 17 28, 22 38"
        fill="none"
        stroke={INK_MUTED}
        strokeWidth={ARROW.stroke}
        strokeLinecap="round"
        strokeDasharray="0.1 12"
      />
      {/* Where it lands */}
      <Path
        d="M 12 42 L 22 56 L 32 42"
        fill="none"
        stroke={INK}
        strokeWidth={ARROW.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── The profile card ───────────────────────────────────────────────────────
// The one card a moment brings (never a deck): a pale photo wash with a purple
// silhouette, three lines, and the purple heart on it. Drawn once at its
// canonical size and placed by CENTRE, so a composition moves/scales/leans it
// without a single one of these numbers moving.
const CARD = { x: 712, y: 96, w: 196, h: 308, r: 26 }
const CARD_BORDER = 6
const CARD_CX = CARD.x + CARD.w / 2
const CARD_CY = CARD.y + CARD.h / 2
const PHOTO = { x: CARD.x + 16, y: CARD.y + 16, w: CARD.w - 32, h: 150, r: 18 }
const HEAD = { x: CARD_CX, y: PHOTO.y + 66, r: 30 }
const BADGE = { x: CARD.x + CARD.w - 6, y: CARD.y + CARD.h - 46, r: 32 }
const LINE_X = CARD.x + 22
const LINE_H = 12

/** What the card occupies once its pale border and its lean are counted. */
export const cardMarks = (x: number, y: number, scale = 1, tilt = 0): ArtMarks =>
  leanMarks(x, y, (CARD.w + CARD_BORDER * 2) * scale, (CARD.h + CARD_BORDER * 2) * scale, tilt)

export function ProfileCardArt({ x = CARD_CX, y = CARD_CY, scale = 1, tilt = 0, id }: {
  x?: number
  y?: number
  scale?: number
  tilt?: number
  /** Unique per instance: it names this card's photo clip. */
  id: string
}) {
  const clip = `${id}Photo`
  return (
    <G transform={`translate(${x},${y}) scale(${scale}) rotate(${tilt}) translate(${-CARD_CX},${-CARD_CY})`}>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.w} height={PHOTO.h} rx={PHOTO.r} />
        </ClipPath>
      </Defs>
      <Rect
        x={CARD.x - CARD_BORDER}
        y={CARD.y - CARD_BORDER}
        width={CARD.w + CARD_BORDER * 2}
        height={CARD.h + CARD_BORDER * 2}
        rx={CARD.r + CARD_BORDER}
        fill={INK_PALE}
      />
      <Rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} fill={WHITE} />
      <Rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.w} height={PHOTO.h} rx={PHOTO.r} fill={INK_PALE} />
      <G clipPath={`url(#${clip})`}>
        <Circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r} fill={INK} />
        <Path d={`M ${HEAD.x - 58} ${PHOTO.y + PHOTO.h + 4} a 58,52 0 0 1 116,0 z`} fill={INK} />
      </G>
      <Rect x={LINE_X} y={CARD.y + 186} width={104} height={LINE_H} rx={LINE_H / 2} fill={INK} />
      <Rect x={LINE_X} y={CARD.y + 212} width={140} height={LINE_H} rx={LINE_H / 2} fill={INK_MUTED} />
      <Rect x={LINE_X} y={CARD.y + 234} width={92} height={LINE_H} rx={LINE_H / 2} fill={INK_PALE} />
      <Circle cx={BADGE.x} cy={BADGE.y} r={BADGE.r} fill={INK} />
      <Heart x={BADGE.x} y={BADGE.y} s={1.4} fill={WHITE} />
    </G>
  )
}

// ── A person ───────────────────────────────────────────────────────────────
// The card's own stack, made round: the pale border, the white body, the pale
// photo, the ink silhouette. It is what a person is on these pages when the
// drawing does not have the room (or the reason) to show a whole card.
const AVATAR_RIM = 0.13 // the white body, as a share of the photo's radius
const AVATAR_BORDER = 0.06 // the pale border outside it, same share of the card's

/** What an avatar occupies, its border counted. */
export const avatarMarks = (x: number, y: number, r: number): ArtMarks =>
  discMarks(x, y, r * (1 + AVATAR_RIM + AVATAR_BORDER))

export function AvatarArt({ x, y, r, id }: { x: number; y: number; r: number; id: string }) {
  const clip = `${id}Photo`
  return (
    <G>
      <Defs>
        <ClipPath id={clip}>
          <Circle cx={x} cy={y} r={r} />
        </ClipPath>
      </Defs>
      <Circle cx={x} cy={y} r={r * (1 + AVATAR_RIM + AVATAR_BORDER)} fill={INK_PALE} />
      <Circle cx={x} cy={y} r={r * (1 + AVATAR_RIM)} fill={WHITE} />
      <Circle cx={x} cy={y} r={r} fill={INK_PALE} />
      <G clipPath={`url(#${clip})`}>
        <Circle cx={x} cy={y - 0.22 * r} r={0.36 * r} fill={INK} />
        {/* The shoulders: a half-ellipse whose base sits BELOW the photo, so the
            disc itself is what cuts them off — the same construction the card's
            silhouette uses inside its rectangle. */}
        <Path
          d={`M ${x - 0.9 * r} ${y + 1.05 * r} a ${0.9 * r},${0.83 * r} 0 0 1 ${1.8 * r},0 z`}
          fill={INK}
        />
      </G>
    </G>
  )
}

// ── A message ──────────────────────────────────────────────────────────────
// What one person SAYS to another, drawn as the app's own outgoing bubble: the
// solid INK fill and the white lines inside it are `bubbleMine` /
// `bubbleTextMine` from chat.tsx, so the thing in the picture is the thing the
// user is about to send. Two lines rather than the card's three — a first
// message is short — and the second is the fainter white, the same way the
// card's own lines step down.
//
// The one squared corner is the bubble's ANCHOR: the side its sender sits on,
// exactly as a last-in-group bubble squares the corner nearest its own edge of
// the chat. It is at the bottom-LEFT of the drawing's own box because a
// composition stands the sender to the left of it and the message travels away
// to the right. That is geometry inside a picture, not a reading direction, so
// it does not mirror — no composition here does.
//
// Drawn once at its canonical size and placed by CENTRE, like the card above.
const BUBBLE = { w: 268, h: 152, r: 40, tail: 13 }
const BUBBLE_PAD = 34
const BUBBLE_LINE = { h: 14, lead: 24, long: 176, short: 118 }

/** What a message occupies once its lean is counted. */
export const messageMarks = (x: number, y: number, scale = 1, tilt = 0): ArtMarks =>
  leanMarks(x, y, BUBBLE.w * scale, BUBBLE.h * scale, tilt)

export function MessageArt({ x, y, scale = 1, tilt = 0 }: {
  x: number
  y: number
  scale?: number
  tilt?: number
}) {
  const { w, h, r, tail } = BUBBLE
  const lineTop = (h - (BUBBLE_LINE.h * 2 + BUBBLE_LINE.lead)) / 2
  return (
    <G transform={`translate(${x},${y}) scale(${scale}) rotate(${tilt}) translate(${-w / 2},${-h / 2})`}>
      <Path
        d={`M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}`
          + ` H ${tail} A ${tail} ${tail} 0 0 1 0 ${h - tail} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`}
        fill={INK}
      />
      <Rect
        x={BUBBLE_PAD}
        y={lineTop}
        width={BUBBLE_LINE.long}
        height={BUBBLE_LINE.h}
        rx={BUBBLE_LINE.h / 2}
        fill={WHITE}
      />
      <Rect
        x={BUBBLE_PAD}
        y={lineTop + BUBBLE_LINE.h + BUBBLE_LINE.lead}
        width={BUBBLE_LINE.short}
        height={BUBBLE_LINE.h}
        rx={BUBBLE_LINE.h / 2}
        fill={WHITE_MID}
      />
    </G>
  )
}
