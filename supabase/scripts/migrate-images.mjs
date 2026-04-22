/**
 * Image migration script
 *
 * 1. Computes blurhash for every image in the DB (where hash is empty)
 * 2. Updates data.images in the DB with the computed hashes
 * 3. Deletes all storage objects that are not a valid normal image
 *
 * Run from the supabase/ directory:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/migrate-images.mjs
 */

import { createRequire } from 'module'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const { encode: encodeBlurhash } = require('../../mobile/node_modules/blurhash')
const { createClient } = require('../../mobile/node_modules/@supabase/supabase-js')

const SUPABASE_URL = 'https://sjsblyumdlwckrshwxei.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ─── helpers ────────────────────────────────────────────────────────────────

async function computeBlurhash(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { data, info } = await sharp(buf)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
}

async function listFolder(prefix) {
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from('users').list(prefix, { limit: 1000, offset })
    if (error) throw error
    if (!data?.length) break
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) all.push(path)      // file
      else all.push(...await listFolder(path)) // subfolder
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function deleteFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error } = await supabase.storage.from('users').remove(batch)
    if (error) console.error('  delete error:', error.message)
    else console.log(`  deleted ${batch.length} files`)
  }
}

// ─── step 1: load users ──────────────────────────────────────────────────────

console.log('Loading users from DB...')
const { data: users, error: usersError } = await supabase.from('users').select('user_id, data')
if (usersError) { console.error(usersError); process.exit(1) }

const validPaths = new Set()
const usersWithImages = users.filter(u => Array.isArray(u.data?.images) && u.data.images.length > 0)

for (const user of usersWithImages)
  for (const img of user.data.images)
    if (img.normal) validPaths.add(`${user.user_id}/normal/${img.normal}`)

console.log(`${usersWithImages.length} users with images, ${validPaths.size} valid files\n`)

// ─── step 2: compute and update hashes ──────────────────────────────────────

console.log('Computing blurhashes...')
for (const user of usersWithImages) {
  const images = user.data.images
  let changed = false

  for (const img of images) {
    if (!img.normal || img.hash) continue
    const url = `${SUPABASE_URL}/storage/v1/object/public/users/${user.user_id}/normal/${img.normal}`
    try {
      img.hash = await computeBlurhash(url)
      changed = true
      process.stdout.write('.')
    } catch (e) {
      console.error(`\n  ✗ ${user.user_id}/${img.normal}: ${e.message}`)
    }
  }

  if (changed) {
    const { error } = await supabase
      .from('users')
      .update({ data: { ...user.data, images } })
      .eq('user_id', user.user_id)
    if (error) console.error(`\n  DB update failed ${user.user_id}: ${error.message}`)
  }
}
console.log('\n')

// ─── step 3: clean up storage ───────────────────────────────────────────────

console.log('Scanning storage...')
const allFiles = await listFolder('')
const toDelete = allFiles.filter(f => !validPaths.has(f))
console.log(`Total files in storage: ${allFiles.length}`)
console.log(`Files to delete: ${toDelete.length}`)
if (toDelete.length > 0) {
  console.log(toDelete.slice(0, 20).map(f => `  - ${f}`).join('\n'))
  if (toDelete.length > 20) console.log(`  ... and ${toDelete.length - 20} more`)
  await deleteFiles(toDelete)
}

console.log('\nDone!')
