import { I18nManager } from 'react-native'
import { isRTL as desiredRTL } from './src/i18n'

// Align the native RTL flag with the app's detected language. On iOS,
// I18nManager.isRTL reflects the OS locale rather than the app's language
// choice, so Hebrew (and other RTL languages) render LTR unless we force
// the flag here. allowRTL + forceRTL persist via NSUserDefaults, so the
// swap only needs to happen once — on first launch the native layout
// requires a relaunch to flip fully; in dev we reload immediately.
if (I18nManager.isRTL !== desiredRTL) {
  I18nManager.allowRTL(desiredRTL)
  I18nManager.forceRTL(desiredRTL)
  if (__DEV__) {
    const { DevSettings } = require('react-native')
    setTimeout(() => DevSettings.reload(), 0)
  }
}

import 'expo-router/entry'
