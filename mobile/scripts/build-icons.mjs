import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// Single source of truth for the "1" glyph: the canonical brand mark in
// web/public/once-mark.svg. We pull only its <path> (dropping the black bg
// rect) so we can re-pad it per target. The glyph itself is never redefined
// here — change the path in once-mark.svg and every asset follows.
const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const assets = path.join(root, 'assets')
const markSvg = fs.readFileSync(path.join(root, '..', 'web', 'public', 'once-mark.svg'), 'utf8')

const pathEl = markSvg.match(/<path[\s\S]*?\/>/)?.[0]
if (!pathEl) throw new Error('Could not extract <path> from web/public/once-mark.svg')

// Glyph-only SVG (transparent, same 1024 viewBox as the source so geometry is
// byte-identical to the brand mark).
const glyphSvg = Buffer.from(
  `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${pathEl}</svg>`,
)

const SIZE = 1024
const BLACK = '#000000'

// --- Padding tokens (single source of truth for icon breathing room) ---
// Value = the glyph's height as a fraction of the full SIZE canvas.
// iOS / splash: no launcher mask, only the ~22% system corner round, so the
//   glyph can sit larger but still wants clear margins.
// Android adaptive foreground: the launcher mask + zoom crops the outer ring
//   (safe zone is only the inner ~61%), so the glyph must be noticeably
//   smaller on the 108dp layer to read with the same padding as stock icons.
// notification: Android renders the small status-bar icon from the ALPHA
//   channel only (everything opaque is drawn solid white). It must be a white
//   glyph on a fully transparent canvas. Tiny render target (status bar), so
//   the glyph fills more of the frame than the app icon but keeps a margin so
//   the system's own padding/clipping doesn't crop it.
const GLYPH_HEIGHT_FRACTION = {
  ios: 0.52,
  splash: 0.52,
  adaptive: 0.4,
  notification: 0.6,
}

// Render the glyph once, trimmed tight to its bounding box.
const glyphTrimmed = await sharp(glyphSvg, { density: 512 })
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .trim({ threshold: 1 })
  .png()
  .toBuffer()

async function buildIcon({ file, fraction, background }) {
  const glyphH = Math.round(SIZE * fraction)
  const glyph = await sharp(glyphTrimmed)
    .resize({ height: glyphH }) // width auto, aspect preserved (tall numeral → height-bound)
    .png()
    .toBuffer()
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background },
  })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(path.join(assets, file))
}

// iOS app icon + splash: solid black, full-bleed canvas, padded glyph.
await buildIcon({ file: 'icon.png', fraction: GLYPH_HEIGHT_FRACTION.ios, background: BLACK })
await buildIcon({ file: 'splash-icon.png', fraction: GLYPH_HEIGHT_FRACTION.splash, background: BLACK })

// Android adaptive foreground: transparent (app.json sets the #000000
// backgroundColor layer), extra padding for the launcher mask safe zone.
await buildIcon({
  file: 'adaptive-icon.png',
  fraction: GLYPH_HEIGHT_FRACTION.adaptive,
  background: { r: 0, g: 0, b: 0, alpha: 0 },
})

// Android notification small icon: white glyph, fully transparent canvas
// (Android masks by alpha and tints the result itself).
await buildIcon({
  file: 'notification-icon.png',
  fraction: GLYPH_HEIGHT_FRACTION.notification,
  background: { r: 0, g: 0, b: 0, alpha: 0 },
})

console.log('icons built: icon.png, splash-icon.png, adaptive-icon.png, notification-icon.png')
