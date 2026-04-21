import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// App is always in foreground when this handler fires — suppress visual display.
// Notifications are only meaningful when the app is closed/backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
})

const PUSH_TOKEN_KEY = 'livo_push_token'

export type NotifPermission = 'granted' | 'denied' | 'undetermined'

/** Check current notification permission without prompting. */
export async function getNotifPermission(): Promise<NotifPermission> {
  const res = await Notifications.getPermissionsAsync()
  if (res.status === 'granted') return 'granted'
  // On Android 13+ a fresh install reports status='denied' but
  // canAskAgain=true — the user was never prompted. Treat that as
  // undetermined so the home screen shows the prompt button.
  if (res.canAskAgain) return 'undetermined'
  return 'denied'
}

/** Request notification permission from the OS. Returns the new status. */
export async function requestNotifPermission(): Promise<NotifPermission> {
  const res = await Notifications.requestPermissionsAsync()
  if (res.status === 'granted') return 'granted'
  if (res.canAskAgain) return 'undetermined'
  return 'denied'
}

/**
 * Get the Expo push token and persist it locally.
 * Returns the token string, or null if unavailable.
 * Does NOT send to the server — the caller bundles it into app/start.
 */
export async function ensurePushToken(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  if (!projectId) return null

  let token: string
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  } catch (e) {
    console.log('[push] getExpoPushTokenAsync failed:', e)
    return null
  }

  // Check if changed from what we had saved
  const prev = await AsyncStorage.getItem(PUSH_TOKEN_KEY)
  if (token !== prev) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token)
  }

  return token
}

/** Get the locally-saved push token, if any. */
export async function getSavedPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY)
}

export function unregisterPushNotifications() {
  AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => {})
}

/** Dismiss all notifications from the notification center. */
export function dismissAllNotifications() {
  Notifications.dismissAllNotificationsAsync().catch(() => {})
}
