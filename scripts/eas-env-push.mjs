// Pushes the root .env up to an EAS environment:
//
//   node scripts/eas-env-push.mjs production      # or preview / development
//
// `eas env:push` reads a .env file sitting in the app folder, so the root file
// is written out to mobile/.env.local for the length of the command and then
// removed. Only the EXPO_PUBLIC_ variables go up: those are the ones a
// production build inlines, and the rest of the root file (the service role
// key, fal.ai) belongs to local scripts and has no business in a build
// environment.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, ENV_FILE } from './env.mjs'

const environment = process.argv[2] ?? 'production'
const TEMP = path.join(ROOT, 'mobile/.env.local')

const lines = fs.readFileSync(ENV_FILE, 'utf8')
  .split(/\r?\n/)
  .filter(l => l.startsWith('EXPO_PUBLIC_'))
if (!lines.length) throw new Error(`no EXPO_PUBLIC_ variables in ${ENV_FILE}`)

fs.writeFileSync(TEMP, lines.join('\n') + '\n')
try {
  const r = spawnSync('eas', ['env:push', environment], {
    cwd: path.join(ROOT, 'mobile'), stdio: 'inherit', shell: true,
  })
  process.exitCode = r.status ?? 1
} finally {
  fs.rmSync(TEMP, { force: true })
}
