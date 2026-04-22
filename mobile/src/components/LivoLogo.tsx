import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg'

// Livo brand logo: two tangent circles (green + gray) with a lens-flare
// sparkle at the single point of tangency. Matches assets/icon.svg so the
// in-app logo reads identically to the app icon. viewBox: 100×100.
export function LivoLogo({ size = 96 }: { size?: number }) {
  // Tangent point of the two circles.
  const cx = 44.7
  const cy = 52.8

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="sparkGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%"   stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="25%"  stopColor="#ffffff" stopOpacity="0.85" />
          <Stop offset="60%"  stopColor="#ffffff" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Large green circle (back) */}
      <Circle cx="66.8" cy="43.75" r="23.83" fill="#1AB33D" />

      {/* Small gray circle (front, externally tangent to green) */}
      <Circle cx="28.0" cy="59.77" r="18.16" fill="#767676" />

      {/* Sparkle at tangent point */}
      <G>
        {/* Soft halo */}
        <Circle cx={cx} cy={cy} r="10.74" fill="url(#sparkGlow)" />
        {/* Lens-flare rays: wide low-opacity layer behind a crisp line
            fakes a gaussian bloom without needing SVG filters. */}
        <G stroke="#ffffff" strokeLinecap="round">
          <Line x1={cx} y1={cy - 9.3} x2={cx} y2={cy + 9.3} strokeWidth="1.2" opacity="0.35" />
          <Line x1={cx - 9.3} y1={cy} x2={cx + 9.3} y2={cy} strokeWidth="1.2" opacity="0.35" />
          <Line x1={cx} y1={cy - 9.3} x2={cx} y2={cy + 9.3} strokeWidth="0.4" opacity="0.95" />
          <Line x1={cx - 9.3} y1={cy} x2={cx + 9.3} y2={cy} strokeWidth="0.4" opacity="0.95" />
          <Line x1={cx - 5.86} y1={cy - 5.86} x2={cx + 5.86} y2={cy + 5.86} strokeWidth="0.6" opacity="0.25" />
          <Line x1={cx - 5.86} y1={cy + 5.86} x2={cx + 5.86} y2={cy - 5.86} strokeWidth="0.6" opacity="0.25" />
          <Line x1={cx - 5.86} y1={cy - 5.86} x2={cx + 5.86} y2={cy + 5.86} strokeWidth="0.2" opacity="0.6" />
          <Line x1={cx - 5.86} y1={cy + 5.86} x2={cx + 5.86} y2={cy - 5.86} strokeWidth="0.2" opacity="0.6" />
        </G>
        {/* Bright core */}
        <Circle cx={cx} cy={cy} r="1.37" fill="#ffffff" />
      </G>
    </Svg>
  )
}
