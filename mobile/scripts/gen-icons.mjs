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
const svgSplash      = svgTransparent

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

// Tall splash: match rises from the canvas bottom, head top at ~30% from the top.
// Source SVG (1024 canvas) has the match content occupying y=225..1024.
// Want on 1080x2400 splash: y=720..2400 — scale = 2.103, ty = 247, center x at 540 → tx = -537.
function splashSvgBuf() {
  const inner = svgTransparent.toString().replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')
  return Buffer.from(
    `<svg width="1080" height="2400" viewBox="0 0 1080 2400" xmlns="http://www.w3.org/2000/svg" fill="none">` +
    `<g transform="translate(-537, 247) scale(2.103)">${inner}</g></svg>`,
  )
}
function rasterizeSplash() {
  return sharp(splashSvgBuf(), { density: 144 }).resize(1080, 2400, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

async function main() {
  console.log('mobile/assets:')
  await writePng(flatOnBg(1024),                                  path.join(MOBILE, 'assets/icon.png'))
  await writePng(flatOnBg(96),                                    path.join(MOBILE, 'assets/favicon.png'))
  await writePng(await paddedForAdaptive(1024),                   path.join(MOBILE, 'assets/adaptive-icon.png'))
  await writePng(rasterizeSplash(),                               path.join(MOBILE, 'assets/splash-icon.png'))
  await writePng(rasterize(svgTransparent, 512),                  path.join(MOBILE, 'assets/once-512.png'))

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
  const splash = [
    ['mdpi',   288],
    ['hdpi',   432],
    ['xhdpi',  576],
    ['xxhdpi', 864],
    ['xxxhdpi',1152],
  ]
  for (const [d, sz] of splash) {
    const file = path.join(MOBILE, `android/app/src/main/res/drawable-${d}/splashscreen_logo.png`)
    await writePng(rasterize(svgSplash, sz), file)
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
