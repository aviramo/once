import { ComponentProps, createContext, useContext, type ReactNode } from 'react'
import { I18nManager } from 'react-native'
import Svg, { Path, Circle, Line, Polyline, Rect, G } from 'react-native-svg'
import { INK, INK_SUBTLE, WHITE } from '../colors'
import { ICON, STROKE } from '../tokens'
import { iconScale, FONT_SCALE } from '../fonts'

// The OS-font-scale ceiling every Glyph below this point obeys. Default is the
// app's own, matching iconScale's default: a glyph beside text grows with it, and
// text has exactly one ceiling (FONT_SCALE in ../fonts).
const GlyphScaleContext = createContext<number>(FONT_SCALE)

/** Declares the font-scale ceiling for every glyph rendered inside it.
 *
 *  A container whose own size is a fixed dp must pin this to FIXED_BOX_SCALE,
 *  otherwise the glyph keeps growing while the box does not and the
 *  glyph-to-box ratio drifts per device font scale — the same round button
 *  reading crowded on one screen and lost on another. RoundButton is the one
 *  caller today; it wraps its children, so every in-circle icon in the app
 *  (heart, hamburger, report flag, close X, 3-dot) inherits it with no
 *  call-site change. */
export function GlyphScale({ cap, children }: { cap: number; children: ReactNode }) {
  return <GlyphScaleContext.Provider value={cap}>{children}</GlyphScaleContext.Provider>
}

// Every glyph renders through this instead of a bare <Svg>: it applies the
// shared OS font scale (see FONT_SCALE / iconScale in fonts.ts) so icons grow with
// the label beside them. A raw <Svg width={ICON.md}> stays at 16dp while its
// text doubles — that mismatch is the whole reason this wrapper exists. The
// ceiling comes from the nearest GlyphScale above (see above).
export function Glyph({ width, height, ...rest }: ComponentProps<typeof Svg>) {
  const cap = useContext(GlyphScaleContext)
  return (
    <Svg
      width={typeof width === 'number' ? iconScale(width, cap) : width}
      height={typeof height === 'number' ? iconScale(height, cap) : height}
      {...rest}
    />
  )
}

// Shared SVG icons used across the app. Every icon takes an optional `color`
// (default = INK) and an optional `size`. If you need a new icon,
// add it here. Don't inline an Svg in a screen — the icon will end up
// duplicated the first time someone uses it twice.

const isRTL = I18nManager.isRTL

type IconProps = {
  color?: string
  size?: number
}

// ── Chevrons / arrows ──────────────────────────────────────────────────────

export function BackIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Glyph>
  )
}

// THE DISCLOSURE MARK: `BackIcon` reflected. A chevron pointing at the reading
// END — "there is more behind this, and pressing it goes there" — as against the
// back arrow above, which points at the edge it returns to. Mirrors with the
// language for the same reason that one does: both are read as a DIRECTION, and
// a direction that does not follow the text points the wrong way in half the
// app. Its one call site is the mark beside the match card's clock, which opens
// what that card has to say (user directive 2026-08-01, replacing an up-chevron:
// what this says is "go here", not "expand").
export function ChevronEndIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </Glyph>
  )
}

export function ChevronUpIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 15 12 9 18 15" />
    </Glyph>
  )
}

export function ChevronDownIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Glyph>
  )
}

export function CheckIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="5 12 10 17 19 7" />
    </Glyph>
  )
}

// The check twice over: one tick means "this one", two mean "all of them" —
// the read-receipt mark everyone already reads that way. The queue's
// approve-everyone control wears it (user directive 2026-07-28) so it can't be
// mistaken for approving the person on top of the list.
export function DoubleCheckIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="2 12 7 17 18 6" />
      {/* The trailing tick is drawn only from where it leaves the first one,
          so the two read as a pair instead of one crossed-out scribble. */}
      <Polyline points="13 16 14.5 17.5 22 10" />
    </Glyph>
  )
}

