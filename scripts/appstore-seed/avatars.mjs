// Flat-vector illustrated portraits for the App Store review environment.
//
// Every test account gets 2-3 pictures of the SAME drawn character (same face,
// hair, skin) on a different background, in different clothes and at a
// different crop, so a card's photo reel reads as one person photographed
// three times rather than three strangers. Nothing here is a photograph of
// anybody: the whole portrait is composed from paths.
//
// Deterministic: seed -> character. Re-running produces byte-identical art.
import crypto from 'node:crypto'

// ── palette ────────────────────────────────────────────────────────────────
// Backgrounds sit in the app's own purple/warm family so a card never fights
// the UI around it.
const BACKS = [
  '#EDE7F8', '#E4DCF4', '#F2E9F7', '#E8E2F2', '#F5EDE4', '#EFE6DC',
  '#E3ECF3', '#DCE8F2', '#E8F1E9', '#DFEDE2', '#F7E9E9', '#F3E3E8',
]
const SKINS = ['#F2D3BC', '#E8C39E', '#D9A57C', '#C68A5E', '#A2673F', '#7A4A2B', '#F7DFCB', '#B77B4E']
const HAIRS = ['#2B2118', '#4A3524', '#6B4A2E', '#8C6239', '#B07A3E', '#D9B26A', '#7E7E86', '#C9C6CC', '#3A3A44', '#5C2E24']
const CLOTHES = ['#5C4A94', '#6E5CA8', '#4A6FA5', '#3F8A7E', '#8A5A7A', '#C07A4A', '#3F5166', '#7A8A5A', '#A54A5A', '#4A4A5C']

const rnd = seed => {
  let h = crypto.createHash('sha256').update(String(seed)).digest()
  let i = 0
  return () => {
    if (i >= h.length) { h = crypto.createHash('sha256').update(h).digest(); i = 0 }
    return h[i++] / 256
  }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]

/** The invariant part of a person: face, hair, features. */
export function character(seed, isMale) {
  const r = rnd(seed)
  const hairStyle = isMale
    ? pick(r, ['short', 'buzz', 'curly', 'sidepart', 'bald', 'afro', 'short', 'sidepart'])
    : pick(r, ['long', 'bun', 'ponytail', 'wavy', 'curly', 'bob', 'long', 'wavy'])
  return {
    skin: pick(r, SKINS),
    hair: pick(r, HAIRS),
    hairStyle,
    beard: isMale ? pick(r, ['none', 'none', 'stubble', 'full', 'moustache', 'goatee']) : 'none',
    glasses: r() < 0.3,
    brow: 6 + Math.floor(r() * 6),
    smile: 0.5 + r() * 0.9,
    eyeGap: 62 + Math.floor(r() * 12),
    faceW: 142 + Math.floor(r() * 20),
    faceH: 166 + Math.floor(r() * 22),
    earring: !isMale && r() < 0.35,
  }
}

