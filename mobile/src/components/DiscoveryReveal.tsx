import { View, StyleSheet } from 'react-native'

export type RevealPhase = 'idle' | 'reveal' | 'done'

type DiscoveryRevealProps = {
  enabled?: boolean
  centerAvatarUrl?: string | null
  onComplete?: () => void
  children: (api: { onImagesReady: () => void; revealPhase: RevealPhase }) => React.ReactNode
}

export function DiscoveryReveal({ children, onComplete }: DiscoveryRevealProps) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {children({ onImagesReady: () => onComplete?.(), revealPhase: 'done' })}
    </View>
  )
}
