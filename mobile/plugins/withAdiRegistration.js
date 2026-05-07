const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Android Developer Verification (Google Play Console).
// Writes the per-account verification snippet to
// android/app/src/main/assets/adi-registration.properties so the
// produced APK proves ownership of the com.aviramo.once package.
//
// Reference: https://github.com/android/security-samples/tree/main/AndroidDeveloperVerificationAPKSigningExample
const SNIPPET = 'DFT73EDXJYOMKAAAAAAAAAAAAA'

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const assetsDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      )
      fs.mkdirSync(assetsDir, { recursive: true })
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        SNIPPET,
      )
      return cfg
    },
  ])
}