// ── pieces ─────────────────────────────────────────────────────────────────
const hairPath = (c, W) => {
  const { hair: col, faceW: rx, faceH: ry } = c
  const cx = 400, cy = 430
  const top = cy - ry
  switch (c.hairStyle) {
    case 'bald':
      return ''
    case 'buzz':
      return `<path d="M${cx - rx - 4} ${cy - 20} a${rx + 4} ${ry + 4} 0 0 1 ${2 * (rx + 4)} 0 z" fill="${col}" opacity="0.9"/>`
    case 'short':
      return `<path d="M${cx - rx - 8} ${cy - 6} c0 -${ry} ${rx * 0.5} -${ry + 40} ${rx + 8} -${ry + 40} c${rx * 0.6} 0 ${rx + 8} ${ry * 0.3} ${rx + 8} ${ry + 34} c-30 -70 -${rx * 0.4} -96 -${rx + 6} -78 c-${rx * 0.7} 22 -${rx * 0.9} 40 -${rx + 10} 84 z" fill="${col}"/>`
    case 'sidepart':
      return `<path d="M${cx - rx - 8} ${cy - 30} c-6 -${ry + 30} ${rx * 0.4} -${ry + 60} ${rx + 10} -${ry + 52} c${rx} 8 ${rx + 6} ${ry * 0.5} ${rx + 4} ${ry + 20} c-18 -58 -60 -84 -${rx} -74 c-52 6 -${rx * 0.8} 44 -${rx + 4} 106 z" fill="${col}"/>`
    case 'curly': {
      let s = ''
      for (let i = 0; i < 13; i++) {
        const a = Math.PI + (i / 12) * Math.PI
        s += `<circle cx="${(cx + Math.cos(a) * (rx + 6)).toFixed(1)}" cy="${(cy - 24 + Math.sin(a) * (ry + 2)).toFixed(1)}" r="${34 - (i % 3) * 5}" fill="${col}"/>`
      }
      return s
    }
    case 'afro':
      return `<circle cx="${cx}" cy="${cy - 46}" r="${rx + 46}" fill="${col}"/>`
    case 'bob':
      return `<path d="M${cx - rx - 16} ${cy + 96} c-14 -${ry + 80} ${rx * 0.3} -${ry + 70} ${rx + 16} -${ry + 70} c${rx * 0.9} 0 ${rx + 22} 40 ${rx + 16} ${ry + 70} c-8 -${ry * 0.6} -26 -${ry * 0.5} -${rx * 0.55} -${ry * 0.72} c-${rx * 0.6} -18 -${rx * 1.3} 6 -${rx + 16} ${ry * 0.7} z" fill="${col}"/>`
    // The two long styles are ONE mass behind the head -- a rounded slab from
    // the crown down past the shoulders. Drawn flat and symmetric on purpose:
    // strand-by-strand shapes read as noise at card size.
    case 'long': {
      const w = rx + 36
      return `<path d="M${cx - w} 900 L${cx - w} ${cy - 40} A${w} ${w} 0 0 1 ${cx + w} ${cy - 40} L${cx + w} 900 Z" fill="${col}"/>`
    }
    case 'wavy': {
      const w = rx + 44
      return `<path d="M${cx - w} 700 L${cx - w} ${cy - 30} A${w} ${w} 0 0 1 ${cx + w} ${cy - 30} L${cx + w} 700 q-${w / 2} 44 -${w} 0 q-${w / 2} -44 -${w} 0 Z" fill="${col}"/>`
    }
    case 'ponytail':
      return `<path d="M${cx + rx - 10} ${cy - 40} c70 10 96 90 74 200 c-8 40 -60 34 -56 -6 c8 -80 -6 -130 -40 -152 z" fill="${col}"/>`
        + `<path d="M${cx - rx - 10} ${cy - 10} c-4 -${ry + 40} ${rx * 0.4} -${ry + 56} ${rx + 10} -${ry + 56} c${rx * 0.9} 0 ${rx + 18} ${ry * 0.3} ${rx + 12} ${ry + 40} c-24 -70 -${rx * 0.5} -92 -${rx + 4} -78 c-${rx * 0.6} 14 -${rx * 0.9} 44 -${rx + 12} 96 z" fill="${col}"/>`
    case 'bun':
      return `<circle cx="${cx}" cy="${top - 46}" r="52" fill="${col}"/>`
        + `<path d="M${cx - rx - 8} ${cy - 10} c-4 -${ry + 40} ${rx * 0.4} -${ry + 52} ${rx + 8} -${ry + 52} c${rx * 0.9} 0 ${rx + 16} ${ry * 0.3} ${rx + 10} ${ry + 40} c-24 -66 -${rx * 0.5} -88 -${rx + 2} -74 c-${rx * 0.6} 14 -${rx * 0.9} 42 -${rx + 10} 92 z" fill="${col}"/>`
    default:
      return ''
  }
}

/** The cap of hair over the crown, for the styles whose mass is drawn BEHIND
 *  the head (long, wavy) and would otherwise leave a bare scalp. */
const crownPath = (c) => {
  const { hair: col, faceW: rx, faceH: ry } = c
  const cx = 400, cy = 430
  return `<path d="M${cx - rx - 6} ${cy - 4} c-2 -${ry + 30} ${rx * 0.4} -${ry + 54} ${rx + 6} -${ry + 54} c${rx * 0.95} 0 ${rx + 12} ${ry * 0.3} ${rx + 8} ${ry + 40} c-26 -72 -${rx * 0.5} -96 -${rx + 2} -80 c-${rx * 0.62} 16 -${rx * 0.92} 46 -${rx + 8} 98 z" fill="${col}"/>`
}

const beardPath = (c) => {
  const { beard: b, hair: col, faceW: rx, faceH: ry } = c
  const cx = 400, cy = 430
  if (b === 'none') return ''
  if (b === 'moustache') return `<path d="M${cx - 36} ${cy + 68} q36 -16 36 -1 q0 -15 36 1 q-16 16 -36 9 q-20 7 -36 -9 z" fill="${col}"/>`
  if (b === 'goatee') return `<path d="M${cx - 30} ${cy + 104} q30 -12 60 0 q-6 52 -30 58 q-24 -6 -30 -58 z" fill="${col}" opacity="0.95"/>`
    + `<path d="M${cx - 36} ${cy + 68} q36 -16 36 -1 q0 -15 36 1 q-16 16 -36 9 q-20 7 -36 -9 z" fill="${col}"/>`
  const op = b === 'stubble' ? 0.35 : 1
  return `<path d="M${cx - rx} ${cy + 10} c4 ${ry * 0.72} ${rx * 0.5} ${ry * 0.78} ${rx} ${ry * 0.78} c${rx * 0.5} 0 ${rx - 4} -${ry * 0.06} ${rx} -${ry * 0.78} c-10 ${ry * 0.5} -${rx * 0.35} ${ry * 0.34} -${rx} ${ry * 0.34} c-${rx * 0.65} 0 -${rx * 0.9} ${ry * 0.16} -${rx} -${ry * 0.34} z" fill="${col}" opacity="${op}"/>`
}

