// Meta lines - the app's ONE fact separator and the rule that governs it.
//
// A meta line states several facts in one run of text, separated by the same
// interpunct: "Open . 21 members . 11 match you", "5 friends . 5 groups .
// 7 requests", "Approved . 18 members". Every surface that lists facts this way
// builds its string with metaLine(), so there is one separator in the app.
//
// THE RULE (user directive 2026-07-28, absolute): a separator dot never sits at
// the START or the END of a line. A dot with nothing after it separates nothing.
// Three mechanisms enforce it together, and they live here, not at a call site:
//   1. A segment never breaks in half: "3 requests" keeps its number instead of
//      stranding the "3" at the end of a line. The spaces INSIDE a segment are
//      non-breaking.
//   2. The dot travels DOWN with the fact it introduces, so it is glued to the
//      segment that follows it, and the one plain space in the whole string, the
//      one BEFORE the dot, is the only place a wrap can land. That alone rules a
//      dot out at the END of a line.
//   3. What is left - a wrapped dot opening the next line - cannot be solved by
//      the string, because a separator is a character like any other and wherever
//      the break lands it keeps painting. So the string is laid out once, the
//      lines it actually broke into are read back, and reflowMeta() rebuilds it
//      with hard newlines at exactly those points and NO separator across them.
//      `Text` (components/AppText.tsx) does this for every meta string in the
//      app, automatically. No screen opts in, and no new screen can forget.
// A one-line meta reads exactly as it always did: an NBSP paints as a space.
//
// This module is deliberately a LEAF (no imports): the app's base `Text` reads
// it, so anything it pulled in would be pulled into every text in the app.
const NBSP = ' '
/** The separator's visible mark, on its own: the reflow counts these to work
 *  out which facts ended up on which line. Derived, so there is one interpunct. */
export const META_DOT = '·'
export const META_SEP = ' ' + META_DOT + NBSP
export const metaLine = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).map(p => (p as string).split(' ').join(NBSP)).join(META_SEP)

/** One measured line of a laid-out Text, as onTextLayout reports it. Only the
 *  text matters here; the geometry is the platform's business. */
export type MeasuredLine = { text?: string }

/** Re-flow a laid-out meta string onto the lines it actually broke into, with
 *  the separator dropped at every break. Returns null when there is nothing to
 *  do or when the measurement cannot be accounted for (a platform that reports
 *  no line text, a line clipped away by numberOfLines) - the caller then leaves
 *  the original string alone, which is the old behaviour, not a broken one.
 *
 *  It cannot loop: dropping separators only makes lines shorter, and the caller
 *  stops measuring the moment the re-flowed text is in place. */
export function reflowMeta(text: string, lines: readonly MeasuredLine[]): string | null {
  const parts = text.split(META_SEP)
  if (lines.length < 2 || parts.length < 2) return null
  // Every part but the first wears the separator's dot glued to its front, so
  // the dots ON a line count the parts that landed there.
  let taken = 0
  const rows = lines.map((l, i) => {
    const n = (i === 0 ? 1 : 0) + ((l.text ?? '').split(META_DOT).length - 1)
    return parts.slice(taken, (taken += n))
  })
  if (taken !== parts.length) return null
  return rows.filter(r => r.length > 0).map(r => r.join(META_SEP)).join('\n')
}
