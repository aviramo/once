// Phone screenshots for both stores, one per store theme.
//
// THESE ARE REAL CAPTURES (user directive 2026-08-02). What stood here until
// then was a DRAWING of the app — a hand-built HTML restatement of each screen,
// which had to be re-read off `colors.ts` / `tokens.ts` / `MatchCard.tsx` every
// time the app moved and was wrong the moment it did not. The frames below take
// a PNG captured off the running app (emulator-5554, 1080x2400) and set it in a
// headline + phone frame drawn at each store's own size. The only thing this
// file draws now is the frame: the Hebrew headline, the phone shell, the ground.
//
// The screen inside the frame comes out at ~1040px wide at App Store size and
// ~690px at Play size, so a 1080-wide capture is DOWNSCALED into both — never
// blown up. A capture taken at a higher device resolution is welcome; a lower
// one is not.
//
// Capturing (what produced the files in shots/):
//   adb -s emulator-5554 shell screencap -p -d <display-id> /sdcard/c.png
//   adb -s emulator-5554 pull /sdcard/c.png mobile/store/shots/<name>.png
// The app must be in Hebrew, and the demo account's data has to be rich and
// TRUE of what the app shows: a candidate standing at the same point (so the
// proximity row reads "כאן ועכשיו" rather than a distance in kilometres), a
// shared circle, height/smoking, kids with ages and a weekend that is free.
//
//   node mobile/store/make-screenshots.mjs
//
// Output: mobile/store/<google|apple>/screenshot-1..6-*.png

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// Intermediate HTML is a build artefact, not a checked-in asset.
const BUILD = join(tmpdir(), 'once-store-listing')
const SHOTS = join(HERE, 'shots')
const FONTS = join(HERE, '..', 'node_modules', '@expo-google-fonts', 'noto-sans-hebrew')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found for headless rendering')

// ── Palette (mobile/src/colors.ts, verbatim) ───────────────────────────────
// Purple + white, nothing else (user directive 2026-07-28 — no beige, no grey).
const C = {
  PAGE: '#F1EEF8',       // the page itself: INK at ~9% over white
  INK: '#5C4A94',        // the ONE regular purple
  INK_MUTED: '#8A7DB2',  // muted but still purple: the sub-line
}

// ── Targets ────────────────────────────────────────────────────────────────
// Each store gets the same frames DRAWN at its own size — never an upscale of
// the other, so the headline stays crisp in both listings.
const TARGETS = [
  { dir: 'google', W: 1080, H: 1920 },   // Play Console phone screenshots
  { dir: 'apple', W: 1284, H: 2778 },    // App Store Connect 6.5"/6.7" portrait
]

// ── Geometry ───────────────────────────────────────────────────────────────
// The whole phone stays inside the frame: the dock along its foot is the point
// of these shots, so nothing bleeds off the edge. The frame is authored in a
// 1080-wide design space — the headline block and the margins scale with the
// frame's WIDTH, and the phone takes all the height that is left, keeping the
// CAPTURE's own aspect so no pixel of the screen is cropped or stretched.
const DESIGN_W = 1080
const CAP_BAND = 330    // design-space y of the phone's top edge
const FOOT = 40         // design-space gap under the phone
const SHOT_W = 1080     // the capture's own size (emulator-5554)
const SHOT_H = 2400
let W, H, px, BEZEL, PHONE_TOP, PHONE_H, SCREEN_W, SCREEN_H, PHONE_W, RADIUS

const useTarget = t => {
  W = t.W; H = t.H
  const s = W / DESIGN_W
  px = n => `${+(n * s).toFixed(1)}px`
  BEZEL = Math.round(12 * s)
  RADIUS = Math.round(52 * s)
  PHONE_TOP = Math.round(CAP_BAND * s)
  PHONE_H = H - PHONE_TOP - Math.round(FOOT * s)
  SCREEN_H = PHONE_H - BEZEL * 2
  SCREEN_W = Math.round(SCREEN_H * SHOT_W / SHOT_H)   // the capture's own aspect
  PHONE_W = SCREEN_W + BEZEL * 2
}

// ── Assets ─────────────────────────────────────────────────────────────────
const b64 = p => readFileSync(p).toString('base64')
const shot = name => `data:image/png;base64,${b64(join(SHOTS, `${name}.png`))}`
// The app bundles exactly two text faces — 400 Regular and 500 Medium, its one
// emphasis (src/fonts.ts) — plus 900 Black for the wordmark. The store headline
// takes the Black; the sub-line is the Regular.
const fontFace = (weight, dir) =>
  `@font-face{font-family:Noto;font-weight:${weight};src:url(data:font/ttf;base64,${b64(join(FONTS, dir, `NotoSansHebrew_${dir}.ttf`))}) format('truetype')}`

