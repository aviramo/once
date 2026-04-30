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

const PUSH_TOKEN_KEY = 'once_push_token'

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

/**
 * Register a listener for when the user taps a notification.
 * The handler receives the notification `type` code (e.g. 'chat', 'invite-in').
 * Returns a cleanup function — call it on unmount.
 */
export function addNotificationTapListener(handler: (type: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const type = response.notification.request.content.data?.type as string | undefined
    if (type) handler(type)
  })
  return () => sub.remove()
}

/**
 * Returns the `data.type` of the notification that launched the app from a killed
 * state, or null if the app wasn't opened via a notification tap. Synchronous so
 * callers can use it to pick PagerView's initialPage on first render.
 */
export function getInitialNotificationType(): string | null {
  try {
    const r = Notifications.getLastNotificationResponse()
    const type = r?.notification.request.content.data?.type
    return typeof type === 'string' ? type : null
  } catch {
    return null
  }
}

/** Clears the cached cold-start notification so it doesn't replay on remount. */
export function clearInitialNotification() {
  try { Notifications.clearLastNotificationResponse() } catch {}
}
