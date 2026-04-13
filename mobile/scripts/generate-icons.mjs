import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '..', 'assets')

// Matches the SVG logo in src/components/BootScreen.tsx (viewBox 0 0 48 50)
const LOGO_PATHS = `
<path fill-rule="evenodd" d="M18.871 33.044L17.998 44.704C17.936 45.523 18.665 46.087 19.316 45.722C23.929 43.138 38.378 33.648 45.702 12.79C46.038 11.833 45.135 10.97 44.365 11.509C40.039 14.539 30.585 20.801 24.742 21.993C24.742 21.993 28.484 19.395 30.723 15.405C30.943 15.014 30.924 14.514 30.68 14.161L22.513 2.389C22.029 1.691 21.035 1.981 20.861 2.87L18.318 15.807L6.384 26.223C5.786 26.745 5.908 27.8 6.599 28.079L18.871 33.044Z"/>
<path fill-rule="evenodd" d="M39.975 28.448C39.219 29.503 37.591 31.672 36.088 32.997C35.787 33.262 35.828 33.707 36.172 33.923L44.115 38.909C44.593 39.209 45.238 38.853 45.158 38.332C44.788 35.95 43.724 30.982 41.033 28.374C40.732 28.083 40.214 28.114 39.975 28.448Z"/>
`

// Renders the logo into a square of `size` px, centered, occupying
// `logoFraction` of the canvas, on the given background. fill controls
// the logo color. If background is 'transparent' the canvas alpha is 0.
function svg({ size, bg, fill, logoFraction }) {
  const logoSize = size * logoFraction
  const offset = (size - logoSize) / 2
  const bgRect = bg === 'transparent'
    ? ''
    : `<rect width="${size}" height="${size}" fill="${bg}"/>`
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${bgRect}
  <g transform="translate(${offset} ${offset}) scale(${logoSize / 50})" fill="${fill}">
    ${LOGO_PATHS}
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

// App icon — dark brand background with the logo in warm accent
await render(svg({ size: 1024, bg: '#0d0005', fill: '#ff643c', logoFraction: 0.58 }), 'icon.png')

// Adaptive icon foreground — logo on transparent. Android composites it
// over the backgroundColor from app.json, inside a safe 66% inner circle,
// so we keep the logo at ~55% of the canvas to stay well inside the mask.
await render(svg({ size: 1024, bg: 'transparent', fill: '#ff643c', logoFraction: 0.45 }), 'adaptive-icon.png')

// Splash icon — on the dark brand background (matches splash.backgroundColor)
await render(svg({ size: 1024, bg: '#0d0005', fill: '#ff643c', logoFraction: 0.42 }), 'splash-icon.png')

// Favicon — small, same palette
await render(svg({ size: 96, bg: '#0d0005', fill: '#ff643c', logoFraction: 0.62 }), 'favicon.png')
