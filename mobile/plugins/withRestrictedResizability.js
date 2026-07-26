const { withAndroidManifest } = require('@expo/config-plugins')

// Android 16 (targetSdk 36) IGNORES `android:screenOrientation` /
// resizability / aspect-ratio restrictions on displays whose smallest width is
// >= 600dp (tablets, unfolded foldables, desktop windowing). Once is a
// portrait-only phone UI, so without this it would be handed a landscape,
// freely resizable window it was never laid out for.
//
// This is Google's documented TEMPORARY opt-out, declared once at the
// <application> level so it also covers activities that come from libraries
// (e.g. Play Services' GmsBarcodeScanningDelegateActivity, pulled in by
// google-signin, which declares PORTRAIT itself). It stops working once the
// app targets API 37 — at that point the UI has to become adaptive for real.
//
// https://developer.android.com/about/versions/16/behavior-changes-16
const PROPERTY = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY'

module.exports = function withRestrictedResizability(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0]
    if (!application) return cfg
    const properties = application.property ?? (application.property = [])
    const existing = properties.find(
      (p) => p.$?.['android:name'] === PROPERTY,
    )
    if (existing) existing.$['android:value'] = 'true'
    else properties.push({ $: { 'android:name': PROPERTY, 'android:value': 'true' } })
    return cfg
  })
}
