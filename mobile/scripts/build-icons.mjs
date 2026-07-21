import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Once brand mark: concentric flat-gold rings
// on a bordeaux ground, with a vertical gold pillar at the centre. Everything
// below — every mobile icon, the web favicon(s), og-image and once-mark.svg —
// is derived from the tokens in this file, so changing a token here
// regenerates every asset in lockstep. Run: `node scripts/build-icons.mjs`.
//
// Geometry lives in a 1024 viewBox centred on (512,512). RINGS are authored at
// "scale 1" (outer ring r=500 fills the tile); each target picks a `scale` to
// buy the margin it needs — full-bleed icon, roomier splash, and a much
// smaller adaptive foreground that must survive the launcher mask.
//
// Flat colour only: no gradients, no sheen. Two tokens, bordeaux + gold.
// ─────────────────────────────────────────────────────────────────────────

const BORDEAUX = '#4A1020' // brand PRIMARY
const GOLD = '#E6BE5E' // brand GOLD_BRIGHT
const WHITE = '#FFFFFF'

// Concentric rings [radius, strokeWidth]: an outer band, one heavy primary
// ring, then inner grooves down to the clear centre that holds the pillar.
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

// The centre pillar: a capsule (fully rounded caps, rx = width/2). Authored at
// scale 1 so the shipped icon (scale 0.9) renders it at exactly 78×310.
const BAR = { w: 86.7, h: 344.4 }

// Android's notification small icon is drawn from the ALPHA channel only, at
// status-bar size. The full ring stack would alias into mush, so the mark is
// reduced to its two load-bearing parts: one bold ring + the pillar, in white.
const NOTIF_RINGS = [[340, 62]]
const NOTIF_BAR = { w: 120, h: 400 }

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const assets = path.join(root, 'assets')
const web = path.join(root, '..', 'web', 'public')

/**
 * Build the mark as an SVG string on a 1024 canvas.
 * @param scale  ring/pillar scale (1 = outer ring touches the tile edge)
 * @param bg     background fill, or null for transparent
 * @param rings  ring set to draw
 * @param bar    pillar dimensions at scale 1
 * @param fill   colour for rings + pillar
 */
function markSvg({ scale = 1, bg = null, rings = RINGS, bar = BAR, fill = GOLD } = {}) {
  const parts = []
  if (bg) parts.push(`<rect width="1024" height="1024" fill="${bg}"/>`)
  for (const [r, w] of rings) {
    parts.push(
      `<circle cx="512" cy="512" r="${(r * scale).toFixed(2)}" fill="none" stroke="${fill}" stroke-width="${(w * scale).toFixed(2)}"/>`,
    )
  }
  const bw = bar.w * scale
  const bh = bar.h * scale
  parts.push(
    `<rect x="${(512 - bw / 2).toFixed(2)}" y="${(512 - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bw / 2).toFixed(2)}" fill="${fill}"/>`,
  )
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

const buf = (opts) => Buffer.from(markSvg(opts))

async function writePng(opts, size, file) {
  await sharp(buf(opts)).resize(size, size).png().toFile(file)
}

// ── Mobile ────────────────────────────────────────────────────────────────
await writePng({ scale: 0.9, bg: BORDEAUX }, 1024, path.join(assets, 'icon.png'))
await writePng({ scale: 0.9, bg: BORDEAUX }, 512, path.join(assets, 'once-512.png'))
// Splash: a touch more breathing room (app.json splash bg = bordeaux).
await writePng({ scale: 0.82, bg: BORDEAUX }, 1024, path.join(assets, 'splash-icon.png'))
// Android adaptive foreground: transparent and shrunk into the launcher safe
// zone (app.json adaptiveIcon.backgroundColor = bordeaux fills the margin).
await writePng({ scale: 0.62, bg: null }, 1024, path.join(assets, 'adaptive-icon.png'))
// Android notification small icon: white, transparent, reduced ring + pillar.
await writePng(
  { scale: 1, bg: null, rings: NOTIF_RINGS, bar: NOTIF_BAR, fill: WHITE },
  1024,
  path.join(assets, 'notification-icon.png'),
)

// ── Web ───────────────────────────────────────────────────────────────────
await writePng({ scale: 0.9, bg: BORDEAUX }, 256, path.join(web, 'favicon.png'))

// og-image: the mark centred on a 1200×630 bordeaux card.
const ogMark = await sharp(buf({ scale: 0.9, bg: BORDEAUX })).resize(600, 600).png().toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BORDEAUX } })
  .composite([{ input: ogMark, gravity: 'center' }])
  .png()
  .toFile(path.join(web, 'og-image.png'))

// Vector brand mark + SVG favicon (identical full-colour mark).
const vector = markSvg({ scale: 0.9, bg: BORDEAUX })
fs.writeFileSync(path.join(web, 'once-mark.svg'), vector + '\n')
fs.writeFileSync(path.join(web, 'favicon.svg'), vector + '\n')

console.log(
  'icons built → mobile: icon, once-512, splash-icon, adaptive-icon, notification-icon | web: favicon.png/.svg, og-image.png, once-mark.svg',
)
