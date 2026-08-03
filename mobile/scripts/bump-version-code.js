#!/usr/bin/env node
// Bump expo.android.versionCode in app.json by one.
//
// Play treats versionCode as ONE monotonically increasing sequence per app, so
// a local build and an EAS cloud build must never invent numbers independently
// — whichever uploads first raises the floor and the other's number becomes
// unusable. eas.json therefore sets appVersionSource: "local", which makes this
// field in app.json the single source of truth: `eas build` (autoIncrement)
// bumps it, and `npm run aab:local` bumps it through this script.
//
// Rewrites only the one line, so the file's hand-tuned formatting survives.
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'app.json')
const src = fs.readFileSync(file, 'utf8')

const RE = /("versionCode"\s*:\s*)(\d+)/
const m = src.match(RE)
if (!m) {
  console.error(
    'bump-version-code: no "versionCode" in app.json.\n' +
    'Add `"versionCode": <n>` under expo.android first — with ' +
    'appVersionSource "local" it is the single source of truth for the Play ' +
    'version sequence.',
  )
  process.exit(1)
}

const next = Number(m[2]) + 1
fs.writeFileSync(file, src.replace(RE, `$1${next}`))
console.log(`versionCode ${m[2]} -> ${next}`)
