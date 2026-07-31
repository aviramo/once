import { G, Path } from 'react-native-svg'
import { INK, INK_MUTED } from '../colors'
import {
  ART_TILT, ArtCanvas, Heart, ProfileCardArt, Spark,
  artFrame, artMarks, artSize, cardMarks,
} from './ArtKit'
import { HOME_ART } from '../tokens'

// ── HomeArt — the illustration under home's centre button ──────────────────
//
// The Play store feature graphic's drawing (authored in
// `mobile/scripts/build-feature-graphic.mjs`, written to
// `store/play-feature-graphic.svg`): the brand "1", three hearts drifting
// toward the one profile card, a few quiet sparks for air. Redrawn here as
// react-native-svg rather than shipped as a PNG so it stays crisp at any size
// and takes its colours from `colors.ts` — no component may carry a hex of its
// own. The store graphic itself is untouched; the differences below are this
// screen's, and the two are free to diverge.
//
// The card, the heart, the frame and the lean are the app's, not this file's:
// they live in `ArtKit.tsx` so the Circles drawing is the same hand. What is
// left here is WHERE this composition stands.
//
// Four differences from the store canvas, all so it reads as page texture
// rather than a banner someone pasted in (user directives, 2026-07-28):
//   • NO background rect. The page tint IS the background.
//   • NO pulse rings, and no countdown ring around the mark. On the 1024×500
//     store canvas the outer rings ran off the edges, which read as cropped —
//     and a ring cannot lean, which the next point needs.
//   • THE "1" LEANS, and the card leans the opposite way (MARK_TILT /
//     CARD_TILT, one magnitude, mirrored) — the two lean into each other
//     instead of a straight mark standing beside a tilted card.
//   • NOT the store canvas, and the sparks moved inside the new one. See FRAME.
// It draws at HOME_ART.opacity, faint enough to give the screen a playful
// ground without becoming a second thing to look at.

// ── Frame ──────────────────────────────────────────────────────────────────
// Every coordinate below is the store canvas's own (1024×500), so the numbers
// stay the numbers the generator writes — but the viewBox is NOT that canvas.
// On the banner the composition sits left of centre with a wide right margin;
// nobody notices on a 1024-wide strip, but centred under home's button the ink
// read as shoved to one side. So the frame is built from the rule instead
// (user directive 2026-07-28): THE "1" AND THE CARD STAND THE SAME DISTANCE
// FROM THE OPPOSITE EDGES. It is the two objects' own bounds, tilt included,
// grown by ONE margin on all four sides. The sparks are then placed INSIDE
// that box — a stray dot reaching past either object spends the balance the
// rule just bought, which is exactly what the store layout's far-left and
// far-right dots were doing.
//
// This composition IS the one every other drawing is cut to (ART_ASPECT), so
// `artFrame` grows it by nothing.
const CARD_AT = { x: 810, y: 250 }
const MARK_BOUNDS = { left: 286.6, top: 110.5, right: 436.9, bottom: 385 }
const FRAME_PAD = 56
const FRAME = artFrame(
  artMarks(MARK_BOUNDS, cardMarks(CARD_AT.x, CARD_AT.y, 1, ART_TILT)),
  FRAME_PAD,
)

// Portrait-locked app (app.json), so the drawing's pixel size is settled once
// at module load. home.tsx reads the same const for both the element it
// renders and the pull-tutorial geometry that has to know how tall the centre
// column is — one source, no chance of the two drifting apart.
export const HOME_ART_SIZE = artSize(HOME_ART.widthRatio)

// The lean: the "1" keeps the angle the store card was drawn at and the card
// takes the mirror of it (see ART_TILT). The store banner's countdown ring
// around the mark went with this — a ring can't lean, and the mark stands on
// its own.
const MARK_TILT = -ART_TILT

// Hero "1" centre. The glyph itself is drawn from a 1024 icon canvas centred
// on (512,512), hence the translate/scale/translate sandwich.
const HERO = { x: 360, y: 250, s: 0.5 }
// The mark: two round-capped strokes (flag + stem) — the launcher icon's own
// GLYPH/STROKE, mirrored from scripts/build-icons.mjs.
const GLYPH = 'M577 312 L447 412 M577 312 L577 712'
const GLYPH_STROKE = 150

export function HomeArt() {
  return (
    <ArtCanvas frame={FRAME} size={HOME_ART_SIZE} opacity={HOME_ART.opacity}>
      {/* The "1", leaning against the card */}
      <G transform={`rotate(${MARK_TILT} ${HERO.x} ${HERO.y})`}>
        <G
          transform={`translate(${HERO.x},${HERO.y}) scale(${HERO.s}) translate(-512,-512)`}
          fill="none"
          stroke={INK}
          strokeWidth={GLYPH_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d={GLYPH} />
        </G>
      </G>

      {/* Hearts drifting from the mark toward the card */}
      <Heart x={556} y={322} s={1.5} />
      <Heart x={628} y={210} s={2.0} />
      <Heart x={674} y={330} s={1.2} fill={INK_MUTED} />

      {/* The one card */}
      <ProfileCardArt id="homeArtCard" x={CARD_AT.x} y={CARD_AT.y} tilt={ART_TILT} />

      {/* Quiet marks for air. Scattered over the empty corners and the band
          between the mark and the card, and every one of them INSIDE the
          frame's marks box (see FRAME) — none reaches past the "1" on the left
          or the card on the right, so the equal margins survive. */}
      <Spark x={300} y={72} r={10} />
      <Spark x={258} y={396} r={7} fill={INK_MUTED} />
      <Spark x={472} y={118} r={7} />
      <Spark x={508} y={392} r={6} fill={INK_MUTED} />
      <Spark x={648} y={440} r={7} />
      <Spark x={946} y={66} r={8} />
    </ArtCanvas>
  )
}
