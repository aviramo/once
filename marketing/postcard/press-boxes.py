"""Stamp the press boxes onto the card's PDF.

    python marketing/postcard/press-boxes.py <file.pdf>

Chrome can render the card but it cannot say what a printer needs to know about
the sheet, so this is the step that turns a correct-looking PDF into a file a
press can impose without asking questions. Two things are set:

MediaBox, cropped to EXACTLY 111 x 154 mm.
    Chrome rounds the sheet up to whole CSS pixels, so it comes out 111.17 x
    154.18 - about a sixth of a millimetre too big on each axis, with the card
    inside it left flush to the top-left. That leaves a hairline of unpainted
    paper down the right edge and along the bottom. Trimming the box by exactly
    that overshoot removes the hairline (the artwork now runs past the box on
    those sides, which is what bleed IS) and makes the page the size it claims.

TrimBox, 3 mm inside it: the A6 105 x 148 the blade actually cuts to.
    Without it the 3 mm of bleed is indistinguishable from part of the design,
    and a printer has to be told in an email what the file should say itself.
    BleedBox and CropBox are set to the full sheet for the same reason.

Everything is stated in millimetres below and converted once, so the numbers
here are the numbers on the card.
"""

import sys
from pathlib import Path

import pikepdf

MM = 72.0 / 25.4          # points per millimetre
SHEET_W, SHEET_H = 111.0, 154.0   # the artboard: A6 trim plus 3 mm bleed all round
BLEED = 3.0

path = Path(sys.argv[1])
pdf = pikepdf.open(path, allow_overwriting_input=True)

for page in pdf.pages:
    x0, y0, x1, y1 = (float(v) for v in page.MediaBox)
    over_w = (x1 - x0) - SHEET_W * MM
    over_h = (y1 - y0) - SHEET_H * MM
    if over_w < -0.01 or over_h < -0.01:
        raise SystemExit(f"{path.name}: page is SMALLER than {SHEET_W}x{SHEET_H} mm, refusing to stretch it")

    # The card sits flush to the top-left of Chrome's oversized sheet, so the
    # slack is at the right (x1) and at the bottom, which in PDF coordinates is
    # y0 - the origin is bottom-left.
    media = [x0, y0 + over_h, x1 - over_w, y1]
    trim = [media[0] + BLEED * MM, media[1] + BLEED * MM,
            media[2] - BLEED * MM, media[3] - BLEED * MM]

    page.MediaBox = pikepdf.Array(media)
    page.CropBox = pikepdf.Array(media)
    page.BleedBox = pikepdf.Array(media)
    page.TrimBox = pikepdf.Array(trim)

pdf.save(path.with_suffix(".tmp.pdf"))
pdf.close()
path.with_suffix(".tmp.pdf").replace(path)

with pikepdf.open(path) as out:
    box = [float(v) for v in out.pages[0].MediaBox]
    trim = [float(v) for v in out.pages[0].TrimBox]
    print(
        f"press boxes set on {len(out.pages)} pages | "
        f"sheet {(box[2]-box[0])/MM:.2f}x{(box[3]-box[1])/MM:.2f} mm | "
        f"trim {(trim[2]-trim[0])/MM:.2f}x{(trim[3]-trim[1])/MM:.2f} mm"
    )
