// Pictures for the fixed App Review login account. Its uid is stable (the
// review-login edge function always mints the same auth user), so the files go
// straight into that account's folder and app_review_seed names them.
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { character, portrait } from './avatars.mjs'
import { loadRootEnv } from '../env.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const sharp = (await import('file:///' + path.resolve(ROOT, 'web/node_modules/sharp/lib/index.js').replace(/\\/g, '/'))).default
const { createClient } = await import('file:///' + path.resolve(ROOT, 'web/node_modules/@supabase/supabase-js/dist/index.mjs').replace(/\\/g, '/'))

const env = loadRootEnv()
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UID = process.argv[2]
if (!UID) throw new Error('usage: node review-account.mjs <review-user-uuid>')

const c = character('once-review-demo-account', false)
const files = []
for (let v = 0; v < 3; v++) {
  const file = `${crypto.randomUUID()}.webp`
  const buf = await sharp(Buffer.from(portrait(c, v, 'once-review-demo-account')))
    .resize(900, 1125).webp({ quality: 92 }).toBuffer()
  const { error } = await db.storage.from('users').upload(`${UID}/normal/${file}`, buf, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  files.push(file)
}
console.log(JSON.stringify(files))
