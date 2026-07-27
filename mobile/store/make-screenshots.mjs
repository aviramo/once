// Phone screenshots for both stores, one per store theme.
//
// Two targets, same four frames, drawn (not upscaled) at each store's size:
//   google/ 1080x1920  — Play Console phone screenshots
//   apple/  1284x2778  — App Store Connect 6.5"/6.7" portrait
//
// Each frame is a Hebrew headline over a drawn phone whose screen is a faithful
// restatement of a real app screen: the current purple-on-beige palette
// (mobile/src/colors.ts), the real dp tokens (mobile/src/tokens.ts) scaled to the
// mockup, the app's own Noto Sans Hebrew faces, and real i18n strings from
// mobile/src/i18n/he.ts. Nothing here invents a colour, a size or a phrase — when
// the app changes, re-read those files and re-run this script.
//
// Rendered by headless Chrome (HTML/CSS, so Hebrew shaping + RTL are the
// browser's job, not a hand-rolled text layout).
//
//   node mobile/store/make-screenshots.mjs
//
// Output: mobile/store/<google|apple>/screenshot-1..4-*.png

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
// Intermediate HTML is a build artefact, not a checked-in asset.
const BUILD = join(tmpdir(), 'once-store-listing')
const MEDIA = join(ROOT, 'web', 'public', 'media')
const FONTS = join(ROOT, 'mobile', 'node_modules', '@expo-google-fonts', 'noto-sans-hebrew')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found for headless rendering')

// ── Palette (mobile/src/colors.ts) ─────────────────────────────────────────
const C = {
  BG: '#F3EEE6',          // beige-1: the page, sheets, popups
  SURFACE: '#FAF6EE',     // beige-3: cards, chips, round buttons
  BORDER: '#E5DFD4',      // beige-2: the one hairline
  INK: '#5C4A94',         // the ONE regular purple: text, headings, actions
  HALF: '#8A7DB2',        // muted purple: hints, the de-emphasised report glyph
  WASH: '#D1C2D9',        // pale purple: mini-chips, soft tiles
  SOFT: 'rgba(92,74,148,0.12)',
  MID: 'rgba(92,74,148,0.32)',
  WHITE: '#FFFFFF',
}

// ── Targets ────────────────────────────────────────────────────────────────
// Each store gets the same four frames DRAWN at its own size — never an
// upscale of the other, so text and glyphs stay crisp in both listings.
const TARGETS = [
  { dir: 'google', W: 1080, H: 1920 },   // Play Console phone screenshots
  { dir: 'apple', W: 1284, H: 2778 },    // App Store Connect 6.5"/6.7" portrait
]

// ── Geometry ───────────────────────────────────────────────────────────────
// The whole phone stays inside the frame: the bottom chrome (heart, report,
// gesture bar) is the point of these shots, so nothing bleeds off the edge.
// The frame is authored in a 1080-wide design space: the headline block and
// the margins scale with the frame's WIDTH, and the phone then takes all the
// height that is left, keeping its 9:19.5 screen. A taller store size gets a
// taller phone, never a stretched one.
const DESIGN_W = 1080
const CAP_BAND = 330    // design-space y of the phone's top edge
const FOOT = 40         // design-space gap under the phone
let W, H, px, BEZEL, PHONE_TOP, PHONE_H, SCREEN_W, SCREEN_H, PHONE_W, RADIUS, U

const useTarget = t => {
  W = t.W; H = t.H
  const s = W / DESIGN_W
  px = n => `${+(n * s).toFixed(1)}px`
  BEZEL = Math.round(12 * s)
  RADIUS = Math.round(52 * s)
  PHONE_TOP = Math.round(CAP_BAND * s)
  PHONE_H = H - PHONE_TOP - Math.round(FOOT * s)
  SCREEN_H = PHONE_H - BEZEL * 2
  SCREEN_W = Math.round(SCREEN_H * 9 / 19.5)            // a 9:19.5 phone
  PHONE_W = SCREEN_W + BEZEL * 2
  // The app is designed against a 360dp-wide phone; every app token below is
  // quoted in dp and converted here, so the mockup can never drift from tokens.ts.
  U = SCREEN_W / 360
}
const dp = n => `${+(n * U).toFixed(1)}px`
const LIFT = () => `0 ${dp(4)} ${dp(8)} rgba(0,0,0,0.25)`   // LIFT_SHADOW at mockup scale

