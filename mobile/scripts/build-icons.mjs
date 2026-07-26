import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Once brand mark: the numeral "1" — a bold
// round-capped stroke — in brand PURPLE on a warm BEIGE ground. Everything
// below (every mobile icon, the web favicon(s), og-image and once-mark.svg)
// is derived from the tokens + geometry in this file, so one edit regenerates
// every asset in lockstep. Run: `node scripts/build-icons.mjs`.
//
// Geometry lives in a 1024 viewBox centred on (512,512). The glyph is authored
// at "scale 1" with generous built-in margins (it spans ~23% to ~77% of the
// tile), so ONE drawing serves every target; a target only picks a `scale` to
// buy the extra breathing room a launcher mask or a splash needs.
//
// Flat colour only: two tokens, beige + purple.
// ─────────────────────────────────────────────────────────────────────────

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const assets = path.join(root, 'assets')
const web = path.join(root, '..', 'web', 'public')
const webApp = path.join(root, '..', 'web', 'src', 'app')
const appJson = path.join(root, 'app.json')

// ── Colour: read the app's tokens, never re-declare them ──────────────────
// A .mjs build script cannot import the TS module, so it parses it — that way
// src/colors.ts stays the single source of truth for the icon too.
const colorsSrc = fs.readFileSync(path.join(root, 'src', 'colors.ts'), 'utf8')
const token = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`))
  if (!m) throw new Error(`colors.ts: token ${name} not found (or no longer a plain hex)`)
  return m[1]
}

const BEIGE = token('BG') // the ground
const PURPLE = token('ORANGE') // the glyph — ORANGE is the legacy name for the brand-mark purple
const WHITE = token('WHITE')

// ── The "1" glyph ───────────────────────────────────────────────────────────
// Two round-capped strokes: the flag (top-left) and the stem. Kept as data so
// the same path drives every raster and the vector mark.
const GLYPH = 'M577 312 L447 412 M577 312 L577 712'
const STROKE = 150

/**
 * The mark as an SVG string on a 1024 canvas.
 * @param scale  glyph scale about the centre (1 = authored size)
 * @param bg     ground fill, or null for transparent
 * @param fill   glyph colour
 */
function markSvg({ scale = 1, bg = null, fill = PURPLE } = {}) {
  const parts = []
  if (bg) parts.push(`<rect width="1024" height="1024" fill="${bg}"/>`)
  parts.push(
    `<g transform="translate(512,512) scale(${scale}) translate(-512,-512)" fill="none" stroke="${fill}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPH}"/></g>`,
  )
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

const buf = (opts) => Buffer.from(markSvg(opts))
const writePng = (opts, size, file) => sharp(buf(opts)).resize(size, size).png().toFile(file)

// ── Mobile ────────────────────────────────────────────────────────────────
// iOS launcher + store listing: full-bleed beige, glyph at authored size (its
// built-in margins keep it clear of the squircle).
await writePng({ bg: BEIGE }, 1024, path.join(assets, 'icon.png'))
await writePng({ bg: BEIGE }, 512, path.join(assets, 'once-512.png'))
// Android adaptive foreground: transparent, glyph pulled into the launcher
// safe zone (the inner ~61% circle) so no mask clips it. app.json's
// adaptiveIcon.backgroundColor = BEIGE paints the ground the mask trims.
await writePng({ scale: 0.85, bg: null }, 1024, path.join(assets, 'adaptive-icon.png'))
// Splash: a small glyph with lots of air, over app.json's BEIGE splash bg.
await writePng({ scale: 0.5, bg: null }, 1024, path.join(assets, 'splash-icon.png'))
// Notification small icon: Android draws it from the ALPHA channel only and
// tints it, so the glyph is solid WHITE on transparent.
await writePng({ bg: null, fill: WHITE }, 1024, path.join(assets, 'notification-icon.png'))

// ── Web ───────────────────────────────────────────────────────────────────
await writePng({ bg: BEIGE }, 256, path.join(web, 'favicon.png'))

// favicon.ico for the Next app dir (and any bare /favicon.ico request): a
// single 256px PNG wrapped in an ICO container — ICONDIR + one ICONDIRENTRY.
const icoPng = await sharp(buf({ bg: BEIGE })).resize(256, 256).png().toBuffer()
const ico = Buffer.alloc(22)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // one image
ico.writeUInt8(0, 6) // width 0 = 256
ico.writeUInt8(0, 7) // height 0 = 256
ico.writeUInt16LE(1, 10) // colour planes
ico.writeUInt16LE(32, 12) // bits per pixel
ico.writeUInt32LE(icoPng.length, 14)
ico.writeUInt32LE(22, 18) // offset of the image data
fs.writeFileSync(path.join(webApp, 'favicon.ico'), Buffer.concat([ico, icoPng]))

// og-image: the glyph centred on a 1200×630 beige card.
const ogMark = await sharp(buf({ bg: null })).resize(360, 360).png().toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BEIGE } })
  .composite([{ input: ogMark, gravity: 'center' }])
  .png()
  .toFile(path.join(web, 'og-image.png'))

// Vector brand mark + SVG favicon (identical full-colour mark).
const vector = markSvg({ bg: BEIGE })
fs.writeFileSync(path.join(web, 'once-mark.svg'), vector + '\n')
fs.writeFileSync(path.join(web, 'favicon.svg'), vector + '\n')

// ── app.json ──────────────────────────────────────────────────────────────
// The colours app.json states about the icon are the same tokens, written from
// here rather than typed a second time by hand.
const app = JSON.parse(fs.readFileSync(appJson, 'utf8'))
app.expo.splash.backgroundColor = BEIGE
app.expo.android.adaptiveIcon.backgroundColor = BEIGE
const notif = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')
if (!notif) throw new Error('app.json: expo-notifications plugin entry not found')
notif[1].color = PURPLE // Android tints the white glyph with this in the shade
fs.writeFileSync(appJson, JSON.stringify(app, null, 2) + '\n')

console.log(
  `icons built ("1" ${PURPLE} on ${BEIGE}) → mobile: icon, once-512, splash-icon, adaptive-icon, notification-icon | web: favicon.png/.svg/.ico, og-image.png, once-mark.svg | app.json synced`,
)
