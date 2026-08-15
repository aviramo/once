// The postcard's press file.
//
//   node marketing/postcard/make-pdf.mjs
//
// Output: once-postcard-a6-bleed.pdf beside this file — two pages, one per
// face, each 111×154 mm: the A6 trim of 105×148 plus 3 mm of bleed all round.
//
// The card is authored as a web page (postcard.html) so the Hebrew is shaped
// and justified by a real text engine, and headless Chrome is what turns it
// into the file a press takes. Everything about the page geometry — the paper
// size, the zero margin, which face lands on which page — is stated in that
// file's `@media print` block and NOT here: `preferCSSPageSize` hands the
// decision to the document, so the PDF can never disagree with what Ctrl+P
// shows in the browser.
//
// Driven over the DevTools protocol rather than through `--print-to-pdf`,
// for one reason: that flag cannot say `printBackground`, and the whole front
// face IS a background. The CSS insists too (`print-color-adjust:exact`), so
// a hand-print from the browser comes out right as well; this belt and these
// braces are cheap and the failure they guard against is a stack of cards
// printed white.

import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// Which card to print. `node make-pdf.mjs postcard2.html` prints the variant,
// to its own PDF beside it — the two versions are never one file overwritten by
// whichever was rendered last.
const CARD = process.argv[2] || 'postcard.html'
const SOURCE = join(HERE, CARD)
const OUT = join(HERE, `once-${CARD.replace(/\.html$/, '')}-a6-bleed.pdf`)

// Same list the screenshot generator carries (marketing/store/make-screenshots.mjs).
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge binary found for headless rendering')
if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`)

const PORT = 9339
const profile = mkdtempSync(join(tmpdir(), 'once-postcard-'))

// ── The faces, embedded, and why the press file does not use Google Fonts ──
// postcard.html links the webfont, which is right for a page anybody can open.
// A press file may not: that API serves a VARIABLE font, and a variable
// instance is the case Chrome's PDF backend cannot embed — it falls back to
// Type 3 fonts, i.e. every glyph re-drawn as a procedure. That prints, but it
// is the shape prepress tools flag, and the text stops being text.
//
// So the file that goes to print is rendered from a copy whose webfont link is
// replaced by the app's OWN static faces, the very TTFs the store screenshots
// embed (marketing/store/make-screenshots.mjs). Chrome subsets and embeds
// those as ordinary TrueType, the card is rendered with no network at all, and
// the letters on the card are the letters in the app.
const FACES = join(HERE, '..', '..', 'mobile', 'node_modules', '@expo-google-fonts', 'noto-sans-hebrew')
const WEIGHTS = [
  [400, '400Regular'],
  [500, '500Medium'],
  [700, '700Bold'],
  [900, '900Black'],
]

function printableCopy() {
  const face = (weight, dir) => {
    const ttf = join(FACES, dir, `NotoSansHebrew_${dir}.ttf`)
    if (!existsSync(ttf)) throw new Error(`missing face ${ttf} — run npm install in mobile/`)
    return `@font-face{font-family:'Noto Sans Hebrew';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(ttf).toString('base64')}) format('truetype')}`
  }
  const html = readFileSync(SOURCE, 'utf8')
  const stripped = html.replace(/^[ \t]*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm, '')
  if (stripped === html) throw new Error('postcard.html no longer links the webfont — check before trusting this copy')
  const out = join(profile, 'postcard-print.html')
  writeFileSync(out, stripped.replace('<style>', `<style>\n${WEIGHTS.map(([w, d]) => face(w, d)).join('\n')}\n`))
  return out
}

const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Chrome writes its port the moment it is listening, but the endpoint is what
// actually answers, so poll that rather than guessing at a delay.
//
// It is the TAB's socket that is wanted, from /json/list — the browser-wide
// one that /json/version hands out speaks no `Page.*` at all, and answers a
// print with "'Page.enable' wasn't found".
async function endpoint() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      if (r.ok) {
        const tab = (await r.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
        if (tab) return tab.webSocketDebuggerUrl
      }
    } catch {}
    await sleep(100)
  }
  throw new Error('Chrome did not open a page target on its debugging port')
}

function session(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let id = 0
  const open = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    const seat = pending.get(msg.id)
    if (!seat) return
    pending.delete(msg.id)
    msg.error ? seat.rej(new Error(msg.error.message)) : seat.res(msg.result)
  })
  return {
    ready: open,
    close: () => ws.close(),
    send: (method, params = {}) =>
      new Promise((res, rej) => {
        pending.set(++id, { res, rej })
        ws.send(JSON.stringify({ id, method, params }))
      }),
  }
}

try {
  const cdp = session(await endpoint())
  await cdp.ready
  await cdp.send('Page.enable')

  const loaded = new Promise((res) => {
    const done = () => res()
    cdp.send('Page.setLifecycleEventsEnabled', { enabled: true })
    setTimeout(done, 8000) // a font that never arrives must not hang the build
    const poll = setInterval(async () => {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState === "complete" && document.fonts.status === "loaded"',
      })
      if (result.value) {
        clearInterval(poll)
        done()
      }
    }, 100)
  })
  await cdp.send('Page.navigate', { url: pathToFileURL(printableCopy()).href })
  await loaded

  // The paper is stated HERE, in inches, rather than left to `preferCSSPageSize`:
  // taking it off the @page rule, Chrome rounds the box up to whole CSS pixels
  // and the card comes out 111.17×154.18 mm — a sixth of a millimetre of slop
  // in a file whose whole point is that 111×154 means 111×154.
  const { data } = await cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: false,
    paperWidth: 111 / 25.4,
    paperHeight: 154 / 25.4,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  })
  writeFileSync(OUT, Buffer.from(data, 'base64'))
  cdp.close()

  const kb = Math.round(Buffer.from(data, 'base64').length / 1024)
  console.log(`postcard → ${OUT}  (111×154 mm incl. 3 mm bleed, ${kb} KB)`)

  // The press boxes are part of BUILDING the file, not a second command someone
  // has to remember: a PDF that says nothing about where the blade goes is not
  // a press file. See press-boxes.py for what it sets and why.
  const boxes = spawnSync('python', [join(HERE, 'press-boxes.py'), OUT], { encoding: 'utf8' })
  if (boxes.status === 0) process.stdout.write(boxes.stdout)
  else {
    console.warn('press boxes NOT set — the PDF is renderable but not press-ready:')
    console.warn((boxes.stderr || boxes.error?.message || '').trim().split('\n').slice(-3).join('\n'))
    console.warn('fix: pip install pikepdf, then re-run')
  }
} finally {
  chrome.kill()
  // Windows keeps the profile's files open for a moment after the process
  // goes, so a failed sweep is a temp folder left behind, never a failed run.
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