// A rank insignia: two chevrons stacked, the way a rank is worn on a sleeve.
// The manager-appointment mark (user directive 2026-07-28) — "you're being
// promoted", which a plain person glyph never said. `down` mirrors it into the
// demotion glyph, so promote and demote are one shape read both ways.
export function RankIcon({ color = INK, size = ICON.md, down = false }: IconProps & { down?: boolean } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={down ? '5 6 12 13 19 6' : '5 13 12 6 19 13'} />
      <Polyline points={down ? '5 11 12 18 19 11' : '5 18 12 11 19 18'} />
    </Glyph>
  )
}

// Handing the keys over: the ownership-transfer mark. Deliberately NOT the rank
// insignia above, which is the manager appointment. A rank is given from above
// and can be taken back; the key is the group itself changing hands.
export function KeyIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="7" cy="17" r="3.5" />
      <Line x1="9.5" y1="14.5" x2="19.5" y2="4.5" />
      <Line x1="16.5" y1="7.5" x2="18.5" y2="9.5" />
      <Line x1="13.5" y1="10.5" x2="15.5" y2="12.5" />
    </Glyph>
  )
}

// ── Close / dots ───────────────────────────────────────────────────────────

export function CloseIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Glyph>
  )
}

// Chunky close X. Same shape as CloseIcon but with the visual weight of
// HeartIcon — heavy rounded strokes so it reads as a "bold mark" rather
// than a thin nav glyph. Used by the profile-sheet tab.
// `stroke` (optional) draws a contour around the X exactly like HeartIcon's
// white perimeter: a wider underlay of the two lines in `stroke`, the colored
// lines on top. Underlay width = heavy + thick so the visible halo each side
// is STROKE.thick/2 — byte-matching the heart's white-edge weight (no new
// literal; both derive from the same STROKE tokens).
export function CloseBoldIcon({ color = INK, stroke, size = ICON.xxl }: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {stroke ? (
        <>
          <Line x1="17" y1="7" x2="7" y2="17" stroke={stroke} strokeWidth={STROKE.heavy + STROKE.thick} />
          <Line x1="7" y1="7" x2="17" y2="17" stroke={stroke} strokeWidth={STROKE.heavy + STROKE.thick} />
        </>
      ) : null}
      <Line x1="17" y1="7" x2="7" y2="17" stroke={color} strokeWidth={STROKE.heavy} />
      <Line x1="7" y1="7" x2="17" y2="17" stroke={color} strokeWidth={STROKE.heavy} />
    </Glyph>
  )
}

// (HamburgerIcon stood here. It drew the floating menu button and the centre
// circle's no-candidate state, and both went with the drawer on 2026-07-30 —
// what it opened is home's dock. Do not bring it back: there is no menu.)

// A plus: "add something to this". The chat composer's attach affordance, at
// the leading edge of the field. Same STROKE.base weight and 24-box as
// CloseIcon, so the chrome glyphs read as one set.
export function PlusIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round">
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Glyph>
  )
}

// The magnifying glass — home's dock says "preferences" with it (user directive
// 2026-07-30, replacing the sliders that stood there): what the popup behind it
// decides is WHO I am shown, so the mark is the one every app uses for looking
// for someone. Same STROKE.base weight and 3..21 ink span as the dock's other
// glyphs, so the four read as one set.
//
// MIRRORED under RTL (user directive 2026-07-30): the glass is an object held in
// a hand, so its handle belongs on the reading-START side — the same treatment
// BackIcon gets, and for the same reason. Mirroring is stated as the artwork's
// own coordinates reflected about the box's centre (x → 24 − x) rather than a
// negative transform, so the stroke caps and the Glyph's font-scale sizing are
// untouched by it.
//
// AND IT IS THE APP'S ONLY MAGNIFIER (user directive 2026-07-31): the Circles
// sheet drew a `SearchGlyph` of its own — the hub's find, a group roster's
// people-search, the field's own leading mark and the empty hub's "find a group"
// button — so four glasses in the app pointed the Latin way while the dock's
// pointed the Hebrew one. That copy is deleted; every one of them renders this.
export function SearchIcon({ color = INK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={isRTL ? '13.5' : '10.5'} cy="10.5" r="7" />
      <Line x1={isRTL ? '8.4' : '15.6'} y1="15.6" x2={isRTL ? '3' : '21'} y2="21" />
    </Glyph>
  )
}

// ── Field / list-row icons (gray stroke by default) ────────────────────────

