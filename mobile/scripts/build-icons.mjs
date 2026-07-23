import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Once brand mark: a solid ORANGE disc inside
// a BEIGE ring, with the vertical brand pillar at its centre, on a light
// orange ground. Everything below — every mobile icon, the web favicon(s),
// og-image and once-mark.svg — is derived from the tokens in this file, so
// changing a token here regenerates every asset in lockstep.
// Run: `node scripts/build-icons.mjs`.
//
// Geometry lives in a 1024 viewBox centred on (512,512), sized so ONE drawing
// serves both stores: the ring's outer edge sits at r=309, inside Android's
// adaptive safe zone (the inner 66% circle, r=338). Even under the tightest
// launcher mask a band of the orange ground still shows around the ring, and
// the ring itself is never clipped; iOS's squircle is roomier still.
//
// Flat colour only: no gradients, no sheen.
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
// A .mjs build script cannot import the TS module, so it parses it instead —
// that way src/colors.ts stays the single source of truth for the icon too.
const colorsSrc = fs.readFileSync(path.join(root, 'src', 'colors.ts'), 'utf8')
const token = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`))
  if (!m) throw new Error(`colors.ts: token ${name} not found (or no longer a plain hex)`)
  return m[1]
}

const BEIGE = token('BG') // the ring and the pillar
const ORANGE = token('ORANGE') // the disc
const WHITE = token('WHITE')
const GROUND = token('PRIMARY_GROUND') // the ground behind the disc

// PRIMARY_GROUND is ORANGE over BG — recompute the mix and refuse to build if
// the token has drifted, so the flattened hex can never become a hand-picked
// colour of its own.
const GROUND_ALPHA = 0.25
const mix = (a, b, t) => {
  const ch = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16)
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  )
}
const expected = mix(BEIGE, ORANGE, GROUND_ALPHA)
if (expected !== GROUND.toUpperCase()) {
  throw new Error(
    `colors.ts: PRIMARY_GROUND is ${GROUND}, but ORANGE at ${GROUND_ALPHA * 100}% over BG is ${expected}`,
  )
}

const DISC_R = 296 // orange disc
const RING = 26 // beige ring, centred on the disc edge
// The pillar: a capsule (fully rounded caps, rx = width/2), same 78:310 aspect
// as the original brand mark, sized against the disc.
const BAR = { w: DISC_R * 1.16 * (78 / 310), h: DISC_R * 1.16 }

// Android's notification small icon is drawn from the ALPHA channel only, at
// status-bar size. A filled disc would flatten to a white blob, so the mark is
// reduced to its two load-bearing parts: one bold ring + the pillar, in white.
const NOTIF = { discR: 340, ring: 62, bar: { w: 120, h: 400 } }

/**
 * Build the mark as an SVG string on a 1024 canvas.
 * @param scale   disc/ring/pillar scale (1 = the shipped launcher size)
 * @param bg      ground fill, or null for transparent
 * @param discR   disc radius at scale 1
 * @param ring    ring width at scale 1
 * @param bar     pillar dimensions at scale 1
 * @param fill    colour of the ring + pillar
 * @param disc    colour of the disc, or null to leave it hollow (alpha icons)
 * @param shadow  soft drop shadow under the disc
 */
function markSvg({
  scale = 1,
  bg = null,
  discR = DISC_R,
  ring = RING,
  bar = BAR,
  fill = BEIGE,
  disc = ORANGE,
  shadow = true,
} = {}) {
  const n = (v) => (v * scale).toFixed(2)
  const parts = []
  if (bg) parts.push(`<rect width="1024" height="1024" fill="${bg}"/>`)
  parts.push(
    `<circle cx="512" cy="512" r="${n(discR)}" fill="${disc ?? 'none'}" stroke="${fill}" stroke-width="${n(ring)}"${shadow ? ' filter="url(#drop)"' : ''}/>`,
  )
  parts.push(
    `<rect x="${n(-bar.w / 2)}" y="${n(-bar.h / 2)}" width="${n(bar.w)}" height="${n(bar.h)}" rx="${n(bar.w / 2)}" fill="${fill}" transform="translate(512,512)"/>`,
  )
  const defs = shadow
    ? `<defs><filter id="drop" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.16"/></filter></defs>`
    : ''
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}${parts.join('')}</svg>`
}

const buf = (opts) => Buffer.from(markSvg(opts))

async function writePng(opts, size, file) {
  await sharp(buf(opts)).resize(size, size).png().toFile(file)
}

// ── Mobile ────────────────────────────────────────────────────────────────
await writePng({ bg: GROUND }, 1024, path.join(assets, 'icon.png'))
await writePng({ bg: GROUND }, 512, path.join(assets, 'once-512.png'))
// Splash: transparent, shrunk, over app.json's GROUND background — so the
// beige ring reads against the light orange instead of vanishing into it.
await writePng({ scale: 0.72, bg: null }, 1024, path.join(assets, 'splash-icon.png'))
// Android adaptive foreground: transparent (app.json adaptiveIcon
// .backgroundColor = GROUND paints the ground and the launcher mask trims it).
await writePng({ bg: null }, 1024, path.join(assets, 'adaptive-icon.png'))
// Android notification small icon: white, transparent, hollow ring + pillar.
await writePng(
  {
    bg: null,
    disc: null,
    discR: NOTIF.discR,
    ring: NOTIF.ring,
    bar: NOTIF.bar,
    fill: WHITE,
    shadow: false,
  },
  1024,
  path.join(assets, 'notification-icon.png'),
)

// ── Web ───────────────────────────────────────────────────────────────────
await writePng({ bg: GROUND }, 256, path.join(web, 'favicon.png'))

// favicon.ico for the Next app dir (and any bare /favicon.ico request): a
// single 256px PNG wrapped in an ICO container — ICONDIR + one ICONDIRENTRY.
const icoPng = await sharp(buf({ bg: GROUND })).resize(256, 256).png().toBuffer()
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

// og-image: the mark centred on a 1200×630 card in the ground colour.
const ogMark = await sharp(buf({ bg: null })).resize(560, 560).png().toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 4, background: GROUND } })
  .composite([{ input: ogMark, gravity: 'center' }])
  .png()
  .toFile(path.join(web, 'og-image.png'))

// Vector brand mark + SVG favicon (identical full-colour mark).
const vector = markSvg({ bg: GROUND })
fs.writeFileSync(path.join(web, 'once-mark.svg'), vector + '\n')
fs.writeFileSync(path.join(web, 'favicon.svg'), vector + '\n')

// ── app.json ──────────────────────────────────────────────────────────────
// The three colours app.json states about the icon are the same tokens, so
// they are written from here rather than typed a second time by hand.
const app = JSON.parse(fs.readFileSync(appJson, 'utf8'))
app.expo.splash.backgroundColor = GROUND
app.expo.android.adaptiveIcon.backgroundColor = GROUND
// The notification small icon is white-on-transparent; Android tints it with
// this colour in the shade, so it must be the disc orange, not the ground.
const notif = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')
if (!notif) throw new Error('app.json: expo-notifications plugin entry not found')
notif[1].color = ORANGE
fs.writeFileSync(appJson, JSON.stringify(app, null, 2) + '\n')

console.log(
  `icons built (ground ${GROUND}) → mobile: icon, once-512, splash-icon, adaptive-icon, notification-icon | web: favicon.png/.svg/.ico, og-image.png, once-mark.svg | app.json colours synced`,
)
