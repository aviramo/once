import { Circle } from 'react-native-svg'
import { INK, INK_MUTED } from '../colors'
import {
  ART_TILT, ArtCanvas, AvatarArt, Heart, ProfileCardArt, Spark,
  artFrame, artMarks, artSize, avatarMarks, cardMarks, discMarks,
} from './ArtKit'
import { CIRCLES_ART } from '../tokens'

// ── CirclesArt — one drawing for the whole idea ────────────────────────────
//
// What Circles IS, in one picture: the person on the left is YOU, and there are
// two ways the card on the right is already near you — through a FRIEND (up and
// across) or through a CIRCLE you are both in (down and across). Both routes
// end at the same card, and the hearts arrive on it from both.
//
// One image and not two (user directive 2026-07-30): friends and groups are not
// two features standing side by side, they are the same answer to "how are we
// already connected", which is exactly what the shared-circle chip on a profile
// says. Two drawings would have argued the opposite.
//
// Same hand as home's drawing, by construction: the card, the heart, the lean,
// the round photo and the frame all come from `ArtKit`, so the only thing this
// file decides is where its pieces stand. Unlike home's, it is drawn at full
// strength — home's is page TEXTURE under the one big action, this one is what
// the page is saying.

// ── Who stands where ───────────────────────────────────────────────────────
// YOU, on the left: everything on the page is reached FROM here.
const ME = { x: 80, y: 320, r: 68 }
// The friend who is the bridge — high, so the route through them arcs over.
const FRIEND = { x: 420, y: 128, r: 58 }
// The circle you are both in: a dotted ring (home's own mark for "a circle")
// holding the three people who are in it with you.
const RING = { x: 410, y: 470, r: 135 }
const RING_STROKE = 6
const RING_MEMBERS = [
  { x: 365, y: 425, r: 40 },
  { x: 470, y: 450, r: 34 },
  { x: 405, y: 530, r: 36 },
]
// The one person the two routes lead to.
const THEM = { x: 845, y: 320 }

const FRAME_PAD = 56
const FRAME = artFrame(
  artMarks(
    avatarMarks(ME.x, ME.y, ME.r),
    avatarMarks(FRIEND.x, FRIEND.y, FRIEND.r),
    discMarks(RING.x, RING.y, RING.r + RING_STROKE / 2),
    cardMarks(THEM.x, THEM.y, 1, ART_TILT),
  ),
  FRAME_PAD,
)
const SIZE = artSize(CIRCLES_ART.widthRatio)

/** A point on the way from one object to another: the trails are stated as
 *  fractions of the run between the two things they connect, so moving either
 *  end carries its own drift with it. */
const at = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export function CirclesArt() {
  return (
    <ArtCanvas frame={FRAME} size={SIZE}>
      {/* The circle, under everything that stands in it */}
      <Circle
        cx={RING.x}
        cy={RING.y}
        r={RING.r}
        fill="none"
        stroke={INK}
        strokeWidth={RING_STROKE}
        strokeDasharray="7 18"
        strokeLinecap="round"
      />
      {RING_MEMBERS.map((m, i) => (
        <AvatarArt key={i} id={`circlesArtMember${i}`} x={m.x} y={m.y} r={m.r} />
      ))}

      {/* Route one: through a friend. Plain marks on the way there — what is
          between the two of you is an acquaintance, not a romance. */}
      <Spark {...at(ME, FRIEND, 0.28)} r={8} fill={INK_MUTED} />
      <Spark {...at(ME, FRIEND, 0.44)} r={10} />
      <Spark {...at(ME, FRIEND, 0.6)} r={8} fill={INK_MUTED} />

      {/* Route two: through the circle. */}
      <Spark {...at(ME, RING, 0.33)} r={8} fill={INK_MUTED} />
      <Spark {...at(ME, RING, 0.5)} r={10} />

      {/* Both routes carry HEARTS on their last leg, growing as they near the
          card — the same drift home's drawing makes from the "1" to the card. */}
      <Spark {...at(FRIEND, THEM, 0.24)} r={7} fill={INK_MUTED} />
      <Heart {...at(FRIEND, THEM, 0.41)} s={1.5} fill={INK_MUTED} />
      <Heart {...at(FRIEND, THEM, 0.58)} s={2} />
      <Spark {...at(RING, THEM, 0.36)} r={7} fill={INK_MUTED} />
      <Heart {...at(RING, THEM, 0.52)} s={1.5} fill={INK_MUTED} />
      <Heart {...at(RING, THEM, 0.68)} s={2} />

      {/* You, and the one you are led to */}
      <AvatarArt id="circlesArtMe" x={ME.x} y={ME.y} r={ME.r} />
      <AvatarArt id="circlesArtFriend" x={FRIEND.x} y={FRIEND.y} r={FRIEND.r} />
      <ProfileCardArt id="circlesArtCard" x={THEM.x} y={THEM.y} tilt={ART_TILT} />

      {/* Air, every mark of it INSIDE the marks box above (see artFrame) */}
      <Spark x={120} y={120} r={9} />
      <Spark x={60} y={505} r={6} fill={INK_MUTED} />
      <Spark x={250} y={560} r={7} fill={INK_MUTED} />
      <Spark x={620} y={545} r={7} fill={INK_MUTED} />
      <Spark x={930} y={110} r={8} />
    </ArtCanvas>
  )
}