// ── Frames ─────────────────────────────────────────────────────────────────
// One capture each, in the order the product happens: a face, an invitation
// sent, the clock running on it, an invitation arriving, what we already share,
// and the conversation it ends in. THREE of them are a popup standing open,
// because that is where the app says what it has to say — the message, what it
// costs and the one thing to do about it.
const FRAMES = [
  {
    file: 'screenshot-1-one-person.png',
    shot: 'f1_watch',
    title: 'אדם אחד בכל פעם',
    sub: 'לא קטלוג אינסופי. פרופיל אחד, ומולו החלטה אחת',
  },
  {
    file: 'screenshot-2-invite.png',
    shot: 'f2a_invite_confirm',
    title: 'הזמנה אחת, ובלעדית',
    sub: 'שולחים הזמנה לצ׳אט, ורואים בדיוק מה היא פותחת ומה היא עולה',
  },
  {
    file: 'screenshot-3-timer.png',
    shot: 'f2_waiting_msg',
    title: 'עשר דקות, והשעון רץ',
    sub: 'כל עוד ההזמנה פתוחה היא שמורה רק לכם. השעון יושב על הכרטיס עצמו',
  },
  {
    file: 'screenshot-4-incoming.png',
    shot: 'f3_accept',
    title: 'הזמנה שהגיעה אליכם',
    sub: 'רואים מי הזמין, מה האישור פותח וכמה הוא עולה, ומחליטים',
  },
  {
    file: 'screenshot-5-circles.png',
    shot: 'f4_circles',
    title: 'חברים ומעגלים משותפים',
    sub: 'רואים מה כבר משותף לכם, עוד לפני ההזמנה',
  },
  {
    file: 'screenshot-6-chat.png',
    shot: 'f5_chat',
    title: 'וזה נגמר בשיחה אחת',
    sub: 'צ׳אט אישי וסגור לשניכם בלבד, בלי עשרים שיחות במקביל',
  },
]

// ── Page ───────────────────────────────────────────────────────────────────
const css = () => `
${fontFace(400, '400Regular')}
${fontFace(900, '900Black')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${C.PAGE};font-family:Noto,sans-serif;direction:rtl}
.frame{position:relative;width:${W}px;height:${H}px;background:${C.PAGE};overflow:hidden}
.cap{padding:${px(74)} ${px(76)} 0}
.cap h1{font-size:${px(74)};font-weight:900;color:${C.INK};line-height:1.14;letter-spacing:${px(-0.5)}}
.cap p{margin-top:${px(22)};font-size:${px(33)};font-weight:400;color:${C.INK_MUTED};line-height:1.45;max-width:${px(900)}}

.phone{position:absolute;top:${PHONE_TOP}px;left:${(W - PHONE_W) / 2}px;width:${PHONE_W}px;height:${PHONE_H}px;
  background:${C.INK};border-radius:${BEZEL + RADIUS}px;padding:${BEZEL}px;box-shadow:0 ${px(24)} ${px(60)} rgba(92,74,148,.28)}
.screen{position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:${RADIUS}px;overflow:hidden;background:${C.PAGE}}
.screen img{display:block;width:100%;height:100%;object-fit:cover}
`

const page = f => `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>${css()}</style>
<div class="frame">
  <div class="cap"><h1>${f.title}</h1><p>${f.sub}</p></div>
  <div class="phone"><div class="screen"><img src="${shot(f.shot)}"></div></div>
</div>`

// ── Render ─────────────────────────────────────────────────────────────────
mkdirSync(BUILD, { recursive: true })
for (const t of TARGETS) {
  useTarget(t)
  const dir = join(HERE, t.dir)
  mkdirSync(dir, { recursive: true })
  for (const f of FRAMES) {
    const html = join(BUILD, `${t.dir}-${f.file.replace('.png', '.html')}`)
    writeFileSync(html, page(f), 'utf8')
    const out = join(dir, f.file)
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--window-size=${W},${H}`,
      '--virtual-time-budget=4000', '--default-background-color=00000000',
      `--screenshot=${out}`, `file:///${html.replace(/\\/g, '/')}`,
    ], { stdio: 'pipe' })
    console.log(`wrote ${out}  (${t.W}x${t.H})`)
  }
}
