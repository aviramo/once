// Single entry point for putting text on the system clipboard.
//
// Deliberately React Native's built-in Clipboard rather than a native module
// (expo-clipboard / @react-native-clipboard/clipboard): those need a new native
// build to reach devices, and this one ships as a JS-only change over the
// already-published binary. If RN ever drops it from core, swapping the import
// here is the whole migration — no call site knows which implementation it got.
import { Clipboard } from 'react-native'

export function copyToClipboard(text: string): void {
  Clipboard.setString(text)
}
