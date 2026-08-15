// Phone screenshots for both stores, in both languages.
//
// THESE ARE REAL CAPTURES (user directive 2026-08-02). What stood here until
// then was a DRAWING of the app — a hand-built HTML restatement of each screen,
// which had to be re-read off `colors.ts` / `tokens.ts` / `MatchCard.tsx` every
// time the app moved and was wrong the moment it did not. The frames below take
// a PNG captured off the running app (emulator-5554, 1080x2400) and set it in a
// headline + phone frame drawn at each store's own size. The only thing this
// file draws now is the frame: the headline, the phone shell and the ground. The
// capture goes in UNTOUCHED, its own Android status bar included (user directive
// 2026-08-02).
//
// FOUR SETS: {google, apple} × {he, en}. The captures themselves are per
// LANGUAGE (the app was run in each), and the headline copy follows.
//
//   node marketing/store/make-screenshots.mjs
//
// Output: marketing/store/<google|apple>/<he|en>/screenshot-1..6-*.png
//
// Capturing (what produced the files in shots/<lang>/):
//   adb -s emulator-5554 shell screencap -p -d <display-id> /sdcard/c.png
//   adb -s emulator-5554 pull /sdcard/c.png marketing/store/shots/<lang>/<name>.png
// Take them at the device's OWN density and font scale (`wm density reset`,
// `settings put system font_scale 1.0`) — the emulator is often left at a large
// setting for testing, and the store is not the place to show it. The demo state
// has to be rich and TRUE of what the app shows: a candidate standing at the same
// point (so the proximity row reads "here and now" rather than a distance in
// kilometres), a shared circle, height/smoking, kids with ages and a free weekend.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// Intermediate HTML is a build artefact, not a checked-in asset.
const BUILD = join(tmpdir(), 'once-store-listing')
const SHOTS = join(HERE, 'shots')
// The app's own faces, so Hebrew shapes here exactly as it does on the phone.
const FONTS = join(HERE, '..', '..', 'mobile', 'node_modules', '@expo-google-fonts', 'noto-sans-hebrew')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found for headless rendering')

// Render only one frame, for a look before the whole set is drawn:
//   node make-screenshots.mjs --only apple:he:1
// (`indexOf` guarded: without it a run with no flag reads argv[-1 + 1], which is
// node's own path — truthy, matching nothing, and every frame is skipped.)
const ONLY_AT = process.argv.indexOf('--only')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1]
  || (ONLY_AT >= 0 ? process.argv[ONLY_AT + 1] : '')

// ── Palette (mobile/src/colors.ts, verbatim) ───────────────────────────────
// Purple + white, nothing else (user directive 2026-07-28 — no beige, no grey).
const C = {
  PAGE: '#F1EEF8',       // the page itself: INK at ~9% over white
  INK: '#5C4A94',        // the ONE regular purple
  INK_MUTED: '#8A7DB2',  // muted but still purple: the sub-line
  WHITE: '#FFFFFF',
}

// ── Targets ────────────────────────────────────────────────────────────────
// Each store gets every frame DRAWN at its own size — never an upscale of the
// other, so the headline stays crisp in both listings.
const TARGETS = [
  { dir: 'google', W: 1080, H: 1920 },              // Play Console phone screenshots
  { dir: 'apple', W: 1284, H: 2778 },               // App Store Connect 6.5"/6.7" portrait
]

const LOCALES = ['he', 'en']

// ── Geometry ───────────────────────────────────────────────────────────────
// The whole phone stays inside the frame: the dock along its foot is the point
// of these shots, so nothing bleeds off the edge. The frame is authored in a
// 1080-wide design space — the headline block and the margins scale with the
// frame's WIDTH, and the phone takes all the height that is left, keeping the
// CAPTURE's own aspect so no pixel of the screen is cropped or stretched.
const DESIGN_W = 1080
// The headline's band, and the phone's top edge with it, is the SAME in every
// frame of a set — six shots standing side by side in a listing are one object,
// and a phone that starts lower on the frames whose title happens to wrap reads
// as six different mock-ups. So the band is sized for the WORST case a headline
// can be (two lines of title + two of sub) and the block is centred in it: a
// one-line title sits in the same band as a two-line one rather than being
// followed by a taller phone. It used to be 400 — exactly one line's worth —
// and every wrapped title pushed its sub-line under the phone's top edge
// (user report 2026-08-03).
const CAP_BAND = 520    // design-space y of the phone's top edge (the headline's room)
const FOOT = 36         // design-space gap under the phone
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
const shot = (lang, name) => `data:image/png;base64,${b64(join(SHOTS, lang, `${name}.png`))}`
// The app bundles exactly two text faces — 400 Regular and 500 Medium, its one
// emphasis (src/fonts.ts) — plus 900 Black for the wordmark. The store headline
// takes the Black; the sub-line is the Regular.
const fontFace = (weight, dir) =>
  `@font-face{font-family:Noto;font-weight:${weight};src:url(data:font/ttf;base64,${b64(join(FONTS, dir, `NotoSansHebrew_${dir}.ttf`))}) format('truetype')}`

