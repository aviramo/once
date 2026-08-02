// How tall someone is, said in the units the reader's own phone uses.
//
// THE ROW STORES CENTIMETRES AND NOTHING ELSE. A profile is read by people on
// both measuring systems, so the number on the wire has to be one number — and
// which units it is SHOWN in is a property of the device doing the showing, not
// of the person being read. That is exactly the rule the distance chip already
// follows (`units` in ./units.ts, derived once from the device locale), and it
// is deliberately the same import here: a user who reads "57 mi away" must read
// "5'8"" on the same card, never one of each.
import { t } from '../i18n'
import { units } from './units'

const CM_PER_IN = 2.54
const IN_PER_FT = 12

// The band a person may state. Generous at both ends on purpose — this is a
// list to find yourself in, not a claim about who is allowed to be here.
export const HEIGHT_MIN_CM = 130
export const HEIGHT_MAX_CM = 220

// ── An imperial height reads LEFT TO RIGHT wherever it is painted ───────────
// `5'8"` is digits and QUOTES, and a quote is a bidi-neutral character: between
// two numbers in a right-to-left paragraph the numbers are resolved as R for the
// neutral around them, so the two halves swap and the string paints as 8'5. The
// combination is rare (a Hebrew-language phone in a US region) and the fix is
// one character at each end: an isolate, which states "whatever is in here has
// its own direction" without changing the direction of the sentence around it.
// Written as escapes, never as the characters themselves — see pinDirection in
// src/i18n, which solves the mirror-image problem for the same reason.
const LTR_ISOLATE_OPEN = '\u2066'
const ISOLATE_CLOSE = '\u2069'

/** The height as this device says heights: "175 ס״מ" / "175 cm" / "5'8"". */
export function formatHeight(cm: number | null | undefined): string {
  if (cm == null || !isFinite(cm)) return ''
  if (units === 'imperial') {
    const totalIn = Math.round(cm / CM_PER_IN)
    const ft = Math.floor(totalIn / IN_PER_FT)
    const inch = totalIn % IN_PER_FT
    return `${LTR_ISOLATE_OPEN}${ft}'${inch}"${ISOLATE_CLOSE}`
  }
  return `${Math.round(cm)} ${t('settings.cm')}`
}

/** Every height the picker offers, tallest first: a list is scrolled from the
 *  top, and a person looking for his own height passes fewer rows coming DOWN
 *  from the tall end than up from a child's. One step is one unit of whatever
 *  the reader measures in — a centimetre here, a whole inch there — so the list
 *  never offers two rows that read the same. Values are centimetres either way,
 *  because that is what the row stores. */
export function heightOptions(): { value: number; label: string }[] {
  const opts: { value: number; label: string }[] = []
  if (units === 'imperial') {
    const maxIn = Math.floor(HEIGHT_MAX_CM / CM_PER_IN)
    const minIn = Math.ceil(HEIGHT_MIN_CM / CM_PER_IN)
    for (let i = maxIn; i >= minIn; i--) {
      const cm = Math.round(i * CM_PER_IN)
      opts.push({ value: cm, label: formatHeight(cm) })
    }
    return opts
  }
  for (let cm = HEIGHT_MAX_CM; cm >= HEIGHT_MIN_CM; cm--) {
    opts.push({ value: cm, label: formatHeight(cm) })
  }
  return opts
}

/** Which option a stored height IS. Not an equality test: the number on the row
 *  is centimetres whatever it was picked in, so a height chosen on an imperial
 *  phone (173, from 5'8") is not one of the values an imperial list offers back
 *  after a rounding trip, and a height chosen before the user's region changed
 *  is not one of them at all. The nearest row is the one that reads the same, so
 *  the nearest row is the one that is ticked. */
export function nearestHeightOption(
  cm: number | null | undefined,
  options: { value: number }[],
): number | null {
  if (cm == null || !isFinite(cm) || !options.length) return null
  let best = options[0].value
  for (const o of options) {
    if (Math.abs(o.value - cm) < Math.abs(best - cm)) best = o.value
  }
  return best
}
