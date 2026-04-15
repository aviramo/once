import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '..', 'assets')

// Source of truth for the brand mark. Everything below renders this SVG
// into the PNG slots Expo needs.
const LOGO_SVG = fs.readFileSync(path.join(ASSETS, 'syncwish-logo.svg'), 'utf8')

// Strip the outer <svg …> wrapper so we can re-embed the inner markup inside
// a canvas of arbitrary size.
function innerSvg() {
  const m = LOGO_SVG.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  if (!m) throw new Error('Could not parse syncwish-logo.svg')
  return m[1]
}

// Renders the logo badge centered on a square canvas. The logo's native
// viewBox is 1024×1024 with its own rounded purple background, so we just
// scale it to occupy `logoFraction` of the output.
function svg({ size, bg, logoFraction }) {
  const logoSize = size * logoFraction
  const offset = (size - logoSize) / 2
  const bgRect = bg === 'transparent'
    ? ''
    : `<rect width="${size}" height="${size}" fill="${bg}"/>`
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${bgRect}
  <g transform="translate(${offset} ${offset}) scale(${logoSize / 1024})">
    ${innerSvg()}
  </g>
</svg>`
}

async function write(file, buffer) {
  const out = path.join(ASSETS, file)
  fs.writeFileSync(out, buffer)
  console.log('wrote', out)
}

async function render(svgStr, file, { background } = {}) {
  let pipe = sharp(Buffer.from(svgStr))
  if (background) pipe = pipe.flatten({ background })
  await write(file, await pipe.png().toBuffer())
}

// App icon — the full branded badge fills the canvas. iOS applies its own
// mask; the badge already has rounded corners for platforms that don't.
await render(svg({ size: 1024, bg: 'transparent', logoFraction: 1.0 }), 'icon.png')

// Adaptive icon foreground — Android composites over backgroundColor from
// app.json and masks to an inner 66% circle. Keep the badge at ~60% so it
// sits cleanly inside the mask.
await render(svg({ size: 1024, bg: 'transparent', logoFraction: 0.6 }), 'adaptive-icon.png')

// Splash icon — the badge on the off-white splash background.
await render(svg({ size: 1024, bg: '#fafafa', logoFraction: 0.45 }), 'splash-icon.png')

// Favicon — small badge, fills the canvas.
await render(svg({ size: 96, bg: 'transparent', logoFraction: 1.0 }), 'favicon.png')
