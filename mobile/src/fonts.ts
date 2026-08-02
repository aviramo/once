// Font family config shared between the _layout root (which loads the fonts
// with useFonts) and the AppText wrapper (which applies them per-Text).
//
// Layout / spacing / radius tokens live in `./tokens.ts` — import from there.

import { PixelRatio, type TextStyle } from 'react-native'
import { isRTL } from './i18n'

export const DEFAULT_FAMILY = 'NotoSansHebrew_400Regular'
export const SINGLE_WEIGHT = false

// THE reading direction of every piece of text in the app, applied ONCE in the
// AppText wrapper (and in _layout's defaultProps safety net for stray RN Text).
//
// Why it has to be said out loud, on iOS: a Text with no explicit alignment
// gets NSTextAlignmentNatural, and iOS resolves "natural" against the app's own
// UI language — NOT against the Hebrew characters in the string, and NOT
// against I18nManager.forceRTL. The bundle has no Hebrew localization, so
// natural resolved to LEFT and every un-aligned label in an RTL layout was
// pushed to the row's END edge: the settings rows' labels sat far from the icon
// that names them, the Circles rows' titles and section headings hugged the
// wrong edge, and a Hebrew sentence's trailing punctuation bidi-flipped to the
// wrong side. Setting baseWritingDirection is what makes "natural" mean "the
// direction this app reads in" (RCTTextAttributes.effectiveParagraphStyle).
//
// `writingDirection` is an iOS-only style prop — Android's text pipeline never
// reads it (it aligns per the string's own script, which is why Android has
// always looked right), so this is an iOS fix with no Android side effects.
//
// Deliberately NOT paired with `textAlign: 'left'`. That pair only lands on the
// start edge when the native view's layout direction is RTL, which depends on
// forceRTL having propagated; the writing direction alone doesn't. A call site
// that wants something OTHER than start-aligned (centred titles, a numeric
// column, an LTR-pinned code field) still overrides both, since its own style
// is applied after this one.
export const TEXT_START: TextStyle = {
  writingDirection: isRTL ? 'rtl' : 'ltr',
}

// The same rule for a FIELD, and it has to be stated physically. A TextInput's
// PLACEHOLDER is drawn from its own attributed string, which iOS never gives
// the base writing direction above — so in an RTL app every empty field showed
// its placeholder (and then the text typed into it) pinned to the LEFT edge,
// on the far side of the box from where the user reads. `textAlign` is the one
// thing that reaches both the placeholder and the value.
//
// Applied once, in AppText's TextInput wrapper, and ONLY when the call site
// stated no alignment of its own: a centred code field, a centred bio and an
// LTR-pinned value all keep saying what they want and still win.
//
// A LABEL never takes this. A `Text` that has to undo an inherited `textAlign`
// says `'auto'` — the natural edge — because a physical one written into a Text
// style did not survive at all in the RTL build (see `titleStart` in
// OverlaySheet.tsx, 2026-07-31). Only a field, whose placeholder is drawn from
// its own string, needs the edge stated outright.
export const INPUT_START: TextStyle = {
  textAlign: isRTL ? 'right' : 'left',
}

// ── ONE ceiling for every piece of text in the app ─────────────────────────
// How far the OS font-size slider may grow a label (`maxFontSizeMultiplier`).
// ONE number for the whole app (user directive 2026-07-30), where this used to
// be a three-class ramp — ui 1.0 / heading 1.15 / body 1.3 — whose classes
// silently redesigned the app at a bumped font scale:
//   - the same SHEET_TITLE rendered 26dp on the Circles sheet header (body,
//     inherited from AppText) and 23dp on home's status card (heading, passed by
//     hand), so two headings of the identical declared rank came out different
//     sizes on a large-font device;
//   - a heading capped at 1.15 standing over a description capped at 1.3 closed
//     the 20:16 gap that is the only thing saying which of the two IS the
//     heading;
//   - chrome pinned at 1.0 stopped growing altogether while the paragraph beside
//     it grew a third.
// A single ceiling multiplies the whole app by one factor, so every size
// RELATION the design states holds at every OS setting.
//
// The number is the old `heading` tier (user directive 2026-07-30): the app is a
// dense single screen of chips, round chrome and on-photo tiles whose boxes are
// dp, so the app-wide step is the cautious one — 15% of headroom for the OS
// slider, granted to every string equally, rather than a third granted to
// paragraphs alone.
//
// Declared once and applied once — in AppText's Text/TextInput wrappers. No call
// site passes `maxFontSizeMultiplier`: there is nothing left to choose.
export const FONT_SCALE = 1.15

