import { Dimensions } from 'react-native'
import Svg, { G, Path, Rect, Circle, ClipPath, Defs } from 'react-native-svg'
import { INK, INK_MUTED, INK_PALE, WHITE } from '../colors'
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
// Four of them, all so it reads as page texture rather than a banner someone
// pasted in (user directives, 2026-07-28):
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
//   the "1"  x 286.6…436.9,  y 110.5…385.0
//   the card x 695.0…924.9,  y  83.1…417.0  (the taller of the two)
const MARKS = { left: 286.6, top: 83.1, right: 924.9, bottom: 417 }
const FRAME_PAD = 56
const FRAME = {
  x: MARKS.left - FRAME_PAD,
  y: MARKS.top - FRAME_PAD,
  w: MARKS.right - MARKS.left + FRAME_PAD * 2,
  h: MARKS.bottom - MARKS.top + FRAME_PAD * 2,
}

// Portrait-locked app (app.json), so the drawing's pixel size is settled once
// at module load. home.tsx reads the same const for both the element it
// renders and the pull-tutorial geometry that has to know how tall the centre
// column is — one source, no chance of the two drifting apart.
const screenW = Dimensions.get('window').width
const width = Math.round(screenW * HOME_ART.widthRatio)
export const HOME_ART_SIZE = { width, height: Math.round((width * FRAME.h) / FRAME.w) } as const

// The lean, in degrees. ONE magnitude with OPPOSITE signs (user directive
// 2026-07-28): the "1" keeps the angle the store card was drawn at and the
// card takes the mirror of it, so the two lean into each other instead of
// drifting in parallel. The store banner's countdown ring around the mark went
// with this — a ring can't lean, and the mark stands on its own.
const TILT = 4
const MARK_TILT = -TILT
const CARD_TILT = TILT

// Hero "1" centre. The glyph itself is drawn from a 1024 icon canvas centred
// on (512,512), hence the translate/scale/translate sandwich.
const HERO = { x: 360, y: 250, s: 0.5 }
// The mark: two round-capped strokes (flag + stem) — the launcher icon's own
// GLYPH/STROKE, mirrored from scripts/build-icons.mjs.
const GLYPH = 'M577 312 L447 412 M577 312 L577 712'
const GLYPH_STROKE = 150

// The classic filled heart, drawn in its own 24×24 box and placed by centre.
const HEART = 'M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
const heartAt = (x: number, y: number, s: number) => `translate(${x},${y}) scale(${s}) translate(-12,-12)`

// The one profile card the moment brings (never a deck): a pale photo wash
// with a purple silhouette, three lines, and the purple heart on it.
const CARD = { x: 712, y: 96, w: 196, h: 308, r: 26 }
const CARD_CX = CARD.x + CARD.w / 2
const PHOTO = { x: CARD.x + 16, y: CARD.y + 16, w: CARD.w - 32, h: 150, r: 18 }
const HEAD = { x: CARD_CX, y: PHOTO.y + 66, r: 30 }
const BADGE = { x: CARD.x + CARD.w - 6, y: CARD.y + CARD.h - 46, r: 32 }
const LINE_X = CARD.x + 22
const LINE_H = 12

export function HomeArt() {
  return (
    <Svg
      pointerEvents="none"
      width={HOME_ART_SIZE.width}
      height={HOME_ART_SIZE.height}
      viewBox={`${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`}
      opacity={HOME_ART.opacity}
    >
      <Defs>
        <ClipPath id="homeArtPhoto">
          <Rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.w} height={PHOTO.h} rx={PHOTO.r} />
        </ClipPath>
      </Defs>

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
      <Path transform={heartAt(556, 322, 1.5)} fill={INK} d={HEART} />
      <Path transform={heartAt(628, 210, 2.0)} fill={INK} d={HEART} />
      <Path transform={heartAt(674, 330, 1.2)} fill={INK_MUTED} d={HEART} />

      {/* The one card */}
      <G transform={`rotate(${CARD_TILT} ${CARD_CX} ${CARD.y + CARD.h / 2})`}>
        <Rect x={CARD.x - 6} y={CARD.y - 6} width={CARD.w + 12} height={CARD.h + 12} rx={CARD.r + 6} fill={INK_PALE} />
        <Rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} fill={WHITE} />
        <Rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.w} height={PHOTO.h} rx={PHOTO.r} fill={INK_PALE} />
        <G clipPath="url(#homeArtPhoto)">
          <Circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r} fill={INK} />
          <Path d={`M ${HEAD.x - 58} ${PHOTO.y + PHOTO.h + 4} a 58,52 0 0 1 116,0 z`} fill={INK} />
        </G>
        <Rect x={LINE_X} y={CARD.y + 186} width={104} height={LINE_H} rx={LINE_H / 2} fill={INK} />
        <Rect x={LINE_X} y={CARD.y + 212} width={140} height={LINE_H} rx={LINE_H / 2} fill={INK_MUTED} />
        <Rect x={LINE_X} y={CARD.y + 234} width={92} height={LINE_H} rx={LINE_H / 2} fill={INK_PALE} />
        <Circle cx={BADGE.x} cy={BADGE.y} r={BADGE.r} fill={INK} />
        <Path transform={heartAt(BADGE.x, BADGE.y, 1.4)} fill={WHITE} d={HEART} />
      </G>

      {/* Quiet marks for air. Scattered over the empty corners and the band
          between the mark and the card, and every one of them INSIDE the
          frame's marks box (see FRAME) — none reaches past the "1" on the left
          or the card on the right, so the equal margins survive. */}
      <Circle cx={300} cy={72} r={10} fill={INK} />
      <Circle cx={258} cy={396} r={7} fill={INK_MUTED} />
      <Circle cx={472} cy={118} r={7} fill={INK} />
      <Circle cx={508} cy={392} r={6} fill={INK_MUTED} />
      <Circle cx={648} cy={440} r={7} fill={INK} />
      <Circle cx={946} cy={66} r={8} fill={INK} />
    </Svg>
  )
}