export function SlidersIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      {/* scale: this is the one glyph in the row whose ink runs the FULL 1..23
          of its box, where every neighbour (pin / clock / eye / rings) stops
          around 3..21. At the same `size` it therefore read a step larger than
          the rest of the settings list, so the artwork is pulled in to their
          span rather than the row being given a smaller `size` — the box stays
          the shared ICON.md and only the drawing changes. */}
      <G rotation={90} origin="12, 12" scale={0.9}>
        <Line x1="4" y1="21" x2="4" y2="14" />
        <Line x1="4" y1="10" x2="4" y2="3" />
        <Line x1="12" y1="21" x2="12" y2="12" />
        <Line x1="12" y1="8" x2="12" y2="3" />
        <Line x1="20" y1="21" x2="20" y2="16" />
        <Line x1="20" y1="12" x2="20" y2="3" />
        <Line x1="1" y1="14" x2="7" y2="14" />
        <Line x1="9" y1="8" x2="15" y2="8" />
        <Line x1="17" y1="16" x2="23" y2="16" />
      </G>
    </Glyph>
  )
}

export function MapPinIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </Glyph>
  )
}

export function BellIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
      <Path d="M10 21a2 2 0 0 0 4 0" />
    </Glyph>
  )
}

export function WifiOffIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="2" y1="2" x2="22" y2="22" />
      <Path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <Path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <Path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <Path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <Path d="M5 12.55a10 10 0 0 1 5.17-2.39" />
      <Line x1="12" y1="20" x2="12.01" y2="20" />
    </Glyph>
  )
}

// Universal prohibition sign (circle + diagonal slash) — the "block" mark in
// the chat-state menu. Same line-art family as the other list-row glyphs.
export function BlockIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </Glyph>
  )
}

// Plain security shield — the "report / raise a safety concern" glyph.
// Deliberately a shield, not a flag (a flag reads as a second like-style
// affordance). Simplified to just the shield outline — the inner alert mark
// (exclamation) was dropped 2026-05-22 at the user's request for a simpler
// glyph. Same dual-context stroke+halo pattern as CloseBoldIcon (matching
// its exact halo math, so it reads at the SAME stroke weight as sibling
// on-photo glyphs): pass `stroke` for the haloed on-photo RoundButton
// variant, omit it for the plain coral dialog icon.
export function ShieldIcon({ color = INK, stroke, fill, size = ICON.xxl }: IconProps & { stroke?: string; fill?: string } = {}) {
  const shield = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {stroke ? (
        <Path d={shield} stroke={stroke} strokeWidth={STROKE.heavy + STROKE.thick} />
      ) : null}
      <Path d={shield} fill={fill} stroke={color} strokeWidth={STROKE.heavy} />
    </Glyph>
  )
}

export function RadiusIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="1.25" fill={color} stroke="none" />
      <Line x1="12" y1="12" x2="18.36" y2="5.64" />
    </Glyph>
  )
}

export function GenderIcon({ color = INK_SUBTLE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="10" r="5" />
      <Line x1="16" y1="6" x2="20" y2="2" />
      <Polyline points="16 2 20 2 20 6" />
      <Line x1="12" y1="15" x2="12" y2="22" />
      <Line x1="9" y1="19" x2="15" y2="19" />
    </Glyph>
  )
}

// ── Account / system icons ─────────────────────────────────────────────────

export function SignOutIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Glyph>
  )
}

// Mirror of SignOutIcon (arrow INTO the frame instead of out) — the "join /
// enter" mark. Paired with SignOutIcon so joining a group and leaving one read
// as one in/out family. RTL-aware: the door and arrow flip so "in" always
// points toward the frame, never off-screen.
export function LogInIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <G rotation={isRTL ? 180 : 0} origin="12, 12">
        <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <Polyline points="10 17 15 12 10 7" />
        <Line x1="15" y1="12" x2="3" y2="12" />
      </G>
    </Glyph>
  )
}

// Curved arrow pointing back at a message — the chat's reply affordance. Shown
// behind a bubble while it is swiped, and beside the Reply row in the
// long-press message sheet. Mirrors under RTL like every other directional arrow.
export function ReplyIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <G rotation={isRTL ? 180 : 0} origin="12, 12">
        <Polyline points="9 17 4 12 9 7" />
        <Path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </G>
    </Glyph>
  )
}