// (An iPhone status bar was drawn over the capture's Android one for an hour on
// 2026-08-02 — a notch, a clock and the radios on a band of the app's own
// purple. Three shapes were tried and the user turned all of them down: the
// capture is used AS IT IS, top bar included, in both stores. Do not edit that
// strip again.)

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
    he: { title: 'אדם אחד בכל פעם', sub: 'לא קטלוג אינסופי. פרופיל אחד, ומולו החלטה אחת' },
    en: { title: 'One person at a time', sub: 'No endless catalog. One profile, and one decision' },
  },
  {
    file: 'screenshot-2-invite.png',
    shot: 'f2_invite',
    he: { title: 'הזמנה אחת, ובלעדית', sub: 'רואים בדיוק מה ההזמנה פותחת ומה היא עולה' },
    en: { title: 'One invitation, exclusive', sub: 'You see exactly what it opens and what it costs' },
  },
  {
    file: 'screenshot-3-timer.png',
    shot: 'f3_timer',
    he: { title: 'עשר דקות, והשעון רץ', sub: 'כל עוד ההזמנה פתוחה היא שמורה רק לכם' },
    en: { title: 'Ten minutes, and it ticks', sub: 'While it is open, the two of you are held for it' },
  },
  {
    file: 'screenshot-4-incoming.png',
    shot: 'f4_incoming',
    he: { title: 'הזמנה שהגיעה אליכם', sub: 'רואים מי הזמין, ומחליטים' },
    en: { title: 'An invitation that arrived', sub: 'You see who asked, and you decide' },
  },
  {
    file: 'screenshot-5-circles.png',
    shot: 'f5_circles',
    he: { title: 'חברים ומעגלים משותפים', sub: 'רואים מה כבר משותף לכם, עוד לפני ההזמנה' },
    en: { title: 'Friends and shared circles', sub: 'See what you already share, before the invitation' },
  },
  {
    file: 'screenshot-6-chat.png',
    shot: 'f6_chat',
    he: { title: 'וזה נגמר בשיחה אחת', sub: 'צ׳אט אישי וסגור לשניכם בלבד' },
    en: { title: 'It ends in one conversation', sub: 'A private chat, for the two of you only' },
  },
]

// ── Page ───────────────────────────────────────────────────────────────────
const css = rtl => `
${fontFace(400, '400Regular')}
${fontFace(900, '900Black')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${C.PAGE};font-family:Noto,sans-serif;direction:${rtl ? 'rtl' : 'ltr'}}
.frame{position:relative;width:${W}px;height:${H}px;background:${C.PAGE};overflow:hidden}
.cap{height:${PHONE_TOP}px;padding:${px(64)} ${px(72)} ${px(56)};
  display:flex;flex-direction:column;justify-content:center}
.cap h1{font-size:${px(96)};font-weight:900;color:${C.INK};line-height:1.12;letter-spacing:${px(-1)}}
.cap p{margin-top:${px(24)};font-size:${px(44)};font-weight:400;color:${C.INK_MUTED};line-height:1.4}

.phone{position:absolute;top:${PHONE_TOP}px;left:${(W - PHONE_W) / 2}px;width:${PHONE_W}px;height:${PHONE_H}px;
  background:${C.INK};border-radius:${BEZEL + RADIUS}px;padding:${BEZEL}px;box-shadow:0 ${px(24)} ${px(60)} rgba(92,74,148,.28)}
.screen{position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:${RADIUS}px;overflow:hidden;background:${C.PAGE}}
.screen>img{display:block;width:100%;height:100%;object-fit:cover}
`

const page = (f, t, lang) => {
  const rtl = lang === 'he'
  const src = shot(lang, f.shot)
  const copy = f[lang]
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>${css(rtl)}</style>
<div class="frame">
  <div class="cap"><h1>${copy.title}</h1><p>${copy.sub}</p></div>
  <div class="phone"><div class="screen"><img src="${src}"></div></div>
</div>`
}

// ── Render ─────────────────────────────────────────────────────────────────
mkdirSync(BUILD, { recursive: true })
for (const t of TARGETS) {
  useTarget(t)
  for (const lang of LOCALES) {
    const dir = join(HERE, t.dir, lang)
    mkdirSync(dir, { recursive: true })
    FRAMES.forEach((f, i) => {
      if (ONLY && ONLY !== `${t.dir}:${lang}:${i + 1}`) return
      const html = join(BUILD, `${t.dir}-${lang}-${f.file.replace('.png', '.html')}`)
      writeFileSync(html, page(f, t, lang), 'utf8')
      const out = join(dir, f.file)
      execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1', `--window-size=${W},${H}`,
        '--virtual-time-budget=4000', '--default-background-color=00000000',
        `--screenshot=${out}`, `file:///${html.replace(/\\/g, '/')}`,
      ], { stdio: 'pipe' })
      console.log(`wrote ${out}  (${t.W}x${t.H})`)
    })
  }
}
