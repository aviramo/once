import * as Location from 'expo-location'
import { Linking, Platform } from 'react-native'
import * as IntentLauncher from 'expo-intent-launcher'

export type LocPermission = 'granted' | 'denied' | 'undetermined' | 'services-off'

/** Check current foreground location permission without prompting.
 *  Never rejects — falls back to 'undetermined' on native-module errors so
 *  the caller can still surface the in-app prompt. */
export async function getLocPermission(): Promise<LocPermission> {
  try {
    // Check device-level location services first
    const servicesOn = await Location.hasServicesEnabledAsync()
    if (!servicesOn) return 'services-off'

    const res = await Location.getForegroundPermissionsAsync()
    if (res.status === 'granted') return 'granted'
    // Same pattern as notifications: canAskAgain distinguishes "never asked"
    // from "permanently denied" on Android.
    if (res.canAskAgain) return 'undetermined'
    return 'denied'
  } catch (e) {
    console.log('[loc] getForegroundPermissionsAsync failed:', e)
    return 'undetermined'
  }
}

/** Request foreground location permission. Returns the new status. */
export async function requestLocPermission(): Promise<LocPermission> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync()
    if (!servicesOn) return 'services-off'

    const res = await Location.requestForegroundPermissionsAsync()
    if (res.status === 'granted') return 'granted'
    if (res.canAskAgain) return 'undetermined'
    return 'denied'
  } catch (e) {
    console.log('[loc] requestForegroundPermissionsAsync failed:', e)
    return 'undetermined'
  }
}

/** Race getCurrentPositionAsync and watchPositionAsync — whichever delivers
 *  the first fix wins. On a cold Android GPS, getCurrentPositionAsync via the
 *  fused provider can hang silently; watchPositionAsync wakes the GPS hardware
 *  and reliably emits a sample once it locks. */
async function raceForFirstFix(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    let done = false
    let sub: Location.LocationSubscription | null = null
    const finish = (pos: { lat: number; lng: number } | null) => {
      if (done) return
      done = true
      if (sub) sub.remove()
      resolve(pos)
    }

    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false,
    })
      .then((p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch(() => {})

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 0 },
      (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )
      .then((s) => {
        if (done) s.remove()
        else sub = s
      })
      .catch(() => {})

    setTimeout(() => finish(null), timeoutMs)
  })
}

/** Get the device's current position. Returns null on failure.
 *  Checks services first to avoid the Android system dialog. */
export async function getLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync()
    if (!servicesOn) return null

    // Last known is instant — prefer it if it's fresh (within 10 min).
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })
    if (cached) return { lat: cached.coords.latitude, lng: cached.coords.longitude }

    // Force a real GPS fix (High accuracy). On a cold start the fused provider
    // returns nothing until another app warms it up — racing watchPositionAsync
    // alongside getCurrentPositionAsync wakes the GPS hardware directly.
    const fresh = await raceForFirstFix(15_000)
    if (fresh) return fresh

    // Final fallback: last known at any age.
    const stale = await Location.getLastKnownPositionAsync()
    if (stale) return { lat: stale.coords.latitude, lng: stale.coords.longitude }
    return null
  } catch {
    return null
  }
}

/** Return the last cached position without waiting for a GPS fix. */
export async function getLastKnownLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const pos = await Location.getLastKnownPositionAsync()
    if (!pos) return null
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return null
  }
}

/** Show system dialog to enable location services. Resolves if enabled, rejects if dismissed. */
export async function enableLocationServices(): Promise<void> {
  return Location.enableNetworkProviderAsync()
}

/** Open the device-level location services settings (GPS toggle). */
export function openLocationSettings() {
  if (Platform.OS === 'android') {
    IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
    ).catch(() => Linking.openSettings())
  } else {
    // iOS has no direct deep-link to the device location toggle.
    // openSettings takes the user to the app's settings page where
    // the Location row is visible.
    Linking.openSettings()
  }
}

/** Subscribe to continuous location updates.
 *  Returns a subscription object — call .remove() to stop watching.
 *  `onLocation` fires whenever the device moves significantly. */
export async function watchLocation(
  onLocation: (coords: { lat: number; lng: number }) => void,
): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 100,   // metres – fire only after meaningful movement
      timeInterval: 60_000,    // ms – at most once per minute
    },
    (pos) => onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
  )
}

/** Open the app's own settings page — the deepest destination either platform
 *  offers for a runtime permission the user has permanently denied.
 *
 *  iOS lands on Settings > Once, whose Location row IS the
 *  Never / Ask / While-Using choice, one tap down.
 *
 *  Android lands on App info, whose Permissions > Location row is the same
 *  choice two taps down. The per-permission page itself cannot be reached from
 *  here: `android.intent.action.MANAGE_APP_PERMISSION` resolves to
 *  PermissionController's ManagePermissionsActivity, declared with
 *  `android:permission="android.permission.GRANT_RUNTIME_PERMISSIONS"` — a
 *  signature|installer|verifier permission no third-party app can hold — and
 *  no public Settings action exposes a runtime permission (only the special
 *  accesses: overlay, all-files). Notifications ARE deep-linkable, via the
 *  public APP_NOTIFICATION_SETTINGS (see openNotifSettings); location has no
 *  equivalent. This used to try `android.settings.APP_PERMISSION_DETAILS`
 *  first, which is not an Android action at all — it resolves to no activity,
 *  so every call already threw and fell through to exactly this page.
 *
 *  Linking.openSettings() IS that intent on Android
 *  (ACTION_APPLICATION_DETAILS_SETTINGS + `package:<self>`), plus NO_HISTORY,
 *  so backing out of the permission page returns straight to the app. */
export function openLocPermSettings() {
  Linking.openSettings()
}