// The one exception, and it is geometry rather than type: a glyph centred inside
// a box whose dp does NOT follow the font scale (RoundButton's circle, home's
// centre-notice circle) may not follow it either, or the single
// glyph-to-circle ratio stops being true and the same button reads crowded on a
// bumped device and lost on a plain one. Never for TEXT — no label in the app
// lives in a fixed box; every one of their containers is content-sized or
// minHeight, so text simply takes FONT_SCALE.
export const FIXED_BOX_SCALE = 1

// Text and glyphs are sized in two different units: a `fontSize` is MULTIPLIED
// by the OS font scale before layout, while an Svg `width`/`height` in dp is
// not. At font_scale = 2.0 the labels doubled and every icon stayed put, so the
// icon column read as half-size next to its own text.
//
// `iconScale` is the other half of FONT_SCALE: it applies the same scale, with
// the same ceiling, to a glyph's dp footprint, so text and icon grow together
// and stop together. Applied once, in icons.tsx's `Glyph` wrapper — call sites
// keep passing plain ICON.* values.
//
// Defaults to the app's own ceiling, which is also every label's, so a glyph can
// never outgrow the text it labels. Scales below the ceiling are honoured in
// full.
//
// `cap` lowers it for a glyph living in a container that does NOT grow with the
// font scale: pass FIXED_BOX_SCALE inside a fixed-dp box — a round button is the
// case that matters, its diameter being a plain dp, so a glyph that keeps
// scaling changes the glyph-to-circle ratio per device and the same button reads
// crowded on one and lost on another. Call sites never pass this by hand;
// RoundButton declares it once via GlyphScale (icons.tsx).
export const iconScale = (size: number, cap: number = FONT_SCALE): number =>
  Math.round(size * Math.min(PixelRatio.getFontScale(), cap))

// ── Centring a glyph on a line of text ─────────────────────────────────────
// A line box is NOT symmetric around the ink it carries. Noto Sans Hebrew
// reserves 1.068 em above the baseline and 0.292 em below it, while the ink a
// label actually paints reaches only cap height (Latin) or the Hebrew letter
// body. So a glyph centred on the line box — which is what `alignItems:'center'`
// and a box one line tall both do — always reads a little HIGH, and by a
// different amount in each script.
//
// These are the font's own numbers, read out of the bundled NotoSansHebrew
// files (hhea + the glyph bounds of the Latin capitals and of the Hebrew
// letters), not a value tuned by eye against one screenshot:
const FONT_ASCENT = 1.068    // hhea ascender / head yMax — the same value, so
const FONT_DESCENT = 0.292   // includeFontPadding changes nothing here
const CAP_HEIGHT = 0.714     // Latin capitals + digits: baseline → 0.714
const HEBREW_HEIGHT = 0.600  // every Hebrew letter: baseline → 0.600 (only ל rises past it)

// ── The leading, and why no style may declare one ──────────────────────────
// The line box the text engine lays out when NOTHING declares a `lineHeight`:
// the font's own ascent + descent, 1.36 em.
//
// This is the app's leading (user directive 2026-07-30). It replaced a declared
// `lineHeight: lh(size)` (1.4 em) on every text style in the app, and the
// difference is not the 0.04: a declared lineHeight is a dp value, and RN hands
// dp text metrics to Android as SP, where the OS font-scale curve grows them
// UNCAPPED by `maxFontSizeMultiplier` — while `fontSize` IS capped. So above the
// cap the two came apart: on a font_scale=2.0 device a 16dp/22dp body paragraph
// painted its ink at 16 × 1.15 = 18.4dp inside a line box of ~37dp, a leading of
// 2.0 em where the design said 1.4, which is the wide-open paragraph the user
// reported (Hebrew_Big, 2026-07-30). Lowering the app's ceiling to 1.15 that day
// did not cause it — it made an existing 1.78 em into 2.0.
//
// The font's leading cannot come apart from the ink, because it is a multiple of
// the font size the device actually painted, whatever ceiling clamped it. So the
// ratio is 1.36 on every device, at every OS font scale, by construction.
//
// Nothing needs to be passed anywhere for that: it is what a `Text` with no
// `lineHeight` already does. The constant is exported only for the few places
// that must SIZE A BOX in JS before its text exists (tokens.ts `lh`).
export const FONT_LINE_RATIO = FONT_ASCENT + FONT_DESCENT

