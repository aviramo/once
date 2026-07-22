import { ComponentProps, createContext, useContext, type ReactNode } from 'react'
import { I18nManager } from 'react-native'
import Svg, { Path, Circle, Line, Polyline, Rect, G } from 'react-native-svg'
import { INK, BLACK, BLACK_STRONG, WHITE, PRIMARY } from '../colors'
import { ICON, STROKE } from '../tokens'
import { iconScale, FONT_SCALE } from '../fonts'

// The OS-font-scale ceiling every Glyph below this point obeys. Default is
// `body`, matching iconScale's own default: a glyph beside text grows with it.
const GlyphScaleContext = createContext<number>(FONT_SCALE.body)

/** Declares the font-scale ceiling for every glyph rendered inside it.
 *
 *  A container whose own size is a fixed dp must pin this to FONT_SCALE.ui
 *  (1.0), otherwise the glyph keeps growing while the box does not and the
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
// (default = BLACK) and an optional `size`. If you need a new icon,
// add it here. Don't inline an Svg in a screen — the icon will end up
// duplicated the first time someone uses it twice.

const isRTL = I18nManager.isRTL

type IconProps = {
  color?: string
  size?: number
}

// ── Chevrons / arrows ──────────────────────────────────────────────────────

export function BackIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Glyph>
  )
}

export function ChevronUpIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 15 12 9 18 15" />
    </Glyph>
  )
}

export function ChevronDownIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Glyph>
  )
}

export function CheckIcon({ color = PRIMARY, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="5 12 10 17 19 7" />
    </Glyph>
  )
}

// ── Close / dots ───────────────────────────────────────────────────────────

export function CloseIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
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
export function CloseBoldIcon({ color = BLACK, stroke, size = ICON.xxl }: IconProps & { stroke?: string } = {}) {
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

// Hamburger. The floating menu affordance on the home screen: three even
// rounded rules at the same STROKE.base weight as CloseIcon, so the open glyph
// and the close glyph of the menu sheet read as one pair.
export function HamburgerIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round">
      <Line x1="4" y1="7" x2="20" y2="7" />
      <Line x1="4" y1="12" x2="20" y2="12" />
      <Line x1="4" y1="17" x2="20" y2="17" />
    </Glyph>
  )
}

// Vertical ellipsis. Opens an actions menu from a header row (the chat sheet's
// leave / block menu). Filled dots rather than stroked circles so it stays
// legible at small sizes.
export function DotsVerticalIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx="12" cy="5" r="1.8" />
      <Circle cx="12" cy="12" r="1.8" />
      <Circle cx="12" cy="19" r="1.8" />
    </Glyph>
  )
}

// ── Field / list-row icons (gray stroke by default) ────────────────────────

export function SlidersIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <G rotation={90} origin="12, 12">
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

export function MapPinIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </Glyph>
  )
}

export function BellIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
      <Path d="M10 21a2 2 0 0 0 4 0" />
    </Glyph>
  )
}

export function WifiOffIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
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
export function BlockIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
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
export function ShieldIcon({ color = BLACK, stroke, fill, size = ICON.xxl }: IconProps & { stroke?: string; fill?: string } = {}) {
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

export function RadiusIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="1.25" fill={color} stroke="none" />
      <Line x1="12" y1="12" x2="18.36" y2="5.64" />
    </Glyph>
  )
}

export function GenderIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
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

export function ResetIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
    </Glyph>
  )
}

export function AppCalendarIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 5h18v16H3z" />
      <Path d="M3 9h18" />
      <Path d="M8 3v4" />
      <Path d="M16 3v4" />
    </Glyph>
  )
}

// ── Account / system icons ─────────────────────────────────────────────────

export function SignOutIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Glyph>
  )
}

export function TrashIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
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

export function InfoIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </Glyph>
  )
}

// Bug glyph — the settings "report a bug" row and the bug-report sheet header.
export function BugIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m8 2 1.88 1.88" />
      <Path d="M14.12 3.88 16 2" />
      <Path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <Path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <Path d="M12 20v-9" />
      <Path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <Path d="M6 13H2" />
      <Path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <Path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <Path d="M22 13h-4" />
      <Path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </Glyph>
  )
}

export function UserIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
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
export function UserPlusIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M19 8v6" />
      <Path d="M22 11h-6" />
    </Glyph>
  )
}

// Two silhouettes — the "members of a group" mark used by the settings
// "my groups" row. Visually distinct from UserIcon (single silhouette) so
// the two adjacent rows in the account card don't read as the same icon.
// Pencil glyph — "edit" affordance (settings profile card). Accepts an
// optional strokeWidth so callers can render a wider dark copy behind a
// thinner white copy to fake a halo (the cross-platform replacement for the
// filter:dropShadow that rendered as a filled square on iOS).
export function PencilIcon({ color = BLACK, size = ICON.md, strokeWidth = STROKE.base }: IconProps & { strokeWidth?: number } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Glyph>
  )
}

export function GroupsIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M13 3.13a4 4 0 0 1 0 7.75" />
      <Path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx="8" cy="7" r="4" />
    </Glyph>
  )
}

// Age chip on the profile card. A bare number with the generic InfoIcon
// didn't read as "age"; the candle-cake glyph makes it self-explanatory in
// every language. Flame dots use the same near-zero round-capped trick as
// InfoIcon's `12 → 12.01`.
export function CakeIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
      <Path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
      <Line x1="2" y1="21" x2="22" y2="21" />
      <Line x1="7" y1="8" x2="7" y2="11" />
      <Line x1="12" y1="8" x2="12" y2="11" />
      <Line x1="17" y1="8" x2="17" y2="11" />
      <Line x1="7" y1="4" x2="7.01" y2="4" />
      <Line x1="12" y1="4" x2="12.01" y2="4" />
      <Line x1="17" y1="4" x2="17.01" y2="4" />
    </Glyph>
  )
}

export function MailIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="5" width="18" height="14" rx="2" />
      <Path d="M3 7l9 7 9-7" />
    </Glyph>
  )
}

// Plain single-stroke camera. Also the glyph on the own-profile card's
// "add a photo" chip, at the chips' shared ICON.sm baseline — the old filled
// sticker pair (AddPhotoIcon / FamilyKidsIcon) went with the round buttons
// those chips replaced.
export function CameraIcon({ color = INK, size = ICON.lg }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 8h3l1.6-2.2h8.8L18 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <Circle cx="12" cy="13.5" r="3.6" />
    </Glyph>
  )
}

// ── Photo-options popup icons ──────────────────────────────────────────────

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

// HeartIcon — the app's solid filled heart mark: the like/action overlay over
// match photos (over-photo callers pass `stroke={WHITE}` for the white
// perimeter halo) and the Menu tab glyph. `stroke` defaults to `color`, so
// omitting it yields a clean single-color glyph.
//
// NOT the currency — that's CoinIcon. The heart is the "invite this person"
// affordance; drawing money with the same glyph made the cost badge dissolve
// into the button it sat on (renamed hearts -> credits, 2026-07-22).
export function HeartIcon({
  color = PRIMARY,
  stroke = color,
  size = ICON.xxxl,
}: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Glyph>
  )
}

// CoinIcon — the credits currency mark. A thick rim with a centre pip, drawn
// in ONE colour: the gaps are transparent, so it picks up whatever surface it
// sits on (the CreditCost capsule, a settings row, the buy sheet) without a
// second colour or any gradient. Reads as a coin down to ICON.sm (16dp),
// where a minted-face design would turn to mush.
export function CoinIcon({ color = PRIMARY, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" strokeWidth={STROKE.thick} />
      <Circle cx="12" cy="12" r="3.25" fill={color} stroke="none" />
    </Glyph>
  )
}

// Question-mark glyph used in place of the heart on the page2 pending-invite
// hero overlay button: same RoundButton shape and PRIMARY fill, signalling
// "what is this?" rather than a chat or like affordance.
export function QuestionIcon({
  color = PRIMARY,
  stroke = WHITE,
  size = ICON.xxxl,
}: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" fill="none" />
      <Path d="M12 17h.01" fill="none" />
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

export function PlayIcon({ color = WHITE, stroke, size = ICON.xxl }: IconProps & { stroke?: string } = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={stroke ? STROKE.thick : 0} strokeLinejoin="round">
      <Path d="M8 5v14l11-7z" />
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

export function SettingsIcon({ color = WHITE, size = ICON.md }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Glyph>
  )
}

// Megaphone-style icon used as the broadcast affordance (premium "show me to
// people" tile, broadcast-confirm popup icon). Single-stroke, currentColor so
// it reads on both PREMIUM and disabled backgrounds.
export function MegaphoneIcon({ color = WHITE, size = 28 }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.medium} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11v2a2 2 0 0 0 2 2h1l3 4h2v-12h-2l-3 4h-1a2 2 0 0 0-2 2z" />
      <Path d="M14 7a5 5 0 0 1 0 10" />
      <Path d="M18 5a8 8 0 0 1 0 14" />
    </Glyph>
  )
}

// Megaphone with a diagonal cancel slash — "stop broadcasting" affordance.
// Same body paths as MegaphoneIcon (kept in lockstep with it on purpose:
// the off variant must read as the same glyph crossed out, not a
// different megaphone).
export function MegaphoneOffIcon({ color = WHITE, size = 28 }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.medium} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11v2a2 2 0 0 0 2 2h1l3 4h2v-12h-2l-3 4h-1a2 2 0 0 0-2 2z" />
      <Path d="M14 7a5 5 0 0 1 0 10" />
      <Path d="M18 5a8 8 0 0 1 0 14" />
      <Path d="M2 2l20 20" />
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
// Filled, like HeartIcon: its only consumer is the page1 card's primary action
// button, where it stands in for the heart. An outline glyph read as lighter
// than the button it replaced.
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

// ── Typography ornaments ───────────────────────────────────────────────────

// Paired block-quote indicator. Square viewBox with tight glyph bounds — when
// laid out at size N the rendered footprint is NxN with no baseline / line-height
// dead space (unlike a literal `"` text character whose line-box leaves empty
// space above/below the visible glyph). Used by the bio bubble for the
// top/bottom quotation marks, so the bubble can stack quote/text/quote with
// uniform gaps.
export function QuoteIcon({ color = PRIMARY, size = ICON.xxxl }: IconProps = {}) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M2 3 H11 V12 L8 21 H5 V13 H2 Z" />
      <Path d="M13 3 H22 V12 L19 21 H16 V13 H13 Z" />
    </Glyph>
  )
}
