import { t, tg, lang } from '../i18n'
import { familyWeekendKidStatus, type FamilyData } from '../lib/family'
import type { ChipSegment } from './Chip'

// Lead phrase: the count is folded into the title so it reads as one fact
// ("has 2 kids"). The "want (more) kids" preference is a SEPARATE phrase
// (familyPrefLabel) — self-preview supplies it from form state while editing,
// remote views resolve it from the snapshot's fam.isForKids.
//
// `isForKids` semantics: whether the user wants their OWN (more) kids —
// independent of partner preferences.
//   hasKids   + isForKids=true   → "wants more"
//   hasKids   + isForKids=false  → "doesn't want more"
//   !hasKids  + isForKids=true   → "wants kids"
//   !hasKids  + isForKids=false  → "doesn't want kids"
function familyBaseTitle(data: { hasKids: boolean; count?: number }, self: boolean): string {
  if (!data.hasKids) return t(self ? 'family.summarySelfNoKids' : 'family.summaryNoKids')
  if (data.count === 1) return t(self ? 'family.summarySelfHasOneKid' : 'family.summaryHasOneKid')
  // A count > 1 folds the number into the phrase ("has 3 kids"). Count 0 (the
  // "has kids" toggle is on but no kid chips added yet) or unknown falls through
  // to the plain "has kids" — never "has 0 kids".
  if (data.count != null && data.count > 1) {
    const tmpl = t(self ? 'family.summarySelfHasNKids' : 'family.summaryHasNKids')
    return tmpl.replace('{n}', String(data.count))
  }
  return t(self ? 'family.summarySelfHasKids' : 'family.summaryHasKids')
}

// "wants more" / "doesn't want kids" — the preference on its own, with no
// connector, so it can stand as its own phrase.
function familyPrefLabel(hasKids: boolean, isForKids: boolean, self: boolean): string {
  const key = self
    ? (hasKids
        ? (isForKids ? 'family.selfWantsMore' : 'family.selfDoesntWantMore')
        : (isForKids ? 'family.selfWantsKids' : 'family.selfDoesntWantKids'))
    : (hasKids
        ? (isForKids ? 'family.wantsMore' : 'family.doesntWantMore')
        : (isForKids ? 'family.wantsKids' : 'family.doesntWantKids'))
  return t(key)
}

// Shared "kids" chip content for any card that surfaces a Profile's family
// alongside live distance/time chips. Returns an interleaved list of text runs
// and mini-chips (Chip renders them as a wrapping row):
//
//   "יש לי 3 ילדים"  [0] [5] [?]  "ורוצה עוד"  [לא פנויה בסופ״ש הקרוב]
//
//   - the count lives in the lead phrase ("has 3 kids"); each kid's AGE is its
//     own mini-chip in kids order, "?" for an age not set yet (user directive
//     2026-07-26 — replaces the old parenthetical "(0, 5, -)" text);
//   - the isForKids preference is a text run glued to the lead with a vav
//     connector ("ורוצה עוד"), no comma;
//   - the upcoming-weekend status is its own mini-chip.
//
// Args:
//   - `family`: the rendered profile's family (snapshot or own data).
//   - `isForKids`: explicit override; pass `undefined` to fall back to
//     family.isForKids (the remote-snapshot path).
//   - `self`: first-person phrasing for the own-profile preview.
//   - `isMale`: the rendered profile's gender; used to gender the weekend
//     status in Hebrew ("פנוי"/"פנויה", "לא פנוי"/"לא פנויה"). Null/
//     undefined falls back to masculine, matching `tg`'s convention.
export function buildFamilySegments(
  family: FamilyData | null | undefined,
  isForKids: boolean | null | undefined,
  self: boolean,
  isMale: boolean | null | undefined,
): ChipSegment[] {
  if (!family) return []
  const kids = family.kids ?? []
  const count = kids.length
  // EVERY FACT IN THIS SENTENCE IS ONE PHRASE (user directive 2026-08-03): the
  // kids and their ages together, having them or not together, wanting more or
  // not together, free or not free this weekend together — and the whole thing
  // one long chained sentence that breaks BETWEEN the facts, and only where
  // there is no room left. Broken word by word, this label read as a paragraph
  // that happened to be about a family: "אין לי" over "ילדים". A phrase is a
  // unit of meaning, which no measurement can find in a string, so it is stated
  // here, where the sentence is composed.
  const segments: ChipSegment[] = [{ text: familyBaseTitle({ hasKids: family.hasKids, count }, self), phrase: true }]

  // Ages as one dense cluster of mini-chips, in kids order — only when at least
  // one age is known, so a profile with no ages set stays clean instead of a row
  // of "?" pills. "?" stands in for an age not picked yet.
  if (family.hasKids && kids.some(k => k.age != null)) {
    segments.push({ badges: kids.map(k => (k.age != null ? String(k.age) : '?')), ltr: true })
  }

  const effIsForKids = isForKids !== undefined ? isForKids : (family.isForKids ?? null)
  if (effIsForKids != null) {
    // Glued to the lead with a vav connector ("ורוצה עוד"), no comma.
    segments.push({ text: t('family.prefConnector') + familyPrefLabel(family.hasKids, effIsForKids, self), phrase: true })
  }

  const weekend = familyWeekendKidStatus(family.schedule, lang)
  if (weekend) {
    // THE WEEKEND STATUS IS THE LAST PHRASE OF THE SENTENCE, BEHIND A COMMA
    // (user directive 2026-08-02, reversing the forced break of 2026-07-26):
    // "יש לי 2 ילדים [6][10] ורוצה עוד, פנויה בסופ״ש הקרוב". It used to be pushed
    // onto a LINE of its own so it could never trail the kids sentence — but a
    // line break is what a sentence does when it runs out of room, and this one
    // was breaking with room still on the line above it. It is one more fact
    // about this person's family, so it is punctuated like one and wraps only if
    // it has to.
    //
    // The comma joins two phrases of WORDS. Where the ages cluster is what
    // stands between them (a profile with no kids preference stated), those
    // pills are already the separator and no comma is added — a comma cannot
    // attach to a pill, and one floating after the cluster would read as
    // punctuation belonging to nothing.
    // AND IT IS ONE PHRASE (user directive 2026-08-02): the row may break before
    // it and never inside it. It is three short words saying one thing, and
    // broken across two lines it left the last of them stranded under a full
    // line ("...ורוצה עוד, פנויה בסופ״ש" / "הקרוב"). The sentence in front of it
    // still breaks word by word, which is what a sentence does.
    const prev = segments[segments.length - 1]
    if ('text' in prev) prev.text += ','
    segments.push({
      text: tg(weekend === 'free' ? 'family.summaryFreeWeekend' : 'family.summaryWithKidsWeekend', isMale),
      bold: true,
      phrase: true,
    })
  }

  return segments
}
