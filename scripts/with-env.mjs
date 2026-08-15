// Runs a command with the root .env in its environment:
//
//   node scripts/with-env.mjs expo start
//
// Expo's own loader (@expo/env) only ever looks inside the app folder and
// never overwrites a variable that is already set, so putting the root file
// into the environment BEFORE the CLI starts is what makes mobile/.env
// unnecessary. Same for anything else that expects a .env beside it.
import { spawn } from 'node:child_process'
import { loadRootEnv } from './env.mjs'

loadRootEnv()

const argv = process.argv.slice(2)
if (!argv.length) {
  console.error('usage: node scripts/with-env.mjs <command> [args...]')
  process.exit(2)
}

// A shell is needed at all because the targets are npm-installed binaries
// (expo, eas, npm), which are .cmd shims on Windows and unspawnable without
// one. It is handed ONE command string rather than a string plus an args
// array: node concatenates those unescaped (DEP0190), so an argument with a
// space in it would come apart.
const quote = a => (/[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
const child = spawn(argv.map(quote).join(' '), { stdio: 'inherit', shell: true })
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0))
