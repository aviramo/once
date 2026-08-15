// The project has ONE env file: `.env` at the repo root. The Expo app, the
// Next site and every node script read that file and no other — there is no
// mobile/.env and no web/.env.local.
//
// Node's own loader is used rather than dotenv so nothing has to be installed,
// and because it leaves a variable that is ALREADY in the environment alone:
// EAS, Vercel and CI inject the real values, so this file is a local-dev
// fallback and can never override a deployed one.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ENV_FILE = path.join(ROOT, '.env')

export function loadRootEnv() {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
  return process.env
}
