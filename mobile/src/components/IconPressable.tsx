import { useState, type ReactNode } from 'react'
import { View, type ViewStyle, type StyleProp } from 'react-native'

// Tap target built on raw View responder callbacks instead of Pressable /
// TouchableOpacity. Both of those ship with an aggressive cancel-on-movement
// heuristic that fires pressIn + pressOut without onPress on small icon
// buttons (RN 0.81 Pressability), which reads to the user as a "missed tap".
// The bare responder flow we use here fires onPress on every clean release —
// the trade-off is we manage the pressed state manually and don't get the
// long-press / repeat / accessibility scaffolding Pressable provides.

export function IconPressable({
  onPress,
  style,
  pressedStyle,
  hitSlop = 16,
  disabled,
  children,
}: {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  pressedStyle?: StyleProp<ViewStyle>
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number }
  disabled?: boolean
  children: ReactNode
}) {
  const [pressed, setPressed] = useState(false)

  return (
    <View
      style={[style, pressed && pressedStyle]}
      hitSlop={hitSlop}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={() => setPressed(true)}
      onResponderRelease={() => {
        setPressed(false)
        if (!disabled) onPress()
      }}
      onResponderTerminate={() => setPressed(false)}
      // Keep the responder if anything else (an ancestor PanResponder, a
      // scroll view) asks to take it over mid-press. Without this the tap
      // would silently cancel on the slightest drift.
      onResponderTerminationRequest={() => false}
    >
      {children}
    </View>
  )
}