// How far BELOW its line box's centre a line's ink centre sits, as a fraction
// of the font size. Derived rather than measured:
//
//   baseline (from the line box top) = A·S + (L − (A+D)·S) / 2
//   ink centre                       = baseline − inkHeight·S / 2
//   ⇒ ink centre − L/2               = ((A − D)/2 − inkHeight/2) · S
//
// The line height L cancels — which is the whole point. The rendered line
// height is NOT knowable from JS: Android 14+ scales `lineHeight` through its
// own non-linear font-scale curve, UNCAPPED by maxFontSizeMultiplier, while
// `fontSize` stays capped. On a font_scale=2.0 device a 22dp line box comes
// back ~37dp tall, so anything that computed a line box in JS (`lh(TEXT.md) ×
// the cap`) placed its glyph against a box the device never drew — the icons
// sat visibly high there and slightly low at font scale 1. This correction is
// immune to that: it only ever needs the font size, which IS knowable.
//
// Script, not locale-as-decoration: Hebrew ink stops 0.114 em lower than Latin
// ink does, so the same glyph needs a bigger nudge beside a Hebrew label.
//
// AND IT IS THE LABEL'S SCRIPT, NOT THE APP'S (user report 2026-07-31). The
// app's own direction used to pick it, on "the UI renders one language at a
// time" — but a label is not always UI language: a person's NAME is user data,
// and the match card's heading chip paints "Inbal, 51" in a Hebrew build. That
// line carries no Hebrew ink at all, so the Hebrew constant measured something
// that was not on the screen and the report shield beside it sat 1.3dp below the
// name's own centre (measured on a font_scale 2.0 device: the glyph's ink centre
// landed 4.5px under the cap-ink centre of "Inbal, 51", where a glyph beside a
// genuinely Hebrew label on the same screen was exact to the pixel).
//
// So a caller that HAS the label hands it over and the line answers for itself:
// any Hebrew letter in it and the line is Hebrew, otherwise it is Latin — digits
// alone never make a Hebrew line Latin (they reach cap height, but "לפני 3 ימים"
// is still a Hebrew line and reads from its letters). A caller with no label to
// give — a field carrying text that does not exist yet — keeps the app's own
// direction as the fallback it always was.
// (Escaped, not the literal block: a raw range in source is two characters
// nobody can see, and this one decides where every glyph in the app sits.)
const HEBREW_LETTER = /[\u0590-\u05FF]/

const inkRise = (label?: string): number =>
  (FONT_ASCENT - FONT_DESCENT) / 2 -
  ((label == null ? isRTL : HEBREW_LETTER.test(label)) ? HEBREW_HEIGHT : CAP_HEIGHT) / 2

// Nudge a glyph down by this much to sit on a label's ink rather than on its
// line box. Takes the UNSCALED font size and applies the OS font scale itself
// (same ceiling the labelled text is capped at), and returns a FLOAT: it feeds
// a transform, and rounding it to whole dp is what used to collapse two
// different font scales onto the same 3dp nudge.
export const inkOffset = (fontSize: number, cap: number = FONT_SCALE, label?: string): number =>
  fontSize * Math.min(PixelRatio.getFontScale(), cap) * inkRise(label)

// fontWeight → the real weighted face to render it with. The app asks for
// exactly two: 400 (the default) and 500 (WEIGHT.medium, the single emphasis
// tier — see tokens.ts). Everything else here is a landing spot for a weight the
// app itself never writes — a stray `fontWeight: 'bold'`, a third-party style we
// don't own — and every one of them must resolve to a face that is actually
// BUNDLED (see _layout's useFonts), or the text silently falls back to the
// system font mid-paragraph.
//
// Which is why 600 points at the Medium file (2026-07-29): the SemiBold face was
// dropped from the bundle when the emphasis tier moved to 500, and a leftover
// '600' would otherwise ask for a file that is no longer there. It lands on the
// app's one emphasis face instead, which is what it meant. 800 went the same way
// with the extrabold token.
export const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'NotoSansHebrew_400Regular',
  '500': 'NotoSansHebrew_500Medium',
  '600': 'NotoSansHebrew_500Medium',
  '700': 'NotoSansHebrew_700Bold',
  // 900 is the ONE weight outside the 400/500 pair, and exactly one thing in the
  // app writes it: home's wordmark. It is a real bundled Black face rather than a
  // landing spot — an unmapped '900' would fall through to DEFAULT_FAMILY and
  // paint the name in Regular, the opposite of what it asked for.
  '900': 'NotoSansHebrew_900Black',
  normal: 'NotoSansHebrew_400Regular',
  bold: 'NotoSansHebrew_700Bold',
}
