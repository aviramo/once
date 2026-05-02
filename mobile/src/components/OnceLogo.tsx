import Svg, { Path, Rect } from 'react-native-svg'

// Once brand mark: white torch handle + cream flame on the brand-orange square.
// Matches assets/icon.svg exactly so the in-app logo reads identically to the
// app icon. viewBox: 1024×1024.
//
// The `animate` and `color` props are kept for call-site compatibility but
// are intentionally no-ops: the brand mark is solid and brand-locked.
export function OnceLogo({ size = 96 }: { size?: number; animate?: boolean; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width={1024} height={1024} fill="#FF7A5C" />
      <Rect x={472} y={350} width={80} height={500} rx={40} fill="#FFFFFF" />
      <Path
        d="M512 194C565.019 194 608 236.981 608 290V321.18C608 336.837 604.144 352.253 596.774 366.067L565.28 425.097C558.342 438.104 544.797 446.222 530.055 446.222H493.945C479.203 446.222 465.658 438.104 458.72 425.097L427.226 366.067C419.856 352.253 416 336.837 416 321.18V290C416 236.981 458.981 194 512 194Z"
        fill="#FFFFFF"
      />
    </Svg>
  )
}
