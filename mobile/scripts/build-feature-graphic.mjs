import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────
// Google Play FEATURE GRAPHIC — 1024×500, no text, flat colour only.
//
// This is ALSO the site's social share card: the same drawing is written to
// web/public/og-image.png, so every page's og:image / twitter:image (all six
// static pages already declare 1024×500) shows exactly the store art. One
// drawing, both consumers — build-icons.mjs no longer writes an og-image.
//
// One abstract image for one idea: ONE-ON-ONE, IN REAL TIME.
//   the brand's "1" stands as the hero, ringed by a live countdown and pulse
//   rings radiating out (the moment is happening now, and it is timed); a few
//   hearts drift from it toward a single profile card — the one person the
//   moment brings, with a heart on it. No chat, no deck: the idea, abstracted.
//
// The "1" glyph geometry is PARSED from build-icons.mjs and the palette from
// src/colors.ts, so the store art can never drift from the real app icon or
// the app's colours. Run: `node scripts/build-feature-graphic.mjs`.
// ─────────────────────────────────────────────────────────────────────────

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const out = path.join(root, 'store')
const web = path.join(root, '..', 'web', 'public')

// ── Palette: the app's own tokens, never re-typed ────────────────────────────
const colorsSrc = fs.readFileSync(path.join(root, 'src', 'colors.ts'), 'utf8')
const token = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`))
  if (!m) throw new Error(`colors.ts: token ${name} not found (or no longer a plain hex)`)
  return m[1]
}
const PAGE = token('PAGE') // the page tint — the same ground the app icon sits on
const WHITE = token('WHITE') // the card body, and the ink on the purple heart
const INK = token('INK') // the one purple: the '1', the hearts, the silhouette
const INK_MUTED = token('INK_MUTED') // muted purple

const GROUND = token('INK_PALE') // pale purple: pulse rings, photo wash, card lip

// ── The "1" glyph: the real icon geometry, parsed from build-icons.mjs ────────
// (that file runs file-writing side effects on import, so we read it as text —
// its GLYPH/STROKE stay the single source of truth for the mark.)
const iconSrc = fs.readFileSync(path.join(root, 'scripts', 'build-icons.mjs'), 'utf8')
const GLYPH = iconSrc.match(/const GLYPH = '([^']+)'/)?.[1]
const STROKE = Number(iconSrc.match(/const STROKE = (\d+)/)?.[1])
if (!GLYPH || !STROKE) throw new Error('build-icons.mjs: could not parse GLYPH / STROKE')

const W = 1024
const H = 500

// Hero "1" centre (it is drawn from a 1024 icon canvas centred on 512,512).
const HERO = { x: 360, y: 250, s: 0.5 }
const one = `<g transform="translate(${HERO.x},${HERO.y}) scale(${HERO.s}) translate(-512,-512)" fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPH}"/></g>`

// ── Live pulse: rings radiating out of the mark, in real time ─────────────────
const ripple = [200, 250, 300, 350]
  .map(
    (r, i) =>
      `<circle cx="${HERO.x}" cy="${HERO.y}" r="${r}" fill="none" stroke="${GROUND}" stroke-width="${10 - i * 1.6}"/>`,
  )
  .join('')

// ── Countdown arc: the moment is timed. A purple sweep open at the top, with a
// short muted remainder, hugging the mark. The "once" edge, abstracted.
const arc = (from, to, r, color, w) => {
  const p = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(HERO.x + r * Math.cos(a)).toFixed(2)},${(HERO.y + r * Math.sin(a)).toFixed(2)}`
  }
  const large = to - from > 180 ? 1 : 0
  return `<path d="M ${p(from)} A ${r},${r} 0 ${large} 1 ${p(to)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
}
const countdown = arc(22, 300, 172, INK, 11) + arc(310, 350, 172, INK_MUTED, 11)

// ── The one profile card the moment brings ───────────────────────────────────
// A single card (never a deck): one person at a time. A pale-purple photo wash
// with a purple silhouette, two lines, and the purple heart on it.
const CARD = { x: 712, y: 96, w: 196, h: 308, r: 26 }
const ccx = CARD.x + CARD.w / 2
const photo = { x: CARD.x + 16, y: CARD.y + 16, w: CARD.w - 32, h: 150, r: 18 }
const head = { x: ccx, y: photo.y + 66, r: 30 }
const line = (y, w, fill) =>
  `<rect x="${CARD.x + 22}" y="${y}" width="${w}" height="12" rx="6" fill="${fill}"/>`
const heart = (x, y, s, fill) =>
  `<path transform="translate(${x},${y}) scale(${s}) translate(-12,-12)" fill="${fill}" d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`

const card = `
  <g transform="rotate(-4 ${ccx} ${CARD.y + CARD.h / 2})">
    <rect x="${CARD.x - 6}" y="${CARD.y - 6}" width="${CARD.w + 12}" height="${CARD.h + 12}" rx="${CARD.r + 6}" fill="${GROUND}"/>
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${WHITE}"/>
    <rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${photo.r}" fill="${GROUND}"/>
    <clipPath id="ph"><rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${photo.r}"/></clipPath>
    <g clip-path="url(#ph)">
      <circle cx="${head.x}" cy="${head.y}" r="${head.r}" fill="${INK}"/>
      <path d="M ${head.x - 58} ${photo.y + photo.h + 4} a 58,52 0 0 1 116,0 z" fill="${INK}"/>
    </g>
    ${line(CARD.y + 186, 104, INK)}
    ${line(CARD.y + 212, 140, INK_MUTED)}
    ${line(CARD.y + 234, 92, GROUND)}
    <circle cx="${CARD.x + CARD.w - 6}" cy="${CARD.y + CARD.h - 46}" r="32" fill="${INK}"/>
    ${heart(CARD.x + CARD.w - 6, CARD.y + CARD.h - 46, 1.4, WHITE)}
  </g>`

// ── Hearts drifting from the mark toward the card ─────────────────────────────
const hearts = `
  ${heart(556, 322, 1.5, INK)}
  ${heart(628, 210, 2.0, INK)}
  ${heart(674, 330, 1.2, INK_MUTED)}`

// ── A few quiet marks for air (kept clear of the card) ────────────────────────
const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const sparks = `
  ${dot(150, 96, 11, INK)}
  ${dot(198, 142, 6, INK)}
  ${dot(112, 402, 8, INK_MUTED)}
  ${dot(624, 96, 7, INK)}
  ${dot(600, 418, 6, INK_MUTED)}
  ${dot(966, 430, 8, INK)}`

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${PAGE}"/>
  ${ripple}
  ${countdown}
  ${one}
  ${hearts}
  ${card}
  ${sparks}
</svg>`

fs.mkdirSync(out, { recursive: true })
const file = path.join(out, 'play-feature-graphic.png')
const png = await sharp(Buffer.from(svg)).png().toBuffer()
fs.writeFileSync(file, png)
fs.writeFileSync(path.join(out, 'play-feature-graphic.svg'), svg + '\n')

// The site's share card is the same image, served from web/public.
const og = path.join(web, 'og-image.png')
fs.writeFileSync(og, png)

console.log(
  `feature graphic → ${file} + ${og} (${W}×${H}, ${(png.length / 1024).toFixed(0)} KB)`,
)
