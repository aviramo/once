// Builds the App Store review environment: 100 test accounts, their pictures,
// 22 circles, memberships, managers, pending join requests and a dense web of
// friendships.
//
// Everything it writes carries is_test = true, so none of it can ever meet a
// real user (public.others() filters on that column, unconditionally).
//
// Re-runnable: it records every account it creates in manifest.json and skips
// what is already there.
//
//   node seed.mjs            # full run
//   node seed.mjs --users    # accounts + photos only
//   node seed.mjs --graph    # circles + memberships + friendships only
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PEOPLE, CIRCLES, OFFICES } from './people.mjs'
import { character, portrait } from './avatars.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const sharp = (await import('file:///' + path.resolve(ROOT, 'web/node_modules/sharp/lib/index.js').replace(/\\/g, '/'))).default
const { createClient } = await import('file:///' + path.resolve(ROOT, 'web/node_modules/@supabase/supabase-js/dist/index.mjs').replace(/\\/g, '/'))

// ── credentials ────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'mobile/.env'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const URL = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error('missing SUPABASE url / service role key in mobile/.env')
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const MANIFEST = path.join(HERE, 'manifest.json')
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { users: {}, circles: {} }
const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))

// ── deterministic randomness ───────────────────────────────────────────────
const rnd = seed => {
  let h = crypto.createHash('sha256').update(String(seed)).digest(), i = 0
  return () => { if (i >= h.length) { h = crypto.createHash('sha256').update(h).digest(); i = 0 } return h[i++] / 256 }
}
const pick = (r, a) => a[Math.floor(r() * a.length)]

// ── where the reviewers are ────────────────────────────────────────────────
// The pool is laid out around Apple's own campuses so a reviewer opening the
// app in Cupertino reads "2 km away" on most cards, with a real spread behind
// it. Two secondary clusters cover Apple's other review sites.
const ANCHORS = {
  applePark:    [37.3346, -122.0090],
  infiniteLoop: [37.3318, -122.0312],
  wolfeRd:      [37.3390, -122.0150],
  vallco:       [37.3255, -122.0080],
  cork:         [51.9163, -8.4919],
  austin:       [30.4210, -97.7130],
}
const KM = 1 / 111.32

/** A ring around one of the anchors: most of the pool sits on Apple's doorstep. */
function locationFor(i, r) {
  let anchor, minKm, maxKm
  if (i < 58) { anchor = pick(r, [ANCHORS.applePark, ANCHORS.infiniteLoop, ANCHORS.wolfeRd, ANCHORS.vallco]); minKm = 0.3; maxKm = 4 }
  else if (i < 82) { anchor = ANCHORS.applePark; minKm = 4; maxKm = 14 }
  else if (i < 94) { anchor = ANCHORS.applePark; minKm = 15; maxKm = 55 }
  else if (i < 98) { anchor = ANCHORS.cork; minKm = 0.5; maxKm = 6 }
  else { anchor = ANCHORS.austin; minKm = 0.5; maxKm = 6 }
  const dist = minKm + r() * (maxKm - minKm)
  const bearing = r() * Math.PI * 2
  const lat = anchor[0] + Math.cos(bearing) * dist * KM
  const lng = anchor[1] + Math.sin(bearing) * dist * KM / Math.cos(anchor[0] * Math.PI / 180)
  return `SRID=4326;POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`
}

const slug = (name, i) => `${name.toLowerCase().replace(/[^a-z]/g, '')}${i}`

/** Every write here lands on a table whose AFTER trigger re-projects the
 *  denormalised communities summary for each row's user, so a big statement
 *  runs past the API's statement timeout. Small batches, always. */
async function upsertChunked(table, rows, onConflict, size = 20) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + size), { onConflict, ignoreDuplicates: true })
    if (error) throw new Error(`${table}: ${error.message}`)
    process.stdout.write('+')
  }
  console.log(` ${rows.length} ${table}`)
}

