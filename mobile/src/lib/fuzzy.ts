// Approximate name matching, client side.
//
// This is the twin of `public._search_norm` / `public._name_match` in the DB
// (migration 20260728110000_search_groups_relevance.sql) and must keep the same
// bands and the same threshold: the list filters what it already holds the
// instant a key goes down, and the server's answer replaces it a moment later.
// If the two disagreed, rows would visibly appear and vanish under the finger.
//
// ONE deliberate difference: the server's approximate band also consults
// trigram `word_similarity`, which has no counterpart here. Leaving it out can
// only LOWER a score, never raise one, so this side is strictly the narrower of
// the two. A row it hides for one debounce is a row the server then adds, which
// is the harmless direction: the opposite would flash a row the server rejects.

// The score a name must reach to count as a match. Below it the name is
// unrelated: measured over real group names, every intended hit landed at 0.667
// or above and every unrelated one at 0.18 or below, so the gap is wide.
export const FUZZY_MIN = 0.6

// Hebrew niqqud, minus U+05BE (maqaf). The maqaf SEPARATES words, so it has to
// fall through to the punctuation rule and become a space; stripping it would
// glue "בני־ברק" into one token.
const NIQQUD = /[\u0591-\u05BD\u05BF-\u05C7]/g
// Everything that is not a letter or a digit, in any script.
const NON_ALNUM = /[^\p{L}\p{N}]+/gu

/** Comparison form: lowercased, unpointed, punctuation folded to single
 *  spaces. Both sides of every comparison below pass through this. */
export const searchNorm = (t: string): string =>
  (t ?? '').toLowerCase().replace(NIQQUD, '').replace(NON_ALNUM, ' ').trim()

/** Edit distance, two-row DP. Counts CHARACTERS, matching Postgres's
 *  `levenshtein`, so a Hebrew letter costs the same as a Latin one. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const swap = prev; prev = cur; cur = swap
  }
  return prev[b.length]
}

const words = (s: string): string[] => (s ? s.split(' ').filter(Boolean) : [])

/** How well `q` matches `name`, 0 (unrelated) to 1 (identical). Banded, so an
 *  exact hit can never be outranked by a lucky approximate one:
 *
 *    1.00  the whole name
 *    0.95  the name starts with the query
 *    0.90  a word inside the name starts with the query
 *    0.85  the query appears anywhere in the name
 *    <0.80 approximate
 *
 *  The approximate band is token-wise: every word of the QUERY takes its best
 *  word in the NAME (a prefix counts whole, otherwise edit distance over the
 *  longer of the two), and those best scores are averaged, so a two-word query
 *  has to earn both halves. That average is what carries a transposition:
 *  "הדגומה" against "קבוצת הדוגמה" scores 0.67 here. */
export function nameMatch(q: string, name: string): number {
  const nq = searchNorm(q)
  const nm = searchNorm(name)
  if (!nq) return 0
  if (nm === nq) return 1
  if (nm.startsWith(nq)) return 0.95
  if (nm.includes(' ' + nq)) return 0.9
  if (nm.includes(nq)) return 0.85
  const nw = words(nm)
  const qw = words(nq)
  if (!nw.length || !qw.length) return 0
  let sum = 0
  for (const qt of qw) {
    let best = 0
    for (const nt of nw) {
      const s = nt.startsWith(qt) ? 1 : 1 - levenshtein(qt, nt) / Math.max(qt.length, nt.length)
      if (s > best) best = s
    }
    sum += best
  }
  return Math.min(0.8, sum / qw.length)
}

/** The items whose `name` matches `q`, best first. Ties keep the order they
 *  came in, which for a server-paged list is the server's own ranking. */
export function fuzzyRank<T>(items: T[], q: string, name: (item: T) => string): T[] {
  if (!searchNorm(q)) return items
  return items
    .map((item, i) => ({ item, i, score: nameMatch(q, name(item)) }))
    .filter(x => x.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(x => x.item)
}
