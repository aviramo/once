// One-shot icon generator. Source is assets/icon.svg.
// Emits every flavor the app consumes: iOS icon, web favicon, Android adaptive foreground
// (scaled into the 66% safe zone), splash logo, and the legacy mipmap webp set.

import sharp from 'sharp'
import path  from 'node:path'
import fs    from 'node:fs'
import fsp   from 'node:fs/promises'

const MOBILE  = path.resolve('.')                  // cwd = mobile/
const ROOT    = path.resolve(MOBILE, '..')          // project root
const SRC_SVG = path.join(ROOT, 'assets/icon.svg')
const BG      = { r: 0xff, g: 0xff, b: 0xff }      // white — orange shape needs contrasting bg

const svgTransparent = fs.readFileSync(SRC_SVG)

// Dedicated silhouette for the Android notification small icon. Android renders
// the small icon by drawing only the alpha channel, so the colored brand SVG
// flattens into an indistinct blob at status-bar size — the head and stick
// share a wavy boundary and visually merge. This SVG is a simplified matchstick:
// a wide oval head, a clear vertical gap, and a narrow rounded stick. The
// ~4× width ratio between head and stick plus the gap make the silhouette read
// unmistakably as a matchstick at 24 px.
const svgNotification = Buffer.from(
  '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="none">' +
  '<ellipse cx="512" cy="295" rx="190" ry="210" fill="#FFFFFF"/>' +
  '<rect x="436" y="535" width="152" height="405" rx="32" fill="#FFFFFF"/>' +
  '</svg>',
)

// SVG → raster. density scales with size so paths stay crisp.
function rasterize(svgBuf, size) {
  const density = Math.max(72, Math.round((size / 1024) * 512))
  return sharp(svgBuf, { density }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

async function writePng(pipeline, file) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await pipeline.png().toFile(file)
  console.log('  png ', file)
}
async function writeWebp(pipeline, file) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await pipeline.webp({ lossless: true }).toFile(file)
  console.log('  webp', file)
}

// Flatten the transparent SVG onto brand bg — used for iOS icon, favicon, legacy ic_launcher.
function flatOnBg(size) {
  return rasterize(svgTransparent, size).flatten({ background: BG })
}

// Adaptive-icon safe zone: content sits inside the central 66% of a transparent canvas.
async function paddedForAdaptive(size) {
  const inner = Math.round(size * 0.66)
  const pad   = Math.round((size - inner) / 2)
  const inside = await rasterize(svgTransparent, inner).png().toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: inside, top: pad, left: pad }])
}

// Splash logo: a square, transparent-background icon centered on the
// splashscreen color (white) by the layer-list in drawable/splashscreen.xml.
// gravity="center" renders the bitmap at native pixel size centered on screen,
// so per-density sizes determine the icon's visual dp size (96 dp here).
function rasterizeSplashIcon(size) {
  return rasterize(svgTransparent, size)
}

async function main() {
  console.log('mobile/assets:')
  await writePng(flatOnBg(1024),                                  path.join(MOBILE, 'assets/icon.png'))
  await writePng(flatOnBg(96),                                    path.join(MOBILE, 'assets/favicon.png'))
  await writePng(await paddedForAdaptive(1024),                   path.join(MOBILE, 'assets/adaptive-icon.png'))
  // splash-icon.png: square centered icon used by app.json splash config (iOS launch screen).
  await writePng(flatOnBg(1024),                                  path.join(MOBILE, 'assets/splash-icon.png'))
  await writePng(rasterize(svgTransparent, 512),                  path.join(MOBILE, 'assets/once-512.png'))
  // Android notification small icon: white silhouette on transparent canvas.
  // Source for expo-notifications plugin (icon: ./assets/notification-icon.png).
  await writePng(rasterize(svgNotification, 1024),                path.join(MOBILE, 'assets/notification-icon.png'))

  console.log('project assets/:')
  await writePng(rasterize(svgTransparent, 512),                  path.join(ROOT, 'assets/icon-512.png'))

  console.log('android mipmap:')
  const mipmap = [
    ['mdpi',   48,  108],
    ['hdpi',   72,  162],
    ['xhdpi',  96,  216],
    ['xxhdpi', 144, 324],
    ['xxxhdpi',192, 432],
  ]
  for (const [d, sz, fgSz] of mipmap) {
    const dir = path.join(MOBILE, `android/app/src/main/res/mipmap-${d}`)
    await writeWebp(flatOnBg(sz),                                 path.join(dir, 'ic_launcher.webp'))
    await writeWebp(flatOnBg(sz),                                 path.join(dir, 'ic_launcher_round.webp'))
    await writeWebp(await paddedForAdaptive(fgSz),                path.join(dir, 'ic_launcher_foreground.webp'))
  }

  console.log('android splash logo:')
  // Square centered icon at 96dp visual size. drawable/splashscreen.xml uses
  // gravity="center" and a layer-list with splashscreen_background (white).
  const splash = [
    ['mdpi',     96],
    ['hdpi',    144],
    ['xhdpi',   192],
    ['xxhdpi',  288],
    ['xxxhdpi', 384],
  ]
  for (const [d, sz] of splash) {
    const file = path.join(MOBILE, `android/app/src/main/res/drawable-${d}/splashscreen_logo.png`)
    await writePng(rasterizeSplashIcon(sz), file)
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
