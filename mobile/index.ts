import { I18nManager } from 'react-native'
import { isRTL as desiredRTL } from './src/i18n'

// Align the native RTL flag with the app's detected language. On iOS,
// I18nManager.isRTL reflects the OS locale rather than the app's language
// choice, so Hebrew renders LTR unless we force the flag here. allowRTL +
// forceRTL persist via NSUserDefaults but the current bridge keeps the old
// layout direction — a JS reload re-creates the native views with the new
// flag. In dev we use DevSettings; in production expo-updates' reloadAsync
// is the equivalent. Without this, a first-launch Hebrew user on an
// LTR-OS iPhone sees Hebrew text inside an LTR layout until they manually
// cold-restart the app.
if (I18nManager.isRTL !== desiredRTL) {
  I18nManager.allowRTL(desiredRTL)
  I18nManager.forceRTL(desiredRTL)
  if (__DEV__) {
    const { DevSettings } = require('react-native')
    setTimeout(() => DevSettings.reload(), 0)
  } else {
    const Updates = require('expo-updates')
    setTimeout(() => { Updates.reloadAsync().catch(() => {}) }, 0)
  }
}

import 'expo-router/entry'
