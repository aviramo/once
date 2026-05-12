import { I18nManager } from 'react-native'
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg'
import { BLACK, BLACK_STRONG, WHITE, PRIMARY } from '../colors'
import { ICON, STROKE } from '../tokens'

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
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}

export function ChevronUpIcon({ color = BLACK, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 15 12 9 18 15" />
    </Svg>
  )
}

export function ChevronDownIcon({ color = BLACK, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  )
}

export function CheckIcon({ color = PRIMARY, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="5 12 10 17 19 7" />
    </Svg>
  )
}

// ── Close / dots ───────────────────────────────────────────────────────────

export function CloseIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  )
}

// Chunky close X. Same shape as CloseIcon but with the visual weight of
// HeartIcon — heavy rounded strokes so it reads as a "bold mark" rather
// than a thin nav glyph. Used by the profile-sheet tab.
export function CloseBoldIcon({ color = BLACK, size = ICON.xxl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.heavy} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="17" y1="7" x2="7" y2="17" />
      <Line x1="7" y1="7" x2="17" y2="17" />
    </Svg>
  )
}

export function DotsIcon({ color = BLACK, size = ICON.lg }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={12} cy={5} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={12} cy={19} r={1.6} />
    </Svg>
  )
}

// ── Field / list-row icons (gray stroke by default) ────────────────────────

export function SlidersIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="4" y1="21" x2="4" y2="14" />
      <Line x1="4" y1="10" x2="4" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12" y2="3" />
      <Line x1="20" y1="21" x2="20" y2="16" />
      <Line x1="20" y1="12" x2="20" y2="3" />
      <Line x1="1" y1="14" x2="7" y2="14" />
      <Line x1="9" y1="8" x2="15" y2="8" />
      <Line x1="17" y1="16" x2="23" y2="16" />
    </Svg>
  )
}

export function MapPinIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </Svg>
  )
}

export function GenderIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="10" r="5" />
      <Line x1="16" y1="6" x2="20" y2="2" />
      <Polyline points="16 2 20 2 20 6" />
      <Line x1="12" y1="15" x2="12" y2="22" />
      <Line x1="9" y1="19" x2="15" y2="19" />
    </Svg>
  )
}

export function ResetIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
    </Svg>
  )
}

export function AppCalendarIcon({ color = BLACK_STRONG, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 5h18v16H3z" />
      <Path d="M3 9h18" />
      <Path d="M8 3v4" />
      <Path d="M16 3v4" />
    </Svg>
  )
}

// ── Account / system icons ─────────────────────────────────────────────────

export function SignOutIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  )
}

export function TrashIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  )
}

export function InfoIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
  )
}

export function UserIcon({ color = BLACK, size = ICON.md }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

// ── Add-options tile icons ─────────────────────────────────────────────────

export function AddPhotoIcon({ color, size = ICON.xxxl }: IconProps & { color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thin + 0.3} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="5" width="18" height="14" rx="2" />
      <Circle cx="12" cy="12" r="3" />
      <Line x1="17.5" y1="3" x2="17.5" y2="7" />
      <Line x1="15.5" y1="5" x2="19.5" y2="5" />
    </Svg>
  )
}

export function FamilyKidsIcon({ color, size = ICON.xxxl }: IconProps & { color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thin + 0.3} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="8" cy="6" r="2.5" />
      <Path d="M4 21v-7a4 4 0 0 1 8 0v7" />
      <Circle cx="17" cy="9" r="2" />
      <Path d="M14 21v-5a3 3 0 0 1 6 0v5" />
    </Svg>
  )
}

// ── Photo-options popup icons ──────────────────────────────────────────────

export function PhotoReplaceIcon({ color, size = ICON.xl }: IconProps & { color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9h13l-3-3" />
      <Path d="M20 15H7l3 3" />
    </Svg>
  )
}

export function PhotoTrashIcon({ color, size = ICON.xl }: IconProps & { color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Svg>
  )
}

// ── Action overlays (over photos) ──────────────────────────────────────────

export function HeartIcon({
  color = PRIMARY,
  stroke = WHITE,
  size = ICON.xxxl,
}: IconProps & { stroke?: string } = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={stroke} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  )
}

// ── Chat-specific icons ────────────────────────────────────────────────────

export function SendIcon({ color = WHITE, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={isRTL ? 'M22 21L1 12 22 3v7l-15 2 15 2z' : 'M2 21l21-9L2 3v7l15 2-15 2z'} />
    </Svg>
  )
}

export function MicIcon({ color = WHITE, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.thick} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 1c-2.2 0-4 1.8-4 4v6c0 2.2 1.8 4 4 4s4-1.8 4-4V5c0-2.2-1.8-4-4-4z" />
      <Path d="M19 10a7 7 0 0 1-14 0" />
      <Path d="M12 19v3" />
      <Path d="M8 22h8" />
    </Svg>
  )
}

// ── Media transport ────────────────────────────────────────────────────────

export function PlayIcon({ color = WHITE, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  )
}

export function PauseIcon({ color = WHITE, size = ICON.xl }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x="6" y="5" width="4" height="14" rx="1" />
      <Rect x="14" y="5" width="4" height="14" rx="1" />
    </Svg>
  )
}

export function InboxIcon({ color = WHITE, size = ICON.sm }: IconProps = {}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <Path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  )
}
