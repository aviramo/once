# Once — marketing

Everything made **around** the product rather than in it. Nothing here is the app and
nothing here is the site: no build reads this folder, `.easignore` keeps it out of the
EAS upload and `.vercelignore` keeps it out of the deployment. It is where the store
listing, the printed card and the portfolio page live, so a thing made for people who
have not opened Once yet is never filed among the code that runs it.

| Folder | What it is |
|---|---|
| [store/](store/) | The Play + App Store listing pack: copy in both languages, the six screenshots per store per language, the feature graphic, the 512 icon, and the generators that draw them. Its own [README](store/README.md) is the upload procedure. |
| [postcard/](postcard/) | The printed A6 card that is handed out. |
| [portfolio/](portfolio/) | A single 1200×1200 page presenting the product, drawn to be exported as one image. |

## The postcard

[postcard/postcard.html](postcard/postcard.html) — an A6 card, both faces, authored as a
web page so the Hebrew is shaped by a real text engine rather than by a layout tool.

- **Artboard 111×154 mm** = the A6 trim of 105×148 plus 3 mm of bleed on every side. The
  page draws its own trim and safe-area guides, toggled by the button at the top; the
  toggle, the captions and the guides all disappear in `@media print`, so printing the
  page from a browser at 100% gives the press exactly the two faces.
- Every measurement is stated in **real millimetres** (`--mm`, a container query unit),
  so a number in the CSS is the same number on the card.
- Its palette is the app's own (`mobile/src/colors.ts`), with one darker purple added for
  body text on white — this is ink on paper, not a screen, and the app's body ink is too
  light to hold at 3 mm.
- The front is the statement and the back is the four things the app does, ending in the
  QR band. **The QR points at `once-lake.vercel.app/scan`**, which is a real page in the
  site (`web/public/scan.html`) and counts the devices that scan the card, Android and
  iPhone apart, before sending each one to its own store.

The card is the one asset here that leaves the screen, so treat the trim and the bleed as
load-bearing: text inside the pink safe line survives a press that cuts a millimetre off.

## The card's deliverable is the PDF

**Every change to `postcard/postcard.html` ends with a new PDF** (user directive 2026-08-15):

```
node marketing/postcard/make-pdf.mjs
```

The HTML is the source and the PDF is the thing that goes to a press, so leaving the two
out of step means the file somebody sends to print is the one nobody proof-read. It takes
a few seconds; run it even for a comma.

The rendering is verified against the real file rather than trusted: `pypdfium2` (already
installed) rasterizes the PDF, which is how the current numbers below were measured.

- **111.17 × 154.18 mm per page.** Chrome rounds the sheet up to whole CSS pixels, so it
  overshoots the requested 111 × 154 by ~0.17 mm. Harmless: the bleed grows, the trim does not.
- **The ground stops ~0.12 mm short of the right edge and ~0.18 mm short of the bottom.**
  That hairline sits 3 mm outside the trim and can never appear on the finished card. A
  `box-shadow` spread was tried to cover it and made the gap ~2 mm **worse** — Chrome
  shortens the box by the shadow when it paginates. Do not reintroduce it.
- **Fonts are embedded TrueType subsets**, not Type 3. That is what the local-faces
  substitution in `make-pdf.mjs` buys: rendered off the Google Fonts link, Chrome cannot
  embed the variable font and re-draws every glyph as a procedure instead.
- **Fully vector** — zero raster images, the QR included.

## Regenerating

The store art is generated from the app's own tokens and lands in `store/`:

```
node mobile/scripts/build-icons.mjs            # store/once-512.png (plus every app + web icon)
node mobile/scripts/build-feature-graphic.mjs  # store/play-feature-graphic.{svg,png}
node marketing/store/make-screenshots.mjs      # store/{google,apple}/{he,en}/screenshot-*.png
```

The screenshot builder reads the app's Noto Sans Hebrew faces out of
`mobile/node_modules`, so `npm install` in `mobile/` has to have run before it does.

## What is not here

`store/apple-review/` is on disk and deliberately **not in git** — those are real captures
of the owner's live account, family photos included. Do not `git add` that folder.
