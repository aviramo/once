// ─────────────────────────────────────────────────────────────────────────
// Google Play store screenshots — Hebrew. Six 1080×1920 marketing panels
// that tell the Once story, each with a Hebrew headline over a brand-accurate
// phone mockup. Brand tokens are read from src/colors.ts (single source of
// truth); Rubik Hebrew is embedded from Google Fonts so the headless Chrome
// render is fully offline and self-contained.
//
//   node scripts/../store/build-screenshots.mjs      (writes the HTML)
//   then render each with headless Chrome (see build-screenshots.ps1 output).
// ─────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const root = path.resolve(here, '..')
const outDir = path.join(here, 'screenshots')
fs.mkdirSync(outDir, { recursive: true })

// ── Brand tokens: parse src/colors.ts, never re-declare ────────────────────
const colorsSrc = fs.readFileSync(path.join(root, 'src', 'colors.ts'), 'utf8')
const hex = (name) => {
  const m = colorsSrc.match(new RegExp(`export const ${name}\\s*=\\s*'(#[0-9A-Fa-f]{6})'`))
  if (!m) throw new Error(`colors.ts: ${name} not a plain hex`)
  return m[1]
}
const BG = hex('BG')               // #F3EEE6 page beige
const SURFACE = hex('SURFACE')     // #FAF6EE lifted beige (chips, buttons)
const INK = hex('INK')             // #5C4A94 the one purple: text, actions
const PRESSED = hex('PRESSED')     // #33265B deep step (headlines only here)
const GREEN_HALF = hex('GREEN_HALF') // #8A7DB2 muted purple
const ORANGE = hex('ORANGE')       // #6C3FB2 brand mark
const GROUND = hex('PRIMARY_GROUND') // #D1C2D9 pale purple ground
const BORDER = hex('BORDER_SOFT')  // #E5DFD4 hairline
const PHOTO = '#E4DEF0'            // pale-purple photo well (matches feature graphic)

// ── Rubik Hebrew, embedded ─────────────────────────────────────────────────
async function embedRubik() {
  const chars =
    'אבגדהוזחטיכךלמםנןסעפףצץקרשת׳״' +
    "'\"" +
    '0123456789' +
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '.,:%°+()-?!/ '
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
  const faces = []
  for (const w of [400, 500, 700]) {
    const url =
      `https://fonts.googleapis.com/css2?family=Rubik:wght@${w}` +
      `&text=${encodeURIComponent(chars)}`
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text()
    const woffUrl = css.match(/url\((https:\/\/[^)]+)\)/)[1]
    const woff = Buffer.from(await (await fetch(woffUrl)).arrayBuffer()).toString('base64')
    faces.push(
      `@font-face{font-family:'Rubik';font-style:normal;font-weight:${w};` +
        `src:url(data:font/woff2;base64,${woff}) format('woff2');}`,
    )
  }
  return faces.join('\n')
}

