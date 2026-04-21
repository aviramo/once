import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '..', 'assets')

// Source of truth: the Livo icon SVG (1024×1024, white bg, two circles).
const LOGO_SVG_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.svg')

const APP_BG = '#f4f4f4' // matches GestureHandlerRootView backgroundColor in _layout.tsx

// Render SVG into a `size`×`size` canvas with the logo scaled to `logoScale` (0–1).
// The logo is centered; remaining area is filled with `bg`.
async function render(size, file, { bg = APP_BG, logoScale = 1 } = {}) {
  const logoSize = Math.round(size * logoScale)
  const offset = Math.round((size - logoSize) / 2)

  const logoBuffer = await sharp(LOGO_SVG_PATH)
    .resize(logoSize, logoSize)
    .png()
    .toBuffer()

  const buffer = await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logoBuffer, left: offset, top: offset }])
    .png()
    .toBuffer()

  const out = path.join(ASSETS, file)
  fs.writeFileSync(out, buffer)
  console.log('wrote', out)
}

// App icon (1024×1024) — iOS masks with squircle, safe zone ≈ 87%.
await render(1024, 'icon.png', { bg: APP_BG, logoScale: 0.87 })

// Adaptive icon foreground — Android safe zone is 66% of the canvas.
// Keeping logo within 66% ensures nothing is clipped by circle/squircle masks.
await render(1024, 'adaptive-icon.png', { bg: APP_BG, logoScale: 0.66 })

// Splash icon — same icon at 512 on white.
await render(512, 'splash-icon.png', { bg: APP_BG })

// Favicon — 96px.
await render(96, 'favicon.png', { bg: APP_BG })

// Google OAuth branding / generic 512px square.
await render(512, 'livo-512.png', { bg: APP_BG })

console.log('Done.')