// ── 1. accounts + pictures ─────────────────────────────────────────────────
async function seedUsers() {
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i]
    const id = slug(p.name, i)
    if (manifest.users[id]?.done) { process.stdout.write('.'); continue }
    const r = rnd('once-review-' + id)

    // auth identity (never signed into; the row exists so users.user_id has a
    // parent -- users_user_id_fkey references auth.users)
    let uid = manifest.users[id]?.uid
    if (!uid) {
      const { data, error } = await db.auth.admin.createUser({
        email: `${id}@review.once.local`, email_confirm: true,
        user_metadata: { seeded: 'app-store-review' },
      })
      if (error) throw new Error(`createUser ${id}: ${error.message}`)
      uid = data.user.id
      manifest.users[id] = { uid }
      save()
    }

    // 2..6 pictures of the SAME drawn person
    const c = character('once-review-' + id, p.male)
    const shots = 2 + Math.floor(r() * 5)
    const images = []
    for (let v = 0; v < shots; v++) {
      const file = `${crypto.randomUUID()}.webp`
      const buf = await sharp(Buffer.from(portrait(c, v, 'once-review-' + id)))
        .resize(900, 1125).webp({ quality: 92 }).toBuffer()
      const { error } = await db.storage.from('users').upload(`${uid}/normal/${file}`, buf, {
        contentType: 'image/webp', upsert: true,
      })
      if (error) throw new Error(`upload ${id}: ${error.message}`)
      images.push({ normal: file })
    }

    const birth = new Date(Date.UTC(new Date().getUTCFullYear() - p.age, Math.floor(r() * 12), 1 + Math.floor(r() * 27)))
    const row = {
      user_id: uid,
      name: p.name,
      is_male: p.male,
      // Open to everyone, no age window, no distance limit (user directive).
      is_for_male: true,
      is_for_female: true,
      birth_date: birth.toISOString().slice(0, 10),
      age_from: 18,
      age_to: 99,
      range: null,
      location: locationFor(i, r),
      last_seen: new Date(Date.now() - Math.floor(r() * 90) * 60000).toISOString(),
      is_test: true,
      data: {
        os: r() < 0.62 ? 'ios' : 'android',
        lang: 'en',
        units: 'imperial',
        bio: p.bio,
        height: p.height,
        smokes: p.smokes,
        family: {
          hasKids: p.kids.length > 0,
          ...(p.kids.length ? { kids: p.kids.map(age => ({ age })) } : {}),
          isForKids: p.wants,
        },
        images,
      },
      relations: {
        page1: { state: 'free' },
        page2: { state: 'free', profiles: [] },
        credits: { balance: 1, extra: 0, held: 0 },
      },
    }
    const { error } = await db.from('users').upsert(row, { onConflict: 'user_id' })
    if (error) throw new Error(`insert user ${id}: ${error.message}`)
    manifest.users[id] = { uid, name: p.name, done: true, shots }
    save()
    process.stdout.write('#')
  }
  console.log(`\n${Object.keys(manifest.users).length} accounts ready`)
}

