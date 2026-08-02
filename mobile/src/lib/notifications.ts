import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as IntentLauncher from 'expo-intent-launcher'
import { STORAGE } from '../keys'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
})

const PUSH_TOKEN_KEY = STORAGE.pushToken

export type NotifPermission = 'granted' | 'denied' | 'undetermined'

/** Check current notification permission without prompting.
 *  Never rejects — falls back to 'undetermined' on native-module errors so
 *  the caller can still surface the in-app prompt. */
export async function getNotifPermission(): Promise<NotifPermission> {
  try {
    const res = await Notifications.getPermissionsAsync()
    if (res.status === 'granted') return 'granted'
    // On Android 13+ a fresh install reports status='denied' but
    // canAskAgain=true — the user was never prompted. Treat that as
    // undetermined so the home screen shows the prompt button.
    if (res.canAskAgain) return 'undetermined'
    return 'denied'
  } catch (e) {
    console.log('[notif] getPermissionsAsync failed:', e)
    return 'undetermined'
  }
}

/** Request notification permission from the OS. Returns the new status. */
export async function requestNotifPermission(): Promise<NotifPermission> {
  try {
    const res = await Notifications.requestPermissionsAsync()
    if (res.status === 'granted') return 'granted'
    if (res.canAskAgain) return 'undetermined'
    return 'denied'
  } catch (e) {
    console.log('[notif] requestPermissionsAsync failed:', e)
    return 'undetermined'
  }
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
 *
 * A handled tap is CONSUMED (clearLastNotificationResponse): expo caches the
 * last response and hands it to whoever asks afterwards, so a mid-session tap
 * stayed on file and the next reader — getInitialNotificationType(), which any
 * home REMOUNT calls (returning from onboarding, a routing-guard re-route) —
 * replayed it as a launch notification and raised the chat / Circles sheet
 * with nothing touched. Clearing here covers every consumer at once; the
 * cold-start path is unaffected, since the launch response is read during
 * render, before this listener is ever subscribed.
 */
export function addNotificationTapListener(
  handler: (type: string, groupId?: string, actorId?: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data
    const type = data?.type as string | undefined
    const groupId = typeof data?.group_id === 'string' ? data.group_id : undefined
    const actorId = typeof data?.actor_id === 'string' ? data.actor_id : undefined
    if (type) handler(type, groupId, actorId)
    clearInitialNotification()
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

/** The `group_id` of the cold-start notification (group_join / group_approved
 *  deep-link to a group), or null. Companion to getInitialNotificationType. */
export function getInitialNotificationGroupId(): string | null {
  try {
    const r = Notifications.getLastNotificationResponse()
    const gid = r?.notification.request.content.data?.group_id
    return typeof gid === 'string' ? gid : null
  } catch {
    return null
  }
}

/** WHO the cold-start notification is about: the person who asked to join, or
 *  the friend who just linked. What lets the tap land on that person's page
 *  instead of on a list (server sends it as `actor_id` on every push). */
export function getInitialNotificationActorId(): string | null {
  try {
    const r = Notifications.getLastNotificationResponse()
    const aid = r?.notification.request.content.data?.actor_id
    return typeof aid === 'string' ? aid : null
  } catch {
    return null
  }
}

/** Clears the cached cold-start notification so it doesn't replay on remount. */
export function clearInitialNotification() {
  try { Notifications.clearLastNotificationResponse() } catch {}
}

/** Open the app's notification settings page directly. */
export function openNotifSettings() {
  if (Platform.OS === 'android') {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.aviramo.once'
    IntentLauncher.startActivityAsync(
      'android.settings.APP_NOTIFICATION_SETTINGS',
      { extra: { 'android.provider.extra.APP_PACKAGE': pkg } },
    ).catch(() => Linking.openSettings())
  } else {
    Linking.openSettings()
  }
}