/**
 * One picture of a character. `variant` changes only what a second photo of
 * the same person would change: the background, the clothes and the crop.
 */
export function portrait(c, variant, seed) {
  const r = rnd(`${seed}:${variant}`)
  const back = pick(r, BACKS)
  const cloth = pick(r, CLOTHES)
  // Six crops, so a profile can carry up to six pictures of the same person
  // and no two of them are framed alike.
  const zoom = [1.06, 1.2, 0.98, 1.13, 1.02, 1.26][variant % 6]
  const shift = [0, -16, 12, -6, 20, -24][variant % 6]
  const { skin, faceW: rx, faceH: ry, eyeGap: g } = c
  const cx = 400, cy = 430
  const shade = '#00000010'

  const eye = x => `<ellipse cx="${x}" cy="${cy + 4}" rx="15" ry="${c.glasses ? 13 : 16}" fill="#FFFFFF"/>`
    + `<circle cx="${x}" cy="${cy + 6}" r="8.5" fill="#2A2230"/>`
    + `<circle cx="${x + 3}" cy="${cy + 2}" r="2.6" fill="#FFFFFF"/>`
  const brow = (x, dir) => `<path d="M${x - 22} ${cy - 34 + dir * 2} q22 -${c.brow} 44 ${dir * 3}" stroke="${c.hair}" stroke-width="9" fill="none" stroke-linecap="round"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<rect width="800" height="1000" fill="${back}"/>
<circle cx="400" cy="${430 + shift}" r="330" fill="#FFFFFF" opacity="0.45"/>
<g transform="translate(400 ${430 + shift}) scale(${zoom}) translate(-400 ${-430 - shift})">
  <g transform="translate(0 ${shift})">
    ${['long', 'wavy'].includes(c.hairStyle) ? hairPath(c) : ''}
    <path d="M320 ${cy + ry - 52} h160 v${790 - (cy + ry - 52)} h-160 z" fill="${skin}"/>
    <path d="M320 ${cy + ry - 52} h160 v42 c-46 32 -114 32 -160 0 z" fill="${shade}"/>
    <path d="M100 1000 C100 792 190 706 300 690 C324 742 476 742 500 690 C610 706 700 792 700 1000 Z" fill="${cloth}"/>
    <path d="M300 690 C324 742 476 742 500 690 C486 684 470 680 452 678 C440 706 360 706 348 678 C330 680 314 684 300 690 Z" fill="#FFFFFF" opacity="0.5"/>
    <ellipse cx="252" cy="${cy + 30}" rx="26" ry="32" fill="${skin}"/>
    <ellipse cx="548" cy="${cy + 30}" rx="26" ry="32" fill="${skin}"/>
    ${c.earring ? `<circle cx="252" cy="${cy + 62}" r="9" fill="#D9B26A"/><circle cx="548" cy="${cy + 62}" r="9" fill="#D9B26A"/>` : ''}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${skin}"/>
    ${beardPath(c)}
    ${brow(cx - g, 1)}
    ${brow(cx + g, -1)}
    ${eye(cx - g)}
    ${eye(cx + g)}
    ${c.glasses ? `<g stroke="#3A3344" stroke-width="7" fill="none">
      <rect x="${cx - g - 34}" y="${cy - 22}" width="68" height="54" rx="20"/>
      <rect x="${cx + g - 34}" y="${cy - 22}" width="68" height="54" rx="20"/>
      <path d="M${cx - g + 34} ${cy + 2} h${2 * g - 68}"/>
      <path d="M${cx - g - 34} ${cy - 4} l-38 -14"/>
      <path d="M${cx + g + 34} ${cy - 4} l38 -14"/>
    </g>` : ''}
    <path d="M${cx - 2} ${cy + 18} q-16 34 4 40 q12 4 20 -4" stroke="#00000028" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M${cx - 40} ${cy + 84} q40 ${34 * c.smile} 80 0" stroke="#8A4A54" stroke-width="10" fill="none" stroke-linecap="round"/>
    ${['long', 'wavy'].includes(c.hairStyle) ? crownPath(c) : hairPath(c)}
  </g>
</g>
</svg>`
}
