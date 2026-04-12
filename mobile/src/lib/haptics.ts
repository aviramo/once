import * as Haptics from 'expo-haptics'

// Fire-and-forget haptic helpers. expo-haptics is a no-op on web and on
// devices without a Taptic engine, so we don't need to guard at call sites.

// Generic "something happened in response to my tap". Use for most buttons.
export const tap = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

// Slightly heavier feedback for events that deserve more emphasis
// (e.g. picking up a draggable item, toggling an important state).
export const tapMedium = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

// Warning-style buzz for destructive confirmations (e.g. delete account).
export const tapWarning = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
}

// Success for confirmed completions (e.g. drop into new slot after reorder).
export const tapSuccess = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}
