import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

// Livo brand logo: two tangent circles (green + gray) with a white glow
// at the single point of tangency. Pass `size` to scale uniformly.
// viewBox: 100×100. Circles are externally tangent — distance between
// centers (60,37)→(28,75) ≈ 50 = r32 + r18.
export function LivoLogo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <Stop offset="0%"  stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="40%" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Large green circle */}
      <Circle cx="60" cy="37" r="32" fill="#1AC944" />

      {/* Small gray circle */}
      <Circle cx="28" cy="75" r="18" fill="#767676" />

      {/* White glow at touch point (39, 62) */}
      <Circle cx="39" cy="62" r="9" fill="url(#glowGrad)" />
      <Circle cx="39" cy="62" r="2.5" fill="#ffffff" opacity="0.95" />
    </Svg>
  )
}
