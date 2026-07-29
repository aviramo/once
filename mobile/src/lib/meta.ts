// Meta lines - the app's ONE fact separator and the rule that governs it.
//
// A meta line states several facts in one row of text, separated by the same
// interpunct: "Open · 21 members · 11 match you", "5 friends · 5 groups",
// "2 חברים · מנוהלת על ידי אופיר". Every surface that lists facts this way
// renders components/MetaLine.tsx, so there is one separator in the app. The
// ORDER of the facts is the caller's — for a group it comes from ONE composer,
// lib/communities.ts' `groupFacts`, so every list states them the same way.
//
// THE RULE (user directive 2026-07-28, absolute): a separator dot never sits at
// the START or the END of a line. A dot with nothing after it separates nothing.
// The line is allowed to WRAP (user directive 2026-07-29) - it must, since a
// row can be narrow - so the dot at a wrap simply has to go.
//
// This is why the line is not a STRING. A string cannot obey the rule: the
// separator is a character like any other, and wherever the breaker lands it
// keeps painting, at the end of one line or the start of the next. The old
// answer was to lay the string out, read back the lines the platform reported
// and re-render it with hard newlines and no separator across them - and that
// answer depended on `onTextLayout` reporting per-line TEXT, which it did not do
// on the device (2026-07-29: the dot came back at the start of a wrapped line in
// the shared-circles popup). MetaLine renders each fact as its own element in a
// wrapping row instead, so the separators are elements too and one that lands
// between two lines is simply not painted. Nothing measured, nothing to break.
//
// Laying the facts out as elements settles the other thing a string could not:
// BIDI. "4 חברים · מנוהלת על ידי Gal" as one string painted with two of its
// words SWAPPED - rule W7 gives a number the direction of the last strong letter
// before it, so the Latin name pulled the NEXT fact's count into its own
// left-to-right run and "Gal · 4" became one Latin chunk, which read
// right-to-left says "managed by 4 · Gal members". Each fact is its own text box
// now, so nothing inside a fact can reach the fact beside it, and the order of
// the facts is the row's own reading direction.
const NBSP = ' '
/** The separator's visible mark. One interpunct, in one place. */
export const META_DOT = '·'
/** One fact, or nothing: a falsy entry drops out, so a caller states a
 *  conditional fact inline instead of building the list around it. */
export type MetaPart = string | false | null | undefined
/** A fact travels whole: the spaces INSIDE it are non-breaking, so "3 requests"
 *  keeps its number instead of stranding the "3" at the end of a line. Only a
 *  fact too wide for the row on its own ever breaks, which is the one case
 *  where breaking it beats overflowing. */
export const glueFact = (fact: string): string => fact.split(' ').join(NBSP)