// Two stacked sheets — "copy this text". Used by the chat's long-press
// message sheet.
export function CopyIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="9" y="9" width="12" height="12" rx="2.5" />
      <Path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
    </Glyph>
  )
}

export function TrashIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Glyph>
  )
}

// Lifebuoy glyph — the settings "support" row and the support sheet header.
export function SupportIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      {/* scale: same correction as SlidersIcon. A life-ring at r 10 runs its
          ink to 1..23 of the box, the widest possible, and its six strokes make
          it the heaviest glyph in the settings list too (117dp² of ink against
          a ~75 median). Pulled in to the column's shared span; the box stays
          the shared ICON.md and only the drawing changes. */}
      <G origin="12, 12" scale={0.9}>
        <Circle cx="12" cy="12" r="10" />
        <Circle cx="12" cy="12" r="4" />
        <Path d="m4.93 4.93 4.24 4.24" />
        <Path d="m14.83 14.83 4.24 4.24" />
        <Path d="m14.83 9.17 4.24-4.24" />
        <Path d="m4.93 19.07 4.24-4.24" />
      </G>
    </Glyph>
  )
}

// Globe glyph — the settings "site" row, which opens the brand site in the
// device browser. A sphere stated with the fewest strokes that still read as
// one: the outline, its equator and one meridian.
//
// It takes SupportIcon's scale correction, and for the same reason, doubled: a
// circle at r 10 runs its ink to 1..23 of the box — the widest anything in the
// column gets — and this row sits DIRECTLY under the lifebuoy, so the two
// full-box circles would be the one pair in the list where a difference in the
// correction is visible as a difference in size.
export function GlobeIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <G origin="12, 12" scale={0.9}>
        <Circle cx="12" cy="12" r="10" />
        <Path d="M2 12h20" />
        <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </G>
    </Glyph>
  )
}

export function UserIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Glyph>
  )
}

// Silhouette with a plus — "invite someone who isn't here yet", used by the
// referral row in the credits popup. Deliberately built on UserIcon's body so
// it reads as the same family, with the plus carrying the whole difference.
export function UserPlusIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M19 8v6" />
      <Path d="M22 11h-6" />
    </Glyph>
  )
}

// Silhouette with a minus — "remove this person" (unfriend, remove a group
// member). The exact counterpart to UserPlusIcon: same body, the plus's
// vertical stroke dropped so only the minus bar remains.
export function UserMinusIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M22 11h-6" />
    </Glyph>
  )
}

// TWO INTERLACED RINGS — the feature is called CIRCLES, so the glyph is
// circles, not the generic two-silhouettes every app ships (user directive
// 2026-07-29). It says the whole idea in one shape: two separate circles that
// pass through each other. That is equally what a shared group is and what a
// mutual friend is, so this one mark carries every "you two are already
// connected" surface — the menu row, the create-group button, and BOTH fact
// chips on the match card (shared group, friend-of).
//
// Drawn as two ARCS, not two circles: each ring is broken by a 52° gap centred
// on ONE of the two crossings, and they take OPPOSITE crossings, so each ring
// passes over the other once and under it once. Two plain <Circle>s only ever
// read as a Venn diagram. The gap must be this wide because the round caps eat
// a stroke-width of it at each end. (Both gaps on the same crossing is the easy
// mistake — that draws a hole, not a weave.)
//
// The pair runs DIAGONALLY, and that is load-bearing: side by side on one
// horizontal line, two overlapping rings read as an infinity sign, not as two
// circles.
//
// THE TWO RINGS ARE NOT THE SAME SIZE (user directive 2026-08-01): the leading
// one is r 6.7 and the one it passes through r 5.3, so the mark is asymmetric
// on both of its axes rather than a shape that reads the same however it is
// turned. Two identical rings on a diagonal are a rotationally symmetric
// figure, which is what made the diagonal itself hard to see; unequal rings
// give the pair a near one and a far one and the diagonal reads at a glance.
// Geometry: centres (9.73,9.73)/(15.67,15.67) — 8.4 apart, exactly as the
// equal pair was, and the radii still SUM to 12, so the overlap is unchanged
// (30% of the old diameter) and the ink still spans 3..21 on both axes. That
// span is what puts it at the same OPTICAL size as the rest of the settings
// list; the first cut, at r 5.2, measured the smallest ink box in the whole
// column. Only the split between the two rings moved — keep the sum and the
// centre distance if either radius is ever retuned.
// It MIRRORS under RTL (user directive 2026-07-30), in the one place it is
// drawn, so every surface it appears on flips together: the dock, the Circles
// emblem, the create-group button, and both "you two are already connected"
// chips. The pair runs on a diagonal, and a diagonal is direction — read
// right-to-left it has to lean the other way, exactly as the app's chevrons do
// (BackIcon). A horizontal flip about the box's own centre, which is what
// `translate(24,0) scale(-1,1)` is on a 24-unit viewBox: the two rings are
// mirror images of each other, so the weave (each ring passing over the other
// once and under it once) survives the flip untouched.
export function GroupsIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <G transform={isRTL ? 'translate(24, 0) scale(-1, 1)' : undefined}>
        <Path d="M 7.43 16.02 A 6.7 6.7 0 1 1 13.27 15.42" />
        <Path d="M 18.62 11.27 A 5.3 5.3 0 1 1 14.02 10.63" />
      </G>
    </Glyph>
  )
}


