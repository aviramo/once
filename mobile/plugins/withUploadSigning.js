const fs = require('fs')
const path = require('path')
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins')

// Sign the release bundle of a LOCAL Android build with the Play UPLOAD key.
//
// Expo's prebuild template signs `release` with `signingConfigs.debug` — fine
// for a local smoke test, but Play Console rejects such a bundle ("signed with
// the wrong key"). Since android/ is generated and gitignored, every
// `expo prebuild` throws away a hand-made fix, so the fix lives here instead.
//
// The key material is NOT in this file and not in any tracked file. It comes
// from mobile/credentials.json, which is written by:
//
//   cd mobile && npx eas credentials
//     -> Android -> production
//     -> credentials.json: Upload/Download ...
//     -> Download credentials from EAS to credentials.json
//
// That file holds the keystore + key passwords in plaintext, so it and
// credentials/ are gitignored (mobile/.gitignore).
//
// NO-OP WHEN credentials.json IS ABSENT — and that is the load-bearing part.
// EAS cloud builds (`npm run release:android`) never have this file: EAS holds
// the keystore server-side and injects signing itself. If this plugin edited
// build.gradle there, every cloud build would fail on a missing property. So
// when the file is missing we leave the template exactly as prebuild wrote it.
const PREFIX = 'ONCE_UPLOAD_'
const P_STORE_FILE = PREFIX + 'STORE_FILE'
const P_STORE_PASSWORD = PREFIX + 'STORE_PASSWORD'
const P_KEY_ALIAS = PREFIX + 'KEY_ALIAS'
const P_KEY_PASSWORD = PREFIX + 'KEY_PASSWORD'

/** The keystore block from credentials.json, or null when there is none. */
function readLocalKeystore(projectRoot) {
  const file = path.join(projectRoot, 'credentials.json')
  if (!fs.existsSync(file)) return null

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`[withUploadSigning] credentials.json is not valid JSON: ${e.message}`)
  }

  const ks = parsed?.android?.keystore
  if (!ks) return null

  const missing = ['keystorePath', 'keystorePassword', 'keyAlias', 'keyPassword']
    .filter((k) => !ks[k])
  if (missing.length) {
    throw new Error(
      `[withUploadSigning] credentials.json is missing: ${missing.join(', ')}. ` +
      're-download it with `npx eas credentials`.',
    )
  }

  // Half a downloaded credential set is worse than none: it would sign with a
  // keystore that is not the upload key and only fail at the Play upload.
  const abs = path.join(projectRoot, ks.keystorePath)
  if (!fs.existsSync(abs)) {
    throw new Error(
      `[withUploadSigning] credentials.json points at ${ks.keystorePath}, which does not exist. ` +
      're-download it with `npx eas credentials`.',
    )
  }

  // gradle's file() inside android/app/build.gradle resolves relative to
  // android/app, so the path is rebased from the project root to there.
  const storeFile = path
    .relative(path.join(projectRoot, 'android', 'app'), abs)
    .split(path.sep)
    .join('/')

  return { storeFile, storePassword: ks.keystorePassword, keyAlias: ks.keyAlias, keyPassword: ks.keyPassword }
}

/** Upsert one key in the parsed gradle.properties mod results. */
function setProperty(items, key, value) {
  const existing = items.find((i) => i.type === 'property' && i.key === key)
  if (existing) existing.value = value
  else items.push({ type: 'property', key, value })
}

module.exports = function withUploadSigning(config) {
  const keystore = readLocalKeystore(config._internal?.projectRoot ?? process.cwd())
  if (!keystore) return config

  config = withGradleProperties(config, (cfg) => {
    setProperty(cfg.modResults, P_STORE_FILE, keystore.storeFile)
    setProperty(cfg.modResults, P_STORE_PASSWORD, keystore.storePassword)
    setProperty(cfg.modResults, P_KEY_ALIAS, keystore.keyAlias)
    setProperty(cfg.modResults, P_KEY_PASSWORD, keystore.keyPassword)
    return cfg
  })

  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents

    if (src.includes('signingConfigs.release')) return cfg // already wired

    // 1. Declare the release signing config beside the template's debug one.
    const debugBlock = /(signingConfigs\s*\{)/
    if (!debugBlock.test(src)) {
      throw new Error('[withUploadSigning] could not find signingConfigs block in app/build.gradle')
    }
    src = src.replace(
      debugBlock,
      `$1
        // Injected by plugins/withUploadSigning.js — values come from
        // credentials.json via gradle.properties, never from a tracked file.
        release {
            storeFile file(project.property('${P_STORE_FILE}'))
            storePassword project.property('${P_STORE_PASSWORD}')
            keyAlias project.property('${P_KEY_ALIAS}')
            keyPassword project.property('${P_KEY_PASSWORD}')
        }`,
    )

    // 2. Point the release build type at it instead of the debug key.
    const releaseUsesDebugKey = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/
    if (!releaseUsesDebugKey.test(src)) {
      throw new Error(
        '[withUploadSigning] release build type does not sign with signingConfigs.debug as expected; ' +
        'the prebuild template changed and this plugin needs updating.',
      )
    }
    src = src.replace(releaseUsesDebugKey, '$1signingConfig signingConfigs.release')

    cfg.modResults.contents = src
    return cfg
  })

  return config
}
