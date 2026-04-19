import * as Location from 'expo-location'
import { Linking, Platform } from 'react-native'
import * as IntentLauncher from 'expo-intent-launcher'
import Constants from 'expo-constants'

export type LocPermission = 'granted' | 'denied' | 'undetermined' | 'services-off'

/** Check current foreground location permission without prompting. */
export async function getLocPermission(): Promise<LocPermission> {
  // Check device-level location services first
  const servicesOn = await Location.hasServicesEnabledAsync()
  if (!servicesOn) return 'services-off'

  const res = await Location.getForegroundPermissionsAsync()
  if (res.status === 'granted') return 'granted'
  // Same pattern as notifications: canAskAgain distinguishes "never asked"
  // from "permanently denied" on Android.
  if (res.canAskAgain) return 'undetermined'
  return 'denied'
}

/** Request foreground location permission. Returns the new status. */
export async function requestLocPermission(): Promise<LocPermission> {
  const servicesOn = await Location.hasServicesEnabledAsync()
  if (!servicesOn) return 'services-off'

  const res = await Location.requestForegroundPermissionsAsync()
  if (res.status === 'granted') return 'granted'
  if (res.canAskAgain) return 'undetermined'
  return 'denied'
}

/** Get the device's current position. Returns null on failure.
 *  Falls back to last known position if a fresh fix isn't available quickly.
 *  Checks services first to avoid the Android system dialog. */
export async function getLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync()
    if (!servicesOn) return null
    // Try to get a fresh fix; fall back to the last cached position on failure
    // (e.g. GPS hasn't locked yet on cold start).
    let pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null)
    if (!pos) pos = await Location.getLastKnownPositionAsync()
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

/** Open the app-level permission settings (notification / location toggle). */
export function openAppSettings() {
  if (Platform.OS === 'android') {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.syncwish.app'
    // Try to open the app's permissions page directly; fall back to app details → generic settings.
    IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_PERMISSIONS',
      { extra: { 'android.intent.extra.PACKAGE_NAME': pkg } },
    ).catch(() =>
      IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: `package:${pkg}` },
      ),
    ).catch(() => Linking.openSettings())
  } else {
    Linking.openSettings()
  }
}