// Plain single-stroke camera: the photo menu's "add a photo" row, and home's
// centre circle once the browse allowance is spent — the one place in the app
// where a glyph is painted at CENTER_GLYPH_SIZE (78dp, i.e. a 24-unit path
// blown up 3.25×).
//
// THE LENS MUST CLEAR THE BODY'S OWN LINES, AND IT IS THE STROKE THAT DECIDES
// IT (user report 2026-08-01: "there is a problem with the camera's bottom
// line"). At icon sizes an r=3.6 lens inside a body whose floor sat at y=19
// looked merely tight; the two strokes are 2 units WIDE, so their edges met at
// 18.1 against 18.0 — the lens and the floor were one shape, and blown up to
// 78dp that overlap is 3px of the bottom line eaten by the circle. The body is
// a unit taller now (7.5..19.5), the lens a step smaller (r=3) and centred in
// it, which leaves a full unit of air above and below the circle: the gap is
// stated in the same units as the strokes it separates, so it survives every
// size this glyph is drawn at. The corner radius (2) is the stroke's own width
// for the same reason — a radius under it rounds nothing and reads as a lump.
export function CameraIcon({ color = INK, size = ICON.lg }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9.5a2 2 0 0 1 2-2h2.5L9 4.5h6l1.5 3H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Circle cx="12" cy="13.5" r="3" />
    </Glyph>
  )
}

// ── The photo menu's icons ─────────────────────────────────────────────────
// Two arrows swapping: this photo goes, that one comes, and the slot stays
// where it is. (It was deleted for an afternoon on 2026-07-31, on "replacing is
// deleting and adding" — the user put the row back the same day, so the mark
// came back with it.)

export function PhotoReplaceIcon({ color, size = ICON.xxl }: IconProps & { color: string }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9h13l-3-3" />
      <Path d="M20 15H7l3 3" />
    </Glyph>
  )
}

export function PhotoTrashIcon({ color, size = ICON.xxl }: IconProps & { color: string }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Glyph>
  )
}

// ── Action overlays (over photos) ──────────────────────────────────────────

// HeartIcon — the app's solid filled heart mark. `stroke` defaults to `color`,
// so omitting it yields a clean single-color glyph.
//
// NO CALL SITE since 2026-08-02: it was the page1 card's "invite this person"
// action for as long as the card existed, and that button wears ChatIcon now on
// both sides of an invitation (see ChatIcon below). Kept as artwork, unused.
//
// NOT the currency — that's CreditIcon. Drawing money with this glyph made the
// cost badge dissolve into the button it sat on (renamed hearts -> credits,
// 2026-07-22).
export function HeartIcon({
  color = INK,
  stroke = color,
  size = ICON.xxxl,
}: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Glyph>
  )
}

