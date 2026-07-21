import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Once brand mark: concentric gold rings on a
// bordeaux ground, with the digit "1" in the centre. Everything below — every
// mobile icon, the web favicon(s), og-image, and the on-page once-mark.svg —
// is derived from the tokens in this file. Change a token here and every
// asset regenerates in lockstep. Run: `node scripts/build-icons.mjs`.
//
//   • GLYPH  — the canonical rounded "1" path (1024 viewBox). Same geometry the
//              wordmark has always used; do not redraw it, only retune tokens.
//   • RINGS  — [radius, strokeWidth] pairs in the same 1024 space, centred at
//              (512,512). Outer ring r=500 fills the tile; per-target `scale`
//              shrinks the whole mark for launcher safe-zones.
//   • Colours: BORDEAUX ground + GOLD rings/glyph (flat, no gradient).
// ─────────────────────────────────────────────────────────────────────────

const BORDEAUX = '#4A1020' // brand PRIMARY
const GOLD = '#E6BE5E' // brand GOLD_BRIGHT (flat)
const WHITE = '#FFFFFF'

// Rounded "1" glyph, 1024 viewBox (leftmost ~330, rightmost ~690, y 190..835).
const GLYPH =
  'M 610 190 Q 690 190 690 270 L 690 760 Q 690 835 615 835 L 570 835 ' +
  'Q 495 835 495 760 L 495 390 L 430 440 Q 375 480 330 430 ' +
  'Q 285 380 340 335 L 505 210 Q 550 190 610 190 Z'

// Concentric rings (radius, stroke-width) in 1024 space. Outer band, a heavy
// primary ring, then inner grooves down to the clear centre that holds the 1.
const RINGS = [
  [500, 5],
  [480, 8],
  [458, 5],
  [432, 14],
  [392, 36], // primary ring
  [348, 6],
  [326, 5],
  [302, 10],
  [278, 5],
]

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const assets = path.join(root, 'assets')
const web = path.join(root, '..', 'web', 'public')

// ── Measure the glyph's tight bounding box once, so we can scale + centre it
//    exactly inside the rings (independent of the path's own coordinates). ──
const probe = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="${GLYPH}" fill="#fff"/></svg>`
const { info } = await sharp(Buffer.from(probe))
  .trim({ threshold: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true })
const bboxLeft = Math.abs(info.trimOffsetLeft ?? 0)
const bboxTop = Math.abs(info.trimOffsetTop ?? 0)
const GLYPH_CX = bboxLeft + info.width / 2
const GLYPH_CY = bboxTop + info.height / 2
const GLYPH_H = info.height

// Glyph height as a fraction of the 1024 canvas is tied to the ring `scale` so
// the numeral keeps the same proportion inside the rings at every size.
const GLYPH_FRAC = (scale) => 0.4 * scale

/**
 * Build the full logo as an SVG string.
 * @param scale     ring scale (1 = outer ring touches the tile edge)
 * @param bg        background fill, or null for transparent
 * @param rings     draw the rings (false = glyph only, e.g. notification)
 * @param glyphFill glyph colour
 * @param glyphFrac glyph height / canvas (defaults to GLYPH_FRAC(scale))
 */
function logoSvg({ scale = 1, bg = null, rings = true, glyphFill = GOLD, glyphFrac } = {}) {
  const parts = []
  if (bg) parts.push(`<rect width="1024" height="1024" fill="${bg}"/>`)
  if (rings) {
    for (const [r, w] of RINGS) {
      parts.push(
        `<circle cx="512" cy="512" r="${(r * scale).toFixed(2)}" fill="none" stroke="${GOLD}" stroke-width="${(w * scale).toFixed(2)}"/>`,
      )
    }
  }
  const gH = (glyphFrac ?? GLYPH_FRAC(scale)) * 1024
  const g = gH / GLYPH_H
  parts.push(
    `<g transform="translate(512,512) scale(${g.toFixed(4)}) translate(${(-GLYPH_CX).toFixed(2)},${(-GLYPH_CY).toFixed(2)})"><path d="${GLYPH}" fill="${glyphFill}"/></g>`,
  )
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

const svgBuf = (opts) => Buffer.from(logoSvg(opts))

async function writePng(opts, size, file) {
  await sharp(svgBuf(opts)).resize(size, size).png().toFile(file)
}

// ── Mobile assets ────────────────────────────────────────────────────────
// App icon + web-tab share the full colour mark on a bordeaux tile.
await writePng({ scale: 0.9, bg: BORDEAUX }, 1024, path.join(assets, 'icon.png'))
await writePng({ scale: 0.9, bg: BORDEAUX }, 512, path.join(assets, 'once-512.png'))
// Splash: bordeaux tile, a touch more breathing room (app.json splash bg = bordeaux).
await writePng({ scale: 0.82, bg: BORDEAUX }, 1024, path.join(assets, 'splash-icon.png'))
// Android adaptive foreground: transparent, shrunk into the launcher safe zone
// (app.json adaptiveIcon.backgroundColor = bordeaux fills the margin).
await writePng({ scale: 0.62, bg: null }, 1024, path.join(assets, 'adaptive-icon.png'))
// Android notification small icon: WHITE glyph on transparent, no rings (the
// status bar renders the alpha channel only and thin rings would vanish).
await writePng(
  { rings: false, glyphFill: WHITE, bg: null, glyphFrac: 0.6 },
  1024,
  path.join(assets, 'notification-icon.png'),
)

// ── Web assets ─────────────────────────────────────────────────────────────
await writePng({ scale: 0.9, bg: BORDEAUX }, 256, path.join(web, 'favicon.png'))

// og-image: the mark centred on a 1200×630 bordeaux card.
const ogLogo = await sharp(svgBuf({ scale: 0.9, bg: BORDEAUX })).resize(600, 600).png().toBuffer()
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: BORDEAUX },
})
  .composite([{ input: ogLogo, gravity: 'center' }])
  .png()
  .toFile(path.join(web, 'og-image.png'))

// Vector brand mark + SVG favicon (both the full colour logo).
const markSvg = logoSvg({ scale: 0.9, bg: BORDEAUX })
fs.writeFileSync(path.join(web, 'once-mark.svg'), markSvg + '\n')
fs.writeFileSync(path.join(web, 'favicon.svg'), markSvg + '\n')

console.log(
  'icons built → mobile: icon, once-512, splash-icon, adaptive-icon, notification-icon | web: favicon.png/.svg, og-image.png, once-mark.svg',
)