// ── 2. circles, memberships, managers, requests, friendships ───────────────
async function seedGraph() {
  const ids = PEOPLE.map((p, i) => manifest.users[slug(p.name, i)]?.uid)
  if (ids.some(x => !x)) throw new Error('run --users first')
  const at = key => CIRCLES.findIndex(c => c.key === key)

  // circles -------------------------------------------------------------
  for (let ci = 0; ci < CIRCLES.length; ci++) {
    const c = CIRCLES[ci]
    if (manifest.circles[c.key]) continue
    // the owner is the first person who listed this circle
    const ownerIdx = PEOPLE.findIndex(p => p.circles.includes(c.key))
    const row = {
      name: c.name,
      description: c.desc,
      link: c.link,
      owner_id: ids[ownerIdx],
      is_public: c.kind !== 'private',
      requires_approval: c.kind === 'approval',
      is_test: true,
      invite_code: crypto.randomBytes(5).toString('hex').toUpperCase(),
    }
    const { data, error } = await db.from('groups').insert(row).select('id').single()
    if (error) throw new Error(`group ${c.key}: ${error.message}`)
    manifest.circles[c.key] = data.id
    save()
    process.stdout.write('o')
  }
  console.log(`\n${Object.keys(manifest.circles).length} circles ready`)

  // memberships ---------------------------------------------------------
  const members = []
  PEOPLE.forEach((p, i) => p.circles.forEach(k => members.push({ user_id: ids[i], group_id: manifest.circles[k] })))
  // every owner is a member of their own circle
  for (const c of CIRCLES) {
    const ownerIdx = PEOPLE.findIndex(p => p.circles.includes(c.key))
    members.push({ user_id: ids[ownerIdx], group_id: manifest.circles[c.key] })
  }
  {
    const seen = new Set()
    const rows = members.filter(m => { const k = m.user_id + m.group_id; if (seen.has(k)) return false; seen.add(k); return true })
    await upsertChunked('user_groups', rows, 'user_id,group_id')
  }

  // managers: two per circle that needs approving, besides the owner ------
  const managers = []
  for (const c of CIRCLES) {
    if (c.kind !== 'approval') continue
    const gid = manifest.circles[c.key]
    const inCircle = PEOPLE.map((p, i) => p.circles.includes(c.key) ? i : -1).filter(i => i >= 0)
    const ownerIdx = inCircle[0]
    for (const idx of inCircle.slice(1, 3)) managers.push({ user_id: ids[idx], group_id: gid })
    void ownerIdx
  }
  if (managers.length) await upsertChunked('group_managers', managers, 'user_id,group_id')

  // pending join requests, so a manager opens a real queue ---------------
  const reqs = []
  const r = rnd('joins')
  for (const c of CIRCLES) {
    if (c.kind !== 'approval') continue
    const gid = manifest.circles[c.key]
    const outsiders = PEOPLE.map((p, i) => p.circles.includes(c.key) ? -1 : i).filter(i => i >= 0)
    for (let n = 0; n < 2 + Math.floor(r() * 3); n++) {
      const idx = outsiders[Math.floor(r() * outsiders.length)]
      reqs.push({ user_id: ids[idx], group_id: gid, status: 'pending' })
    }
  }
  {
    const seen = new Set()
    const rows = reqs.filter(m => { const k = m.user_id + m.group_id; if (seen.has(k)) return false; seen.add(k); return true })
    await upsertChunked('group_join_requests', rows, 'group_id,user_id')
  }

  // friendships ---------------------------------------------------------
  // Dense on purpose: a candidate the reviewer is shown should nearly always
  // have a circle or a mutual friend in common with somebody he already knows.
  const fr = rnd('friends')
  const pairs = new Set()
  const add = (a, b) => { if (a === b) return; const k = a < b ? `${a}|${b}` : `${b}|${a}`; pairs.add(k) }
  // people who share a circle are likely friends
  for (const c of CIRCLES) {
    const inCircle = PEOPLE.map((p, i) => p.circles.includes(c.key) ? i : -1).filter(i => i >= 0)
    for (const a of inCircle) for (const b of inCircle) if (a < b && fr() < 0.45) add(a, b)
  }
  // plus long links across the graph, so friend-of-friend reaches everywhere
  for (let n = 0; n < 220; n++) add(Math.floor(fr() * PEOPLE.length), Math.floor(fr() * PEOPLE.length))
  // friend_links_canonical: the table stores each pair once, with a < b.
  const links = [...pairs].map(k => {
    const [x, y] = k.split('|').map(Number).map(i => ids[i])
    return x < y ? { a: x, b: y, via: 'seed' } : { a: y, b: x, via: 'seed' }
  })
  await upsertChunked('friend_links', links, 'a,b', 10)

  // a few friend requests left waiting
  const wants = []
  for (let n = 0; n < 14; n++) {
    const a = Math.floor(fr() * PEOPLE.length), b = Math.floor(fr() * PEOPLE.length)
    if (a === b) continue
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (pairs.has(k)) continue
    wants.push({ requester_id: ids[a], target_id: ids[b], status: 'pending' })
  }
  if (wants.length) {
    const { error } = await db.from('friend_requests').insert(wants)
    if (error) console.log(`friend requests skipped: ${error.message}`)
    else console.log(`${wants.length} pending friend requests`)
  }
  void at
}

const only = process.argv.slice(2)
if (!only.length || only.includes('--users')) await seedUsers()
if (!only.length || only.includes('--graph')) await seedGraph()
console.log('done')