// CreditIcon — the credits currency mark: a cut gem (user directive
// 2026-07-29). It used to be a coin — a rim with a centre pip — and that
// silhouette is the same one every radio button, record dot and target uses,
// so the settings row read as a toggle rather than a wallet. A faceted gem has
// no such collision: nothing else in the app is a downward-pointing polygon.
//
// Named for the JOB, not the shape, so a future redraw is not a rename.
//
// Drawn in ONE colour with transparent gaps, so it picks up whatever surface
// it sits on (the CreditCost capsule, a settings row, the buy sheet) without a
// second colour or any gradient. Three strokes only — outline, girdle, crown
// facets — because a full facet map turns to mush at ICON.sm (16dp).
//
// The artwork is OPTICALLY centred, not geometrically: the ink runs y=5..21.5
// in a 24 box, so there is more air above it than below. A gem is top-heavy —
// its widest stroke (the girdle) sits in the upper half and everything below
// converges to a point — so its centre of ink lands ~1 unit above the box
// centre, and a box-centred gem reads as riding high beside its label. The
// whole shape is therefore pushed 1 unit down IN THE ARTWORK. Do not "fix"
// this by nudging the glyph in JS: GlyphSlot centres the BOX by measuring the
// label's real line box, and that part is already right (see CLAUDE.md).
export function CreditIcon({ color = INK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      {/* Crown (flat top) → girdle corners → pavilion tip. */}
      <Path d="M7 5h10l4.5 6L12 21.5 2.5 11z" />
      {/* The girdle: the widest line, what makes it read as a cut stone. */}
      <Line x1="2.5" y1="11" x2="21.5" y2="11" />
      {/* One polyline for both crown facets and both pavilion edges. */}
      <Polyline points="7 5 9 11 12 21.5 15 11 17 5" />
    </Glyph>
  )
}

// ── Chat-specific icons ────────────────────────────────────────────────────

export function SendIcon({ color = WHITE, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={isRTL ? 'M22 21L1 12 22 3v7l-15 2 15 2z' : 'M2 21l21-9L2 3v7l15 2-15 2z'} />
    </Glyph>
  )
}

export function MicIcon({ color = WHITE, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 1c-2.2 0-4 1.8-4 4v6c0 2.2 1.8 4 4 4s4-1.8 4-4V5c0-2.2-1.8-4-4-4z" />
      <Path d="M19 10a7 7 0 0 1-14 0" />
      <Path d="M12 19v3" />
      <Path d="M8 22h8" />
    </Glyph>
  )
}

// ── Media transport ────────────────────────────────────────────────────────

// Stop — the filled rounded square that ends a recording. Same rounded-square
// family as PauseIcon's bars, at the same default size.
export function StopIcon({ color = WHITE, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x={4} y={4} width={16} height={16} rx={3} />
    </Glyph>
  )
}

export function PauseIcon({ color = WHITE, stroke, size = ICON.xxl }: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={stroke ? STROKE.thick : 0} strokeLinejoin="round">
      <Rect x="6" y="5" width="4" height="14" rx="1" />
      <Rect x="14" y="5" width="4" height="14" rx="1" />
    </Glyph>
  )
}

export function EyeOffIcon({ color = WHITE, size = 28 }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.medium} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-1.67 2.68" />
      <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s4 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <Path d="M2 2l20 20" />
    </Glyph>
  )
}

export function EyeOpenIcon({ color = WHITE, size = 28 }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.medium} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <Circle cx={12} cy={12} r={3} />
    </Glyph>
  )
}

// Speech-bubble glyph for the collapsed side tab when a chat is the active
// surface. Same single-stroke STROKE.medium weight as the megaphone/eye
// family it shares the tab indicator slot with, so swapping between them
// reads as one icon morphing, not a weight jump.
// FILLED, deliberately: an outline glyph read as lighter than the round button
// carrying it. It is the mark of the card's primary action in every state that
// has one — open the chat, accept an invitation, and (since 2026-08-02) send
// one, which is the heart's old job: a heart says "this person", and what an
// invitation offers on either side is the conversation.
export function ChatIcon({ color = WHITE, stroke = color, size = 28 }: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={STROKE.medium} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Glyph>
  )
}

export function InboxIcon({ color = WHITE, size = ICON.sm }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <Path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Glyph>
  )
}

