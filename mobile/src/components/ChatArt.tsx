import { INK_MUTED } from '../colors'
import {
  ART_TILT, ArtCanvas, AvatarArt, Heart, MessageArt, ProfileCardArt, Spark,
  artFrame, artMarks, artSize, at, avatarMarks, cardMarks, messageMarks,
} from './ArtKit'
import { CHAT_ART } from '../tokens'

// ── ChatArt — the drawing on a chat with nothing in it yet ─────────────────
//
// The one moment this page is waiting for: YOU, on the left, the MESSAGE
// leaving you, and the person it reaches. A chat with no messages is not an
// empty list, it is a conversation that has not been started, and the picture
// says which of the two of you starts it — the bubble is already on its way,
// and it is the app's own outgoing bubble, the very thing the composer under
// this drawing sends.
//
// Same hand as the other two by construction: the card, the heart, the round
// photo, the lean and the frame are all `ArtKit`'s, so all this file decides is
// where its pieces stand. Home's drawing is page TEXTURE under the one big
// action and is drawn faint; this one, like the Circles page's, is what the
// page is saying, so it is at full strength.
//
// It does not mirror under RTL, exactly as the other two do not: the picture's
// left-to-right is its own geometry (a sender, a message on its way, whom it
// reaches), not a line of text.

// ── Who stands where ───────────────────────────────────────────────────────
// The three of them read as one rising line, bottom-START to top-END: it is
// the direction the drawing's own story runs, and it leaves the two corners
// off that line for air.
//
// YOU, low on the left: everything in the picture leaves from here.
const ME = { x: 100, y: 482, r: 74 }
// What you said, arcing OVER the line between the two of you rather than
// sitting on it, and leaning INTO the card the way home's "1" leans into it —
// the one magnitude, mirrored from the card's own (ART_TILT). A step under its
// canonical size so the person it is going to stays the biggest thing here.
const MSG = { x: 462, y: 286, scale: 0.9 }
// The one it reaches.
const THEM = { x: 848, y: 218 }

const FRAME_PAD = 56
const FRAME = artFrame(
  artMarks(
    avatarMarks(ME.x, ME.y, ME.r),
    messageMarks(MSG.x, MSG.y, MSG.scale, -ART_TILT),
    cardMarks(THEM.x, THEM.y, 1, ART_TILT),
  ),
  FRAME_PAD,
)
const SIZE = artSize(CHAT_ART.widthRatio)

export function ChatArt() {
  return (
    <ArtCanvas frame={FRAME} size={SIZE}>
      {/* Leaving you: plain marks, the drawing's own way of saying "from here
          to there" — what is on its way is not yet anything to anybody. */}
      <Spark {...at(ME, MSG, 0.36)} r={8} fill={INK_MUTED} />
      <Spark {...at(ME, MSG, 0.55)} r={10} />

      {/* Landing on them: hearts, growing as they near the card — the same
          drift home's drawing and the Circles one both make on their last leg.
          Here it is a message that carries them. */}
      <Heart {...at(MSG, THEM, 0.45)} s={1.5} fill={INK_MUTED} />
      <Heart {...at(MSG, THEM, 0.6)} s={2} />

      {/* You, what you said, and who hears it */}
      <AvatarArt id="chatArtMe" x={ME.x} y={ME.y} r={ME.r} />
      <MessageArt x={MSG.x} y={MSG.y} scale={MSG.scale} tilt={-ART_TILT} />
      <ProfileCardArt id="chatArtCard" x={THEM.x} y={THEM.y} tilt={ART_TILT} />

      {/* Air, in the two corners the rising line leaves empty, and every mark
          of it INSIDE the marks box above (see artFrame) so none of it spends
          the equal margins the frame just bought. */}
      <Spark x={196} y={168} r={9} />
      <Spark x={96} y={296} r={6} fill={INK_MUTED} />
      <Spark x={352} y={552} r={7} fill={INK_MUTED} />
      <Spark x={654} y={462} r={7} fill={INK_MUTED} />
      <Spark x={806} y={500} r={8} />
    </ArtCanvas>
  )
}