// ── Assets ─────────────────────────────────────────────────────────────────
const b64 = p => readFileSync(p).toString('base64')
const photo = n => `data:image/jpeg;base64,${b64(join(MEDIA, `p${String(n).padStart(2, '0')}.jpg`))}`
const fontFace = (weight, dir) =>
  `@font-face{font-family:Noto;font-weight:${weight};src:url(data:font/ttf;base64,${b64(join(FONTS, dir, `NotoSansHebrew_${dir}.ttf`))}) format('truetype')}`

// ── Glyphs (mobile/src/components/icons.tsx + Chip.tsx, verbatim paths) ────
const svg = (size, body, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ${extra}>${body}</svg>`

const hamburger = c => svg(dp(21),
  `<g stroke="${c}" stroke-width="2" stroke-linecap="round">
     <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
   </g>`)
const shield = c => svg(dp(21),
  `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="${c}" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`)
const heart = c => svg(dp(42),
  `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="${c}" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`)
const pin = c => svg(dp(16),
  `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
   <circle cx="12" cy="9" r="2.5" stroke="${c}" stroke-width="2"/>`)
const kids = c => svg(dp(16),
  `<g stroke="${c}" stroke-width="2" stroke-linecap="round">
     <circle cx="8" cy="7" r="3"/><path d="M2 21v-2a6 6 0 0 1 12 0v2"/>
     <circle cx="17" cy="10" r="2.2"/><path d="M13 21v-1a4 4 0 0 1 8 0v1"/>
   </g>`)
const groups = c => svg(dp(16),
  `<g stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
     <path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
     <path d="M18 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="11" cy="7" r="4"/>
   </g>`)
const close = c => svg(dp(24),
  `<g stroke="${c}" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g>`)

// ── Screen parts ───────────────────────────────────────────────────────────
// Android status bar. Under an RTL locale the clock sits at the START edge
// (physically right); the radios sit opposite it.
const statusBar = (ink, band) => `
  <div class="sbar ${band ? 'band' : ''}" style="--sbink:${ink}">
    <span class="clock">9:41</span>
    <span class="radios">
      <svg width="${dp(15)}" height="${dp(15)}" viewBox="0 0 24 24" fill="${ink}"><path d="M2 20h3v-6H2v6zm5 0h3V9H7v11zm5 0h3V4h-3v16zm5 0h3v-9h-3v9z"/></svg>
      <svg width="${dp(15)}" height="${dp(15)}" viewBox="0 0 24 24" fill="${ink}"><path d="M12 20l10-13a15 15 0 0 0-20 0l10 13z"/></svg>
      <svg width="${dp(22)}" height="${dp(11)}" viewBox="0 0 32 16" fill="none"><rect x="1" y="2" width="26" height="12" rx="3.5" stroke="${ink}" stroke-width="1.6"/><rect x="3.5" y="4.5" width="21" height="7" rx="1.8" fill="${ink}"/><rect x="29" y="6" width="2.5" height="4" rx="1.2" fill="${ink}"/></svg>
    </span>
  </div>`

// A chip label is a sequence of runs: plain text, a tight cluster of pale-purple
// mini-chips (kid ages / the "+N more groups" hint), and — for the family chip —
// a bold status forced onto its own line (buildFamilySegments in FamilyCard.tsx).
const chip = ({ icon, text, dot, badges, after, ownLine, bold, plus }) => `
  <div class="chip${bold ? ' bold' : ''}">
    ${icon ? `<span class="cg">${icon}</span>` : ''}
    <span class="ct">${text}${badges ? badges.map(b => `<b class="badge ltr">${b}</b>`).join('') : ''}${plus ? `<b class="badge ltr">+${plus}</b>` : ''}${after ? `<span class="run">${after}</span>` : ''}${ownLine ? `<span class="brk"></span><span class="run strong">${ownLine}</span>` : ''}</span>
    ${dot ? `<span class="dot"></span>` : ''}
  </div>`

const roundBtn = (cls, bg, glyph, size = 76) =>
  `<div class="rb ${cls}" style="width:${dp(size)};height:${dp(size)};background:${bg}">${glyph}</div>`

const homeBar = `<div class="homebar"></div>`

// One match card: the full-bleed photo with the shell chrome over it.
// Chrome placement is the CLAUDE.md contract — hamburger top-START, name/age
// chip top-END, fact chips bottom-START, small report under them, heart floating
// bottom-END.
const matchCard = ({ src, name, chips, flush }) => `
  <div class="card ${flush ? 'flush' : ''}">
    <img class="hero" src="${src}">
    ${flush ? '' : statusBar(C.WHITE, true)}
    ${flush ? '' : roundBtn('ham', C.SURFACE, hamburger(C.INK), 38)}
    <div class="topend">${chip({ text: name, bold: true })}</div>
    <div class="chips">${chips.map(chip).join('')}</div>
    ${roundBtn('report', C.BG, shield(C.HALF), 38)}
    ${roundBtn('heart', C.SURFACE, heart(C.INK))}
    ${homeBar}
  </div>`

// ── Frames ─────────────────────────────────────────────────────────────────
// Built per target: every part above quotes dp(), which depends on the current
// screen width, so the frames are re-composed for each store size.
const frames = () => [
  {
    file: 'screenshot-1-one-person.png',
    title: 'אדם אחד בכל פעם',
    sub: 'לא קטלוג אינסופי. פרופיל אחד, ומולו החלטה אחת.',
    screen: matchCard({
      src: photo(1),
      name: 'מאיה, 31',
      chips: [{ icon: pin(C.INK), text: "במרחק 1.2 ק\"מ ממך עכשיו", dot: true }],
    }),
  },
  {
    file: 'screenshot-2-real-time.png',
    title: 'בזמן אמת, כאן ועכשיו',
    sub: 'רק מי שנמצא באפליקציה עכשיו. להזמנה יש 10 דקות.',
    // page1 "you sent an invitation" state: the status card (InviteTimerCard)
    // rides ABOVE the card it announces, with the countdown inside it.
    screen: `
      <div class="stack">
        ${statusBar(C.INK, false)}
        ${roundBtn('ham shell', C.SURFACE, hamburger(C.INK), 38)}
        <div class="status">
          <div class="s-head">ההזמנה שלך מחכה לו</div>
          <div class="s-body">ובזמן הזה, הוא לא יקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן.</div>
          <div class="s-timer">08:42</div>
          <div class="btn">${close(C.WHITE)}<span>ביטול הזמנה</span></div>
        </div>
        ${matchCard({
          src: photo(2),
          name: 'יונתן, 38',
          flush: true,
          chips: [{ icon: pin(C.INK), text: 'כאן ועכשיו', dot: true }],
        })}
      </div>`,
  },
  {
    file: 'screenshot-3-communities.png',
    title: 'חברים ומעגלים משותפים',
    sub: 'רואים איזו קבוצה משותפת לכם, עוד לפני ההזמנה.',
    // The card's group chip, tapped: the shared-groups popup (SharedGroupsPopup).
    screen: `
      ${matchCard({
        src: photo(7),
        name: 'שירה, 34',
        chips: [
          { icon: pin(C.INK), text: "במרחק 800 מ' ממך עכשיו", dot: true },
          { icon: groups(C.INK), text: 'הורים בשכונה', plus: 2 },
        ],
      })}
      <div class="sheet">
        <div class="handle"></div>
        <div class="sheet-title">קבוצות משותפות</div>
        <div class="sheet-card">
          <div class="srow"><img class="av" src="${photo(5)}"><div class="stext">
            <div class="sname">הורים בשכונה</div><div class="smeta">מנוהלת על ידי דנה</div><div class="smeta">128 חברים</div>
          </div></div>
          <div class="srow"><img class="av" src="${photo(3)}"><div class="stext">
            <div class="sname">ריצת בוקר בפארק</div><div class="smeta">מנוהלת על ידי איתי</div><div class="smeta">54 חברים</div>
          </div></div>
          <div class="srow"><img class="av" src="${photo(9)}"><div class="stext">
            <div class="sname">בוגרי המכללה</div><div class="smeta">מנוהלת על ידי רותם</div><div class="smeta">312 חברים</div>
          </div></div>
        </div>
        ${homeBar}
      </div>`,
  },
  {
    file: 'screenshot-4-kids-schedule.png',
    title: 'מתחשבים בלו"ז עם הילדים',
    sub: 'מסמנים את הימים עם הילדים, ורואים מי פנוי כשאתם פנויים.',
    screen: matchCard({
      src: photo(5),
      name: 'נועה, 36',
      chips: [
        { icon: pin(C.INK), text: "במרחק 3.1 ק\"מ ממך עכשיו", dot: true },
        { icon: kids(C.INK), text: 'יש לי 2 ילדים', badges: ['6', '9'], after: 'ורוצה עוד', ownLine: 'פנויה בסופ״ש הקרוב' },
      ],
    }),
  },
]

// ── Page ───────────────────────────────────────────────────────────────────
const css = () => `
${fontFace(400, '400Regular')}
${fontFace(600, '600SemiBold')}
${fontFace(800, '800ExtraBold')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${C.BG};font-family:Noto,sans-serif;direction:rtl}
.frame{position:relative;width:${W}px;height:${H}px;background:${C.BG};overflow:hidden}
.cap{padding:${px(74)} ${px(76)} 0}
.cap h1{font-size:${px(74)};font-weight:800;color:${C.INK};line-height:1.14;letter-spacing:${px(-0.5)}}
.cap p{margin-top:${px(22)};font-size:${px(33)};font-weight:400;color:${C.HALF};line-height:1.45;max-width:${px(900)}}

.phone{position:absolute;top:${PHONE_TOP}px;left:${(W - PHONE_W) / 2}px;width:${PHONE_W}px;height:${PHONE_H}px;
  background:${C.INK};border-radius:${BEZEL + RADIUS}px;padding:${BEZEL}px;box-shadow:0 ${px(24)} ${px(60)} rgba(92,74,148,.28)}
.screen{position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:${RADIUS}px;overflow:hidden;background:${C.BG}}
.stack{display:flex;flex-direction:column;height:100%;background:${C.BG}}

/* status bar */
.sbar{position:absolute;top:0;left:0;right:0;height:${dp(44)};display:flex;align-items:center;justify-content:space-between;
  padding:0 ${dp(18)};z-index:5;color:var(--sbink)}
.sbar.band{background:linear-gradient(rgba(92,74,148,.5),rgba(92,74,148,0))}
.sbar .clock{font-size:${dp(14)};font-weight:600;color:var(--sbink)}
.sbar .radios{display:flex;align-items:center;gap:${dp(6)}}
.stack>.sbar{position:relative;flex:none}

/* match card */
.card{position:relative;flex:1;min-height:0;overflow:hidden}
.screen>.card{height:100%}
.card .hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rb{position:absolute;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:${LIFT()};z-index:4}
.rb.ham{top:${dp(52)};inset-inline-start:${dp(16)}}
.rb.ham.shell{position:absolute;top:${dp(52)};z-index:7}
.rb.report{bottom:${dp(16)};inset-inline-start:${dp(16)}}
.rb.heart{bottom:${dp(16)};inset-inline-end:${dp(16)}}
.topend{position:absolute;top:${dp(52)};inset-inline-end:${dp(16)};z-index:4}
.chips{position:absolute;bottom:${dp(16 + 38 + 24)};inset-inline-start:${dp(16)};display:flex;flex-direction:column;
  align-items:flex-start;gap:${dp(8)};max-width:${dp(252)};z-index:3}
.homebar{position:absolute;bottom:${dp(8)};left:50%;transform:translateX(-50%);width:${dp(108)};height:${dp(4)};
  border-radius:${dp(2)};background:rgba(92,74,148,.35);z-index:6}

/* chip (mobile/src/components/Chip.tsx: radius 12, pad 8/16, gap 8, 14sp semibold) */
.chip{display:flex;align-items:flex-start;gap:${dp(8)};background:${C.SURFACE};border-radius:${dp(12)};
  padding:${dp(8)} ${dp(16)};box-shadow:${LIFT()}}
.chip .cg{display:flex;align-items:center;height:${dp(20)}}
.chip .ct{font-size:${dp(14)};line-height:${dp(20)};font-weight:600;color:${C.INK}}
.chip.bold .ct{font-weight:800}
.chip .dot{width:${dp(7)};height:${dp(7)};border-radius:999px;background:${C.INK};margin-top:${dp(7)};flex:none}
.badge{display:inline-block;background:${C.WASH};border-radius:${dp(12)};padding:0 ${dp(4)};margin-inline-start:${dp(4)};
  font-size:${dp(12)};line-height:${dp(20)};font-weight:600;color:${C.INK};vertical-align:top}
.badge.ltr{direction:ltr}
.cluster{display:inline}
.run{margin-inline-start:${dp(8)}}
.run.strong{font-weight:800}
.brk{display:block;height:0}

/* status card (home.tsx InviteTimerCard) */
.status{background:${C.BG};padding:${dp(24)} ${dp(16)};text-align:center}
.s-head{font-size:${dp(18)};line-height:${dp(25)};font-weight:800;color:${C.INK};margin-bottom:${dp(8)}}
.s-body{font-size:${dp(18)};line-height:${dp(25)};color:${C.INK};opacity:.9}
.s-timer{margin-top:${dp(16)};font-size:${dp(32)};line-height:${dp(45)};font-weight:800;color:${C.INK};font-variant-numeric:tabular-nums}
.btn{margin-top:${dp(16)};height:${dp(56)};border-radius:${dp(12)};background:${C.INK};color:${C.WHITE};
  display:flex;align-items:center;justify-content:center;gap:${dp(8)};font-size:${dp(16)};font-weight:600}

/* shared-groups popup (SharedGroupsPopup over a BottomSheet — no backdrop dim:
   the sheet is transparent over the screen and floats on SHEET_SHADOW alone) */
.sheet{position:absolute;left:0;right:0;bottom:0;background:${C.BG};border-radius:${dp(20)} ${dp(20)} 0 0;
  padding:0 ${dp(16)} ${dp(28)};z-index:9;box-shadow:0 ${dp(-4)} ${dp(24)} rgba(0,0,0,.12)}
.handle{width:${dp(48)};height:${dp(4)};border-radius:${dp(2)};background:${C.MID};margin:${dp(16)} auto}
.sheet-title{font-size:${dp(18)};font-weight:800;color:${C.INK};text-align:center;padding-bottom:${dp(12)}}
.sheet-card{background:${C.SURFACE};border-radius:${dp(12)};overflow:hidden}
.srow{display:flex;align-items:center;gap:${dp(16)};padding:${dp(16)};border-top:1px solid ${C.BORDER}}
.srow:first-child{border-top:0}
.av{width:${dp(44)};height:${dp(44)};border-radius:999px;object-fit:cover;flex:none}
.stext{display:flex;flex-direction:column;gap:${dp(4)}}
.sname{font-size:${dp(16)};font-weight:800;color:${C.INK}}
.smeta{font-size:${dp(14)};color:${C.HALF}}
.sheet .homebar{bottom:${dp(8)}}
`

const page = f => `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>${css()}</style>
<div class="frame">
  <div class="cap"><h1>${f.title}</h1><p>${f.sub}</p></div>
  <div class="phone"><div class="screen">${f.screen}</div></div>
</div>`

// ── Render ─────────────────────────────────────────────────────────────────
mkdirSync(BUILD, { recursive: true })
for (const t of TARGETS) {
  useTarget(t)
  const dir = join(HERE, t.dir)
  mkdirSync(dir, { recursive: true })
  for (const f of frames()) {
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
