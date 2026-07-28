import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the Once brand mark: the numeral "1" — a bold
// round-capped stroke — in brand PURPLE on the app's pale purple ground. Everything
// below (every mobile icon, the store's 512, the web favicon(s), og-image and
// once-mark.svg) is derived from the tokens + geometry in this file, so one
// edit regenerates every asset in lockstep. Run: `node scripts/build-icons.mjs`.
//
// Each output is written where its consumer needs it, and nowhere twice:
// mobile/assets = what the app binary ships (app.json points at these by
// relative path), mobile/store = console upload art, web/public = what the site
// serves. They are separate renders of one drawing, not copies of each other.
//
// Geometry lives in a 1024 viewBox centred on (512,512). The glyph is authored
// at "scale 1" with generous built-in margins (it spans ~23% to ~77% of the
// tile), so ONE drawing serves every target; a target only picks a `scale` to
// buy the extra breathing room a launcher mask or a splash needs.
//
// Flat colour only: two tokens, the page purple + the ink purple.
//
// It also SYNCS the colours nothing else can import: `app.json` (splash +
// adaptive-icon + notification tint), the landing site's `web/public/tokens.css`
// (every CSS custom property, derived from these same tokens) and the
// `theme-color` meta of every static page. So `colors.ts` is the one place a
// colour is ever typed, app and site alike.
// ─────────────────────────────────────────────────────────────────────────

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const assets = path.join(root, 'assets')
const store = path.join(root, 'store')
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
// Same lookup for the translucent steps (`rgba(...)`), which the CSS tokens need.
const rgba = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(rgba\\([^']*\\))'`))
  if (!m) throw new Error(`colors.ts: token ${name} not found (or no longer an rgba string)`)
  return m[1]
}

const GROUND = token('PAGE') // the ground — the app's own page tint
const PURPLE = token('INK') // the glyph — the app's one purple (there is no separate brand hue)
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
// iOS launcher: full-bleed page purple, glyph at authored size (its built-in margins
// keep it clear of the squircle). assets/ holds only what the app binary ships;
// the 512 the consoles ask for is a store asset, so it lands in store/.
await writePng({ bg: GROUND }, 1024, path.join(assets, 'icon.png'))
await writePng({ bg: GROUND }, 512, path.join(store, 'once-512.png'))
// Android adaptive foreground: transparent, glyph pulled into the launcher
// safe zone (the inner ~61% circle) so no mask clips it. app.json's
// adaptiveIcon.backgroundColor = GROUND paints the ground the mask trims.
await writePng({ scale: 0.85, bg: null }, 1024, path.join(assets, 'adaptive-icon.png'))
// Splash: a small glyph with lots of air, over app.json's GROUND splash bg.
await writePng({ scale: 0.5, bg: null }, 1024, path.join(assets, 'splash-icon.png'))
// Notification small icon: Android draws it from the ALPHA channel only and
// tints it, so the glyph is solid WHITE on transparent.
await writePng({ bg: null, fill: WHITE }, 1024, path.join(assets, 'notification-icon.png'))

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

// og-image: the glyph centred on a 1200×630 card of the ground tint.
const ogMark = await sharp(buf({ bg: null })).resize(360, 360).png().toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 4, background: GROUND } })
  .composite([{ input: ogMark, gravity: 'center' }])
  .png()
  .toFile(path.join(web, 'og-image.png'))

// Vector brand mark + SVG favicon (identical full-colour mark).
const vector = markSvg({ bg: GROUND })
fs.writeFileSync(path.join(web, 'once-mark.svg'), vector + '\n')
fs.writeFileSync(path.join(web, 'favicon.svg'), vector + '\n')

// ── app.json ──────────────────────────────────────────────────────────────
// The colours app.json states about the icon are the same tokens, written from
// here rather than typed a second time by hand.
const app = JSON.parse(fs.readFileSync(appJson, 'utf8'))
app.expo.splash.backgroundColor = GROUND
app.expo.android.adaptiveIcon.backgroundColor = GROUND
const notif = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')
if (!notif) throw new Error('app.json: expo-notifications plugin entry not found')
notif[1].color = PURPLE // Android tints the white glyph with this in the shade
fs.writeFileSync(appJson, JSON.stringify(app, null, 2) + '\n')

// ── web/public/tokens.css ─────────────────────────────────────────────────
// The landing site's ENTIRE palette, generated from the same tokens so the site
// can never drift from the app. styles.css @imports this and declares no colour
// of its own; a page's `theme-color` meta is synced below for the same reason.
//
// The site keeps its own NAMES (--bg / --ink / --brand / --accent …) because its
// CSS is written against them, but they now all resolve to the app's one purple
// family: --brand and --accent are both INK (there is no second hue), and their
// `-strong` hover step is INK_PRESSED, the app's held-down step.
const INK_RGB = [1, 3, 5].map((i) => parseInt(token('INK').slice(i, i + 2), 16)).join(', ')
const tokensCss = `/* AUTO-GENERATED from mobile/src/colors.ts by scripts/build-icons.mjs — do not edit by hand. */
:root {
  /* Surfaces — the page purple, its sunk step, and white */
  --bg: ${GROUND};
  --bg-2: ${token('SURFACE_SUNK')};
  --surface: ${WHITE};

  /* Ink — the one purple, never black */
  --ink: ${PURPLE};
  --ink-2: ${rgba('INK_BODY')};
  --ink-3: ${rgba('INK_HINT')};

  /* Brand — actions. The SAME purple: there is no separate brand hue. */
  --brand: ${PURPLE};
  --brand-strong: ${token('INK_PRESSED')};
  --brand-ink: ${WHITE};
  --brand-soft: ${rgba('INK_WASH')};

  /* Accent — reading + quiet decoration. Also the one purple. */
  --accent: ${PURPLE};
  --accent-strong: ${token('INK_PRESSED')};
  --accent-soft: ${rgba('INK_WASH')};

  /* Muted + pale steps */
  --muted: ${token('INK_MUTED')};
  --ground: ${token('INK_PALE')};
  --art-tint: ${token('INK_PALE')};
  --art-ghost: ${rgba('INK_HAZE')};

  /* Lines */
  --border: ${token('SURFACE_SUNK')};
  --border-strong: ${rgba('INK_DIM')};

  /* Selection + the one shadow black */
  --selection: ${rgba('SELECTION')};
  --scrim: ${token('SHADOW_BLACK')};

  /* Shadows — the app's ink at a soft alpha */
  --shadow-sm: 0 1px 2px rgba(${INK_RGB}, 0.08);
  --shadow-md: 0 10px 30px rgba(${INK_RGB}, 0.1);
  --shadow-lg: 0 24px 60px rgba(${INK_RGB}, 0.14);
}
`
fs.writeFileSync(path.join(web, 'tokens.css'), tokensCss)

// Every static page's `theme-color` (the browser UI tint) is the page colour.
// A meta tag cannot read a CSS var, so it is written from here instead.
const pages = fs.readdirSync(web).filter((f) => f.endsWith('.html'))
const themed = []
for (const file of pages) {
  const p = path.join(web, file)
  const src = fs.readFileSync(p, 'utf8')
  const out = src.replace(
    /(<meta name="theme-color" content=")([^"]*)(")/g,
    (_m, a, _old, b) => a + GROUND + b,
  )
  if (out !== src) {
    fs.writeFileSync(p, out)
    themed.push(file)
  }
}

console.log(
  `icons built ("1" ${PURPLE} on ${GROUND}) → assets: icon, splash-icon, adaptive-icon, notification-icon | store: once-512 | web: favicon.png/.svg/.ico, og-image.png, once-mark.svg, tokens.css | app.json synced | theme-color: ${themed.join(', ') || 'already current'}`,
)
