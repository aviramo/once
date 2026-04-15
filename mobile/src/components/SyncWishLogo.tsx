import Svg, { Defs, LinearGradient, Stop, G, Path, Circle, Rect, Symbol, Use } from 'react-native-svg'

// Canonical brand logo. Source of truth: assets/syncwish-logo.svg.
// Two planes meeting at the center on a purple gradient badge.
export function SyncWishLogo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="swLogoBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#7c3aed" />
          <Stop offset="100%" stopColor="#4c1d95" />
        </LinearGradient>
        <Symbol id="swLogoPlane" viewBox="0 0 120 120">
          <Path d="M 17.5 57.5 L 100 95 L 57.5 60 Z" fill="#ffffff" />
          <Path d="M 57.5 60 L 100 95 L 73.75 21.25 Z" fill="#ffffff" fillOpacity={0.55} />
          <Path
            d="M 100 95 L 57.5 60"
            stroke="#4c1d95"
            strokeWidth={2}
            strokeLinecap="round"
            strokeOpacity={0.35}
          />
          <Circle cx={30} cy={45} r={3} fill="#ffffff" fillOpacity={0.8} />
          <Circle cx={17.5} cy={32.5} r={2.5} fill="#ffffff" fillOpacity={0.55} />
          <Circle cx={7.5} cy={20} r={2} fill="#ffffff" fillOpacity={0.32} />
        </Symbol>
      </Defs>

      <Rect width={1024} height={1024} rx={224} fill="url(#swLogoBg)" />

      <G transform="translate(-30 0) scale(5.5)">
        <Use href="#swLogoPlane" width={120} height={120} />
      </G>
      <G transform="rotate(180 512 512) translate(-30 0) scale(5.5)">
        <Use href="#swLogoPlane" width={120} height={120} />
      </G>
    </Svg>
  )
}