// ── SVG icon set (24×24 viewBox), stroked or filled per glyph ───────────────
const HEART = 'M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
function icon(name, color, size = 24) {
  const fill = (d) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`
  const stroke = (inner) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
  switch (name) {
    case 'heart': return fill(HEART)
    case 'clock': return stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
    case 'pin': return stroke('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>')
    case 'kids': return stroke('<circle cx="9" cy="7" r="3"/><path d="M3 21v-1a6 6 0 0 1 12 0v1"/><path d="M16 11a3 3 0 1 0 0-6"/><path d="M21 21v-1a6 6 0 0 0-4-5.6"/>')
    case 'groups': return stroke('<circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>')
    case 'menu': return stroke('<path d="M4 7h16M4 12h16M4 17h16"/>')
    case 'close': return stroke('<path d="M6 6l12 12M18 6L6 18"/>')
    case 'send': return fill('M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5z')
    case 'search': return stroke('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
    case 'shield': return stroke('<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"/>')
    default: return ''
  }
}

// A soft-lift shadow, the same fabric RoundButton + Chip cast over a photo.
const LIFT = '0 6px 16px rgba(51,38,91,0.20)'

// ── Building blocks (return HTML strings) ──────────────────────────────────
// Brand-style figure: pale-purple well + a purple head/shoulders silhouette,
// exactly the placeholder language of the store feature graphic.
function figure({ ink = INK, well = PHOTO } = {}) {
  // A unified head-and-shoulders bust that fills the tall frame like a studio
  // portrait: head in the upper third, shoulders spreading to the edges. The
  // viewBox aspect matches the on-screen photo well so nothing is cropped.
  return `<div class="photo" style="background:${well}">
    <svg viewBox="0 0 463 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <circle cx="231" cy="330" r="150" fill="${ink}"/>
      <path d="M231 470 C120 470 70 560 55 700 C45 820 40 930 38 1000 L424 1000 C422 930 417 820 407 700 C392 560 342 470 231 470 Z" fill="${ink}"/>
    </svg>
  </div>`
}

function chip(label, glyph, { solid = false, bold = false } = {}) {
  const bg = solid ? INK : SURFACE
  const fg = solid ? '#FFFFFF' : INK
  const g = glyph ? `<span class="cg">${icon(glyph, fg, 30)}</span>` : ''
  return `<div class="chip ${solid ? 'solid' : ''}" style="background:${bg};color:${fg}">
    ${g}<span style="font-weight:${bold ? 700 : 500}">${label}</span></div>`
}

function roundBtn(glyph, { solid = false, size = 116 } = {}) {
  const bg = solid ? INK : SURFACE
  const fg = solid ? '#FFFFFF' : INK
  return `<div class="round" style="width:${size}px;height:${size}px;background:${bg}">
    ${icon(glyph, fg, size * 0.5)}</div>`
}

// The device: a deep-purple bezel around a beige screen holding `inner`.
function phone(inner) {
  return `<div class="phone"><div class="screen">${inner}</div></div>`
}

// ── Screen contents ────────────────────────────────────────────────────────
function homeReady() {
  return `<div class="app" style="background:${BG}">
    <div class="statusband"></div>
    <div class="ham">${icon('menu', INK, 40)}</div>
    <div class="ready">
      <div class="readyHead">מי שכאן,<br>כאן באמת</div>
      <div class="bigfind">${roundBtn('search', { solid: true, size: 200 })}</div>
      <div class="readyHint">הקש כדי למצוא מישהו עכשיו</div>
    </div>
  </div>`
}

function profile({ name, chips, floating = 'heart', bio, overlay = '' } = {}) {
  return `<div class="app">
    ${figure()}
    <div class="scrim"></div>
    <div class="ham">${icon('menu', INK, 40)}</div>
    <div class="topEnd">${chip(name, null, { bold: true })}</div>
    <div class="infoLeft">${chips.map((c) => chip(c.label, c.glyph, c.opts || {})).join('')}</div>
    ${bio ? `<div class="bioCard">${bio}</div>` : ''}
    ${overlay}
    <div class="floatAction">${roundBtn(floating)}</div>
  </div>`
}

function statusCard(title, sub, ring) {
  return `<div class="statusCard">
    ${ring ? `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="${BORDER}" stroke-width="7"/><circle cx="50" cy="50" r="44" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-dasharray="276" stroke-dashoffset="90" transform="rotate(-90 50 50)"/></svg><span>${ring}</span></div>` : ''}
    <div class="scTitle">${title}</div>
    ${sub ? `<div class="scSub">${sub}</div>` : ''}
  </div>`
}

function chat() {
  const mine = (t) => `<div class="row me"><div class="bubble me">${t}</div></div>`
  const theirs = (t) => `<div class="row them"><div class="bname">מאיה</div><div class="bubble them">${t}</div></div>`
  return `<div class="app" style="background:${BG}">
    <div class="statusband"></div>
    <div class="chatClose">${icon('close', INK, 38)}</div>
    <div class="chatHead">
      ${chip('סיום שיחה', null, { solid: true })}
      ${chip('מאיה, 29', null, { bold: true })}
    </div>
    <div class="thread">
      ${theirs('היי! ראיתי שאנחנו ממש קרובים 🙂')}
      ${mine('נכון, איזה כיף. מתחשק לך קפה עכשיו?')}
      ${theirs('בשמחה. יש מקום נחמד ליד')}
      ${mine('מעולה, יוצא עכשיו')}
    </div>
    <div class="composer">
      <div class="field">כתוב הודעה...</div>
      <div class="sendBtn">${icon('send', '#FFFFFF', 38)}</div>
    </div>
  </div>`
}

// ── The six panels ──────────────────────────────────────────────────────────
const SCREENS = [
  {
    file: '01-concept',
    big: 'מפגש אחד<br>בזמן אמת',
    sub: "לא קטלוג. לא צ'אטים אינסופיים.",
    mock: homeReady(),
  },
  {
    file: '02-one-on-one',
    big: 'אדם אחד<br>מקבל מקום',
    sub: 'כשנוצר חיבור, הוא בלעדי לשניכם.',
    mock: profile({
      name: 'מאיה, 29',
      chips: [
        { label: 'מחוברת עכשיו', glyph: 'clock' },
        { label: 'יש לי ילד אחד', glyph: 'kids' },
      ],
      bio: 'אוהבת בקרים שקטים, ריצות על החוף וקפה טוב. מחפשת משהו אמיתי, בלי משחקים.',
    }),
  },
  {
    file: '03-screen-to-reality',
    big: 'מהמסך<br>למציאות',
    sub: 'כשיש סנכרון, נפגשים כאן ועכשיו.',
    mock: chat(),
  },
  {
    file: '04-you-decide',
    big: 'אתם<br>שולטים',
    sub: 'בוחרים מתי לחפש ואת מי להזמין.',
    mock: profile({
      name: 'דניאל, 32',
      chips: [
        { label: "2 ק\"מ ממך", glyph: 'pin' },
        { label: 'רק אתם', glyph: 'groups' },
      ],
      overlay: statusCard('ההזמנה נשלחה', 'ממתינים לתשובה', '2:00'),
    }),
  },
  {
    file: '05-mutual-consent',
    big: 'הסכמה<br>הדדית תמיד',
    sub: 'רק כששניכם מעוניינים, נוצר קשר.',
    mock: profile({
      name: 'נועה, 27',
      chips: [{ label: 'ממש כאן', glyph: 'pin' }],
      overlay: statusCard('רוצה להיפגש?', 'הזמנה חדשה בשבילך', ''),
    }),
  },
  {
    file: '06-nearby',
    big: 'קרוב אליך,<br>ממש עכשיו',
    sub: 'אנשים שנמצאים כאן, בזמן אמת.',
    mock: profile({
      name: 'יעל, 30',
      chips: [
        { label: 'ממש ליד הבית שלך', glyph: 'pin' },
        { label: 'מחוברת עכשיו', glyph: 'clock' },
      ],
    }),
  },
]

function page(font, s) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
${font}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;font-family:'Rubik','Segoe UI',Arial,sans-serif}
body{background:${GROUND};position:relative}
/* brand ring motif behind the phone */
.rings{position:absolute;left:50%;bottom:-260px;transform:translateX(-50%);width:1400px;height:1400px;opacity:.55}
.rings circle{fill:none;stroke:${BG};}
.mini{position:absolute;fill:${INK};opacity:.5}
.head{position:absolute;top:96px;left:0;right:0;text-align:center;padding:0 70px;z-index:3}
.big{font-weight:700;font-size:104px;line-height:1.06;color:${PRESSED};letter-spacing:-1px}
.sub{margin-top:26px;font-weight:500;font-size:40px;line-height:1.3;color:${INK}}
.brand{position:absolute;top:36px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;z-index:3}
.brand .mark{width:52px;height:52px;border-radius:14px;background:${BG};display:flex;align-items:center;justify-content:center}
.brand .mk{font-weight:700;font-size:40px;color:${ORANGE};line-height:1}
.brand .nm{font-weight:700;font-size:34px;color:${PRESSED};letter-spacing:1px}
/* phone */
.phone{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);
  width:624px;height:1300px;background:${PRESSED};border-radius:78px;padding:20px;
  box-shadow:0 40px 90px rgba(51,38,91,.35);z-index:2}
.screen{width:100%;height:100%;border-radius:60px;overflow:hidden;position:relative;background:${BG}}
.app{position:absolute;inset:0;background:${GROUND}}
.photo{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center}
.photo svg{width:100%;height:100%}
.scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(51,38,91,.28),rgba(51,38,91,0) 42%)}
.statusband{position:absolute;top:0;left:0;right:0;height:44px}
.ham{position:absolute;top:34px;right:30px;width:72px;height:72px;border-radius:24px;background:${SURFACE};
  display:flex;align-items:center;justify-content:center;box-shadow:${LIFT}}
.topEnd{position:absolute;top:34px;left:30px}
.infoLeft{position:absolute;right:30px;bottom:40px;display:flex;flex-direction:column;gap:18px;align-items:flex-start}
.chip{display:inline-flex;align-items:center;gap:12px;padding:16px 26px;border-radius:26px;
  font-size:30px;box-shadow:${LIFT};white-space:nowrap}
.chip.solid{box-shadow:${LIFT}}
.cg{display:flex;align-items:center}
.round{border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:${LIFT}}
.floatAction{position:absolute;left:30px;bottom:36px}
.bioCard{position:absolute;left:26px;right:26px;bottom:250px;background:${BG};border-radius:34px;
  padding:30px 32px;font-size:30px;line-height:1.42;color:${INK};box-shadow:${LIFT}}
/* status card overlay (invite states) */
.statusCard{position:absolute;left:40px;right:40px;top:50%;transform:translateY(-50%);
  background:${BG};border-radius:44px;padding:52px 40px;text-align:center;box-shadow:0 30px 70px rgba(51,38,91,.35)}
.scTitle{font-weight:700;font-size:52px;color:${PRESSED}}
.scSub{margin-top:16px;font-size:34px;color:${INK}}
.ring{width:150px;height:150px;margin:0 auto 30px;position:relative}
.ring svg{width:100%;height:100%}
.ring span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-weight:700;font-size:44px;color:${INK}}
/* ready state */
.ready{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:70px}
.readyHead{font-weight:700;font-size:72px;line-height:1.12;text-align:center;color:${PRESSED}}
.readyHint{font-size:32px;color:${GREEN_HALF};font-weight:500}
/* chat */
.chatClose{position:absolute;top:60px;right:30px;width:72px;height:72px;border-radius:24px;background:${SURFACE};
  display:flex;align-items:center;justify-content:center;box-shadow:${LIFT};z-index:2}
.chatHead{position:absolute;top:66px;left:30px;display:flex;gap:16px;align-items:center;z-index:2}
.thread{position:absolute;top:190px;bottom:170px;left:0;right:0;padding:20px 30px;display:flex;
  flex-direction:column;gap:26px;justify-content:flex-end}
.row{display:flex}
.row.me{justify-content:flex-start}
.row.them{justify-content:flex-end;flex-direction:column;align-items:flex-end}
.bname{font-size:24px;color:${GREEN_HALF};margin:0 10px 6px 0;font-weight:500}
.bubble{max-width:78%;padding:22px 28px;border-radius:34px;font-size:31px;line-height:1.34}
.bubble.them{background:${GROUND};color:${INK};border-top-right-radius:12px}
.bubble.me{background:${INK};color:#fff;border-top-left-radius:12px}
.composer{position:absolute;bottom:36px;left:30px;right:30px;display:flex;gap:18px;align-items:center}
.field{flex:1;background:${SURFACE};border-radius:36px;padding:26px 30px;font-size:30px;color:${GREEN_HALF};box-shadow:${LIFT}}
.sendBtn{width:84px;height:84px;border-radius:50%;background:${INK};display:flex;align-items:center;justify-content:center;box-shadow:${LIFT}}
</style></head>
<body>
  <svg class="rings" viewBox="0 0 1400 1400"><circle cx="700" cy="700" r="360" stroke-width="9"/><circle cx="700" cy="700" r="500" stroke-width="8"/><circle cx="700" cy="700" r="640" stroke-width="7"/></svg>
  <svg class="mini" style="top:150px;right:90px" width="70" height="70" viewBox="0 0 24 24"><path d="${HEART}"/></svg>
  <svg class="mini" style="top:640px;left:70px;opacity:.35" width="52" height="52" viewBox="0 0 24 24"><path d="${HEART}"/></svg>
  <div class="brand"><div class="mark"><span class="mk">1</span></div><span class="nm">Once</span></div>
  <div class="head"><div class="big">${s.big}</div><div class="sub">${s.sub}</div></div>
  ${phone(s.mock)}
</body></html>`
}

const font = await embedRubik()
for (const s of SCREENS) {
  fs.writeFileSync(path.join(outDir, `${s.file}.html`), page(font, s))
}
console.log('wrote', SCREENS.length, 'html panels to', outDir)

// ── Render each panel to a 1080×1920 PNG (Google Play phone spec) ───────────
// Headless Chrome renders the embedded Rubik + RTL text pixel-perfectly. The
// window size is the exact export size at device-scale 1.
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const guesses = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ]
  return guesses.find((g) => fs.existsSync(g))
}
const chrome = findChrome()
if (!chrome) {
  console.log('HTML written, but Chrome not found — set CHROME_PATH to render PNGs.')
} else {
  for (const s of SCREENS) {
    const html = path.join(outDir, `${s.file}.html`)
    const png = path.join(outDir, `${s.file}.png`)
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1920',
      '--default-background-color=FFFFFFFF',
      `--screenshot=${png}`, `file:///${html.replace(/\\/g, '/')}`,
    ], { stdio: 'ignore' })
  }
  console.log('rendered', SCREENS.length, 'PNGs (1080×1920):')
  console.log(SCREENS.map((s) => `  store/screenshots/${s.file}.png`).join('\n'))
}
