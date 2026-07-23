import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// Google Play FEATURE GRAPHIC — 1024×500, no text, flat colour only.
//
// The scene, left → right, is the app in one breath:
//   the brand mark (one moment, ringed by its countdown) → two chat bubbles
//   → the single match card, with the orange heart on it.
//
// Every colour is parsed out of src/colors.ts, exactly like build-icons.mjs,
// so the store art can never drift from the app's palette.
// Run: `node scripts/build-feature-graphic.mjs`.
// ─────────────────────────────────────────────────────────────────────────

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const out = path.join(root, 'store')

const colorsSrc = fs.readFileSync(path.join(root, 'src', 'colors.ts'), 'utf8')
const token = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`))
  if (!m) throw new Error(`colors.ts: token ${name} not found (or no longer a plain hex)`)
  return m[1]
}

const BG = token('BG')
const WHITE = token('WHITE')
const SURFACE_LIFT = token('SURFACE_LIFT')
const INK = token('INK')
const GREEN = token('GREEN')
const GREEN_HALF = token('GREEN_HALF')
const GREEN_WASH = token('GREEN_WASH')
const ORANGE = token('ORANGE')
const GROUND = token('PRIMARY_GROUND')

const W = 1024
const H = 500

// ── The mark, left ────────────────────────────────────────────────────────
const MARK = { x: 236, y: 250, r: 108, ring: 9.5, bar: { w: 31, h: 126 } }

// Concentric beige rings behind it — the same circle repeated outward, which
// is the icon's own geometry used as pattern rather than a second motif.
const halo = [176, 236, 300, 372]
  .map(
    (r, i) =>
      `<circle cx="${MARK.x}" cy="${MARK.y}" r="${r}" fill="none" stroke="${BG}" stroke-width="${9 - i}"/>`,
  )
  .join('')

const mark = `
  <circle cx="${MARK.x}" cy="${MARK.y}" r="${MARK.r}" fill="${ORANGE}" stroke="${BG}" stroke-width="${MARK.ring}"/>
  <rect x="${MARK.x - MARK.bar.w / 2}" y="${MARK.y - MARK.bar.h / 2}" width="${MARK.bar.w}" height="${MARK.bar.h}" rx="${MARK.bar.w / 2}" fill="${BG}"/>
`

// The countdown: a green arc riding just outside the mark, open at the top —
// the invitation timer that gives the "once" its edge.
const timerR = MARK.r + 26
const arc = (from, to, r, color, w) => {
  const p = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(MARK.x + r * Math.cos(a)).toFixed(2)},${(MARK.y + r * Math.sin(a)).toFixed(2)}`
  }
  const large = to - from > 180 ? 1 : 0
  return `<path d="M ${p(from)} A ${r},${r} 0 ${large} 1 ${p(to)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
}
const timer = arc(18, 292, timerR, GREEN, 11) + arc(300, 350, timerR, ORANGE, 11)

// ── The match card, right ─────────────────────────────────────────────────
const CARD = { x: 624, y: 72, w: 292, h: 356, r: 30 }
const cx = CARD.x + CARD.w / 2
const photo = { x: CARD.x + 18, y: CARD.y + 18, w: CARD.w - 36, h: 214, r: 22 }
const head = { x: cx, y: photo.y + 92, r: 40 }

const bar = (y, w, fill) =>
  `<rect x="${CARD.x + 26}" y="${y}" width="${w}" height="14" rx="7" fill="${fill}"/>`

const heart = (x, y, s, fill) =>
  `<path transform="translate(${x},${y}) scale(${s}) translate(-12,-12)" fill="${fill}" d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`

// ONE card, never a stack: the product shows a single person at a time, so
// the art must not imply a deck to swipe through. SURFACE_LIFT paints the
// thin lifted lip under it instead.
const card = `
  <g transform="rotate(-3 ${cx} ${CARD.y + CARD.h / 2})">
    <rect x="${CARD.x - 7}" y="${CARD.y - 7}" width="${CARD.w + 14}" height="${CARD.h + 14}" rx="${CARD.r + 7}" fill="${SURFACE_LIFT}"/>
  </g>`

const face = `
  <g transform="rotate(-3 ${cx} ${CARD.y + CARD.h / 2})">
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${WHITE}"/>
    <rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${photo.r}" fill="${GREEN_WASH}"/>
    <clipPath id="ph"><rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${photo.r}"/></clipPath>
    <g clip-path="url(#ph)">
      <circle cx="${head.x}" cy="${head.y}" r="${head.r}" fill="${GREEN}"/>
      <path d="M ${head.x - 82} ${photo.y + photo.h + 6} a 82,74 0 0 1 164,0 z" fill="${GREEN}"/>
    </g>
    ${bar(CARD.y + 258, 132, INK)}
    ${bar(CARD.y + 288, 196, GREEN_HALF)}
    ${bar(CARD.y + 314, 148, GREEN_WASH)}
    <circle cx="${CARD.x + CARD.w - 6}" cy="${CARD.y + CARD.h - 58}" r="43" fill="${ORANGE}"/>
    ${heart(CARD.x + CARD.w - 6, CARD.y + CARD.h - 58, 1.9, WHITE)}
  </g>`

// ── The conversation, between them ────────────────────────────────────────
const dots = (x, y, fill) =>
  [0, 1, 2].map((i) => `<circle cx="${x + i * 22}" cy="${y}" r="6.5" fill="${fill}"/>`).join('')

const bubble = (x, y, w, h, fill, tailLeft) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>
  <circle cx="${tailLeft ? x + 10 : x + w - 10}" cy="${y + h + 6}" r="9" fill="${fill}"/>
  <circle cx="${tailLeft ? x - 4 : x + w + 4}" cy="${y + h + 18}" r="4.5" fill="${fill}"/>`

const chat = `
  ${bubble(430, 148, 128, 56, WHITE, true)}
  ${dots(463, 176, GREEN_HALF)}
  ${bubble(446, 268, 128, 56, ORANGE, false)}
  ${dots(479, 296, WHITE)}`

// ── Sparks ────────────────────────────────────────────────────────────────
const sparks = `
  ${heart(596, 108, 1.5, ORANGE)}
  ${heart(430, 372, 1.15, GREEN)}
  ${heart(940, 452, 1.0, ORANGE)}
  <circle cx="560" cy="410" r="9" fill="${WHITE}"/>
  <circle cx="612" cy="60" r="6" fill="${GREEN}"/>
  <circle cx="88" cy="86" r="11" fill="${ORANGE}"/>
  <circle cx="118" cy="430" r="7" fill="${GREEN}"/>`

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  ${halo}
  ${timer}
  ${mark}
  ${chat}
  ${card}
  ${face}
  ${sparks}
</svg>`

fs.mkdirSync(out, { recursive: true })
const file = path.join(out, 'play-feature-graphic.png')
await sharp(Buffer.from(svg)).png().toFile(file)
fs.writeFileSync(path.join(out, 'play-feature-graphic.svg'), svg + '\n')

const { size } = fs.statSync(file)
console.log(`feature graphic → ${file} (${W}×${H}, ${(size / 1024).toFixed(0)} KB)`)
