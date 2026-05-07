import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import crypto from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sjsblyumdlwckrshwxei.supabase.co'
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const FAL_KEY = process.env.FAL_KEY

if (!SERVICE_ROLE) {
  console.error('ERROR: set SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role)')
  process.exit(1)
}
if (!FAL_KEY) {
  console.error('ERROR: set FAL_KEY (https://fal.ai/dashboard/keys)')
  process.exit(1)
}

fal.config({ credentials: FAL_KEY })
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TOTAL = 50
const MEN_COUNT = 25
const WOMEN_COUNT = TOTAL - MEN_COUNT
const AGE_MIN = 25
const AGE_MAX = 55
const MIN_PHOTOS = 2
const MAX_PHOTOS = 6
const SEED_EMAIL_DOMAIN = 'test.once.local'

const MALE_NAMES = ['אבי', 'יוסי', 'רן', 'עומר', 'ניר', 'איתי', 'גיא', 'רועי', 'שחר', 'יובל', 'אסף', 'טל', 'אלון', 'עידן', 'אריאל', 'תומר', 'עמית', 'דני', 'יואב', 'בן', 'גל', 'עופר', 'אמיר', 'נועם', 'שי']
const FEMALE_NAMES = ['נועה', 'שירה', 'מיכל', 'יעל', 'עדי', 'תמר', 'הדר', 'רוני', 'מעיין', 'ליאור', 'דנה', 'הילה', 'מורן', 'ענבל', 'שני', 'קרן', 'אביגיל', 'שלומית', 'רותם', 'ליאת', 'מיה', 'אור', 'נטע', 'טליה', 'איילת']

const OCCUPATIONS_M = ['מהנדס תוכנה', 'רופא', 'מורה', 'אדריכל', 'עורך דין', 'שף', 'מוזיקאי', 'טייס', 'מאמן כושר', 'צלם', 'יזם', 'רואה חשבון', 'מעצב גרפי', 'עיתונאי']
const OCCUPATIONS_F = ['מעצבת פנים', 'רופאת שיניים', 'מורה ליוגה', 'אדריכלית', 'פסיכולוגית', 'שפית', 'עיתונאית', 'רופאה', 'אמנית', 'עורכת דין', 'מהנדסת', 'מורה', 'מטפלת', 'יועצת']

const INTERESTS = ['טיולים בטבע', 'אופניים', 'בישול', 'קריאה', 'ריצה', 'יוגה', 'צילום', 'הופעות', 'שחייה', 'מסעדות', 'אוכל טוב', 'סרטים', 'תיאטרון', 'יין', 'קפה', 'ים', 'אמנות', 'מוזיקה', 'טיולי סופ״ש']

const APPEARANCE_M = [
  'short dark hair, clean shaven',
  'short black hair, light stubble',
  'curly brown hair, neat beard',
  'shaved head, short beard',
  'dark wavy hair, clean shaven',
  'salt-and-pepper hair, light beard',
  'buzz cut, clean shaven',
  'medium length dark hair, stubble',
]
const APPEARANCE_F = [
  'long dark wavy hair, natural makeup',
  'shoulder-length brown hair, warm smile',
  'long straight black hair, natural look',
  'curly brown hair, minimal makeup',
  'medium dark hair pulled back, freckles',
  'long wavy hair, sun-kissed skin',
  'short pixie cut, natural features',
  'long black hair, natural beauty',
]

const STYLES = ['casual smart style', 'relaxed weekend style', 'elegant minimal style', 'sporty athletic style', 'bohemian style', 'urban casual style']

// Each shot template forces a specific framing. PuLID tends to default to close-up portraits,
// so we explicitly push wide/full-body/contextual shots.
const FULL_BODY_CONTEXTS = [
  'standing on a Tel Aviv beach in swimwear, ocean behind, barefoot on sand',
  'hiking up a rocky desert trail wearing boots and a backpack, full landscape behind',
  'sitting on a park bench with legs crossed, feeding pigeons, wide city park behind',
  'walking a dog on a leash down a suburban sidewalk, morning sunlight',
  'riding a bicycle on a coastal path, motion captured mid-pedal',
  'standing in an apartment living room in jeans and t-shirt, couch and TV visible',
  'sitting cross-legged on a yoga mat in a bright studio, other mats visible',
  'leaning against a parked car on a street, full outfit visible',
  'standing on a hotel balcony in casual shorts and t-shirt, sea view behind',
  'shopping at an outdoor market carrying a canvas bag of vegetables',
  'sitting on the floor of a living room playing with a dog, couch visible',
  'walking through an airport terminal pulling a rolling suitcase',
]

const WITH_PEOPLE_CONTEXTS = [
  'at a family dinner table with 3 other people around, plates of food, candid laughter',
  'at a crowded outdoor bar, a friend (back to camera) clinking glass, others chatting behind',
  'at a music festival crowd, two friends next to them singing along, stage lights',
  'in a living room playing cards with friends, beer bottles and snacks on table',
  'hiking on a trail with another hiker (face away) walking ahead, green landscape',
  'sitting at a cafe table across from a friend (only shoulder visible), two coffee cups',
  'on a beach with friends building a sandcastle in the background, children running nearby',
  'at a rooftop birthday party with balloons, 4 people around, casual hugging',
  'sitting on grass at a picnic with a partner and a kid playing in the background',
  'at a wedding reception with guests dancing behind, dressed in semi-formal',
  'at a crowded food market, vendors and customers around, bustling scene',
  'watching a soccer game in a sports bar, TV screens and other fans cheering behind',
]

const CANDID_CONTEXTS = [
  'lying on a couch at home scrolling phone, cozy warm lamp light, relaxed weekend outfit',
  'sitting cross-legged on a bed with a laptop, messy blanket, bedroom context',
  'cooking pasta in a home kitchen, stirring a pot, steam rising, fridge and cabinets visible',
  'sitting at a kitchen table with morning coffee, newspaper and jam jar on the table',
  'lying on a picnic blanket in a park on grass, sun spots through trees, open book beside',
  'sitting in a rideshare back seat, phone in hand, city reflected in the window',
  'in a car driver seat, seatbelt on, dashboard and urban road visible',
  'sitting on a bathroom floor tying running shoes before a workout, gym bag beside',
  'taking a candid mirror selfie in a gym changing room, workout outfit visible',
  'sitting on a stadium seat at a concert, stage lights in the background',
  'at a bookshop browsing a shelf, holding an open book, rows of books behind',
  'helping a small child (back to camera) build legos on a living room floor, toys scattered',
  'in snow wearing a thick winter coat and beanie, breath visible, forest background',
  'at a farmers market stand picking out tomatoes, produce and vendor visible behind',
  'riding a shared scooter on a Tel Aviv street, traffic and palm trees blurred',
]

const CITIES = [
  { name: 'Tel Aviv',      lat: 32.0853, lng: 34.7818 },
  { name: 'Jerusalem',     lat: 31.7683, lng: 35.2137 },
  { name: 'Haifa',         lat: 32.7940, lng: 34.9896 },
  { name: 'Beer Sheva',    lat: 31.2518, lng: 34.7915 },
  { name: 'Netanya',       lat: 32.3215, lng: 34.8532 },
  { name: 'Rishon LeZion', lat: 31.9730, lng: 34.8066 },
  { name: 'Petah Tikva',   lat: 32.0878, lng: 34.8878 },
  { name: 'Ramat Gan',     lat: 32.0823, lng: 34.8143 },
  { name: 'Herzliya',      lat: 32.1663, lng: 34.8434 },
  { name: 'Kfar Saba',     lat: 32.1789, lng: 34.9067 },
  { name: 'Raanana',       lat: 32.1836, lng: 34.8712 },
  { name: 'Rehovot',       lat: 31.8947, lng: 34.8094 },
]

const CITY_WEIGHTS = [8, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1]

function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)) }
function sample(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function sampleN(arr, n) { return shuffle([...arr]).slice(0, n) }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
function weightedCity() {
  const total = CITY_WEIGHTS.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < CITIES.length; i++) { r -= CITY_WEIGHTS[i]; if (r <= 0) return CITIES[i] }
  return CITIES[0]
}
function jitter(v, amt = 0.05) { return v + (Math.random() - 0.5) * amt }

// Randomized FamilyData for test users. Distribution chosen to give the UI
// a useful spread for testing:
//   - 25% no family info (data.family undefined → no card)
//   - 25% no kids, isForKids=true   ("wants kids")
//   - 15% no kids, isForKids=false  ("doesn't want kids")
//   - 10% no kids, isForKids=null   (no preference set)
//   - 25% has kids, with schedule + isForKids randomly true/false/null
function randomFamily() {
  const r = Math.random()
  if (r < 0.25) return undefined
  if (r < 0.50) return { hasKids: false, isForKids: true }
  if (r < 0.65) return { hasKids: false, isForKids: false }
  if (r < 0.75) return { hasKids: false }

  // Has kids: 1-3 kids, weekly schedule of 1-4 weeks with each day
  // independently 50% chance of being marked. anchor = current Sunday.
  const kidCount = randInt(1, 3)
  const kids = Array.from({ length: kidCount }, () => {
    return Math.random() < 0.85 ? { age: randInt(0, 18) } : {}
  })
  const weeksCount = randInt(1, 4)
  const weeks = Array.from({ length: weeksCount }, () =>
    Array.from({ length: 7 }, () => Math.random() < 0.5),
  )
  const today = new Date()
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
  const anchor = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
  const isForKidsRoll = Math.random()
  const isForKids = isForKidsRoll < 0.4 ? true : isForKidsRoll < 0.8 ? false : null
  return {
    hasKids: true,
    kids,
    schedule: { weeks, anchor },
    ...(isForKids !== null ? { isForKids } : {}),
  }
}

async function clearStorageFor(userId) {
  for (const folder of ['normal', 'blur']) {
    const { data: files } = await supabase.storage.from('users').list(`${userId}/${folder}`, { limit: 200 })
    if (!files?.length) continue
    const paths = files.map(f => `${userId}/${folder}/${f.name}`)
    await supabase.storage.from('users').remove(paths)
  }
}

async function cleanupNonAdmin() {
  const { data: toDelete, error } = await supabase
    .from('users')
    .select('user_id, data')
    .or("data->>role.neq.ADMIN,data->>role.is.null")
  if (error) throw new Error(`select non-admin users: ${error.message}`)
  console.log(`cleanup: ${toDelete.length} non-admin users to delete`)

  let done = 0
  for (const { user_id } of toDelete) {
    await clearStorageFor(user_id).catch(e => console.warn(`  storage clear ${user_id}: ${e.message}`))
    await supabase.from('users').delete().eq('user_id', user_id)
    await supabase.auth.admin.deleteUser(user_id).catch(() => {})
    done++
    if (done % 10 === 0) console.log(`  cleanup progress: ${done}/${toDelete.length}`)
  }

  let page = 1
  let orphanDeleted = 0
  while (true) {
    const { data, error: e } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (e) break
    const users = data?.users ?? []
    if (!users.length) break
    for (const u of users) {
      if (u.email?.endsWith(`@${SEED_EMAIL_DOMAIN}`) || u.email?.endsWith('@seed.syncwish.local')) {
        await supabase.auth.admin.deleteUser(u.id).catch(() => {})
        orphanDeleted++
      }
    }
    if (users.length < 1000) break
    page++
  }
  if (orphanDeleted) console.log(`  orphaned auth users deleted: ${orphanDeleted}`)
}

function buildPersona(idx, isMale, name) {
  const age = randInt(AGE_MIN, AGE_MAX)
  const occupation = isMale ? sample(OCCUPATIONS_M) : sample(OCCUPATIONS_F)
  const interests = sampleN(INTERESTS, 3)
  const appearance = isMale ? sample(APPEARANCE_M) : sample(APPEARANCE_F)
  const style = sample(STYLES)
  const city = weightedCity()
  const verb = isMale ? 'אוהב' : 'אוהבת'
  const bioHe = `${occupation}. ${verb} ${interests[0]} ו${interests[1]}${interests[2] ? `, ${interests[2]}` : ''}.`
  return { idx, name, age, isMale, occupation, interests, appearance, style, city, bioHe }
}

const REALISM_SUFFIX = 'iPhone photo, casual unposed snapshot, amateur phone camera, slight grain, authentic skin texture, everything in focus no shallow depth of field, not a portrait not a headshot, real everyday life, instagram story quality, ugly-cute real-world snapshot'

function baselinePrompt(p) {
  const gender = p.isMale ? 'man' : 'woman'
  return `Casual front-facing phone selfie of a ${p.age}-year-old Israeli ${gender}, ${p.appearance}, ${p.style}, natural soft light, slight smile, looking straight at camera, face centered. iPhone photo, casual snapshot, skin imperfections, real person not a model`
}

function fullBodyPrompt(p, ctx) {
  const gender = p.isMale ? 'man' : 'woman'
  return `FULL BODY SHOT, wide framing, entire person from head to feet visible in the frame, shot from 3-4 meters away: an Israeli ${gender} aged ${p.age}, ${p.appearance}, wearing casual everyday clothes, ${ctx}. Person takes only about 60% of frame height. ${REALISM_SUFFIX}`
}

function withPeoplePrompt(p, ctx) {
  const gender = p.isMale ? 'man' : 'woman'
  return `Candid group snapshot, medium wide shot, multiple people visible in the scene: the main subject is an Israeli ${gender} aged ${p.age}, ${p.appearance}, ${ctx}. Other people in the frame (friends / family / strangers / children). Not posed. ${REALISM_SUFFIX}`
}

function candidPrompt(p, ctx) {
  const gender = p.isMale ? 'man' : 'woman'
  const framing = Math.random() < 0.5 ? 'medium shot from waist up' : 'wide shot, subject small in the frame, lots of environment visible'
  return `Candid everyday moment, ${framing}: an Israeli ${gender} aged ${p.age}, ${p.appearance}, ${ctx}. ${REALISM_SUFFIX}`
}

async function generateBaseline(p) {
  const res = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt: baselinePrompt(p),
      image_size: 'portrait_4_3',
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
    },
    logs: false,
  })
  const url = res?.data?.images?.[0]?.url
  if (!url) throw new Error('baseline: no image url returned')
  return url
}

async function generateWithRef(p, refUrl, promptText, imageSize = 'portrait_4_3', idWeight = 1) {
  const res = await fal.subscribe('fal-ai/flux-pulid', {
    input: {
      prompt: promptText,
      reference_image_url: refUrl,
      image_size: imageSize,
      num_inference_steps: 22,
      guidance_scale: 4,
      id_weight: idWeight,
    },
    logs: false,
  })
  const url = res?.data?.images?.[0]?.url
  if (!url) throw new Error('ref: no image url returned')
  return url
}

function buildShotPlan(p, numPhotos) {
  const plan = []
  plan.push({ kind: 'full_body', prompt: fullBodyPrompt(p, sample(FULL_BODY_CONTEXTS)), image_size: 'portrait_4_3', id_weight: 0.75 })
  if (numPhotos - 1 >= 1) {
    plan.push({ kind: 'with_people', prompt: withPeoplePrompt(p, sample(WITH_PEOPLE_CONTEXTS)), image_size: 'landscape_4_3', id_weight: 0.85 })
  }
  const remaining = Math.max(0, numPhotos - 1 - plan.length)
  const candidCtxs = sampleN(CANDID_CONTEXTS, remaining)
  for (const ctx of candidCtxs) {
    const wide = Math.random() < 0.4
    plan.push({
      kind: 'candid',
      prompt: candidPrompt(p, ctx),
      image_size: wide ? 'landscape_4_3' : 'portrait_4_3',
      id_weight: wide ? 0.85 : 1,
    })
  }
  return plan
}

async function compressUnder200K(buf) {
  const MAX = 200 * 1024
  const widths = [1080, 900, 720, 540]
  const qualities = [78, 68, 58, 48]
  for (const w of widths) {
    for (const q of qualities) {
      const out = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toBuffer()
      if (out.length <= MAX) return out
    }
  }
  return await sharp(buf).rotate().resize({ width: 480 }).webp({ quality: 40 }).toBuffer()
}

async function processAndUpload(userId, imageUrl, idx) {
  const resp = await fetch(imageUrl)
  if (!resp.ok) throw new Error(`fetch image ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  const filename = `${crypto.randomUUID()}.webp`
  const [normal, blur] = await Promise.all([
    compressUnder200K(buf),
    sharp(buf).rotate().resize({ width: 32 }).webp({ quality: 50 }).toBuffer(),
  ])
  const up1 = await supabase.storage.from('users').upload(`${userId}/normal/${filename}`, normal, { contentType: 'image/webp', upsert: true })
  if (up1.error) throw new Error(`upload normal: ${up1.error.message}`)
  const up2 = await supabase.storage.from('users').upload(`${userId}/blur/${filename}`, blur, { contentType: 'image/webp', upsert: true })
  if (up2.error) throw new Error(`upload blur: ${up2.error.message}`)
  return filename
}

async function createAuthUser(idx) {
  const email = `test_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}@${SEED_EMAIL_DOMAIN}`
  const password = crypto.randomBytes(16).toString('hex')
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { seed: true, role: 'TEST' },
  })
  if (error) throw new Error(`auth.admin.createUser: ${error.message}`)
  return data.user
}

function birthDateFor(age) {
  const now = new Date()
  const year = now.getFullYear() - age
  const month = randInt(0, 11)
  const day = 1 + randInt(0, 27)
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

function randomPastIso(maxDaysAgo) {
  const ms = Math.random() * maxDaysAgo * 24 * 60 * 60 * 1000
  return new Date(Date.now() - ms).toISOString()
}

async function insertProfile(user, p, filenames) {
  const createdAt = randomPastIso(30)
  const lastSeen = randomPastIso(7)
  const family = randomFamily()
  const data = {
    images: filenames.map(f => ({ normal: f, hash: '' })),
    bio: p.bioHe,
    units: 'metric',
    role: 'TEST',
    ...(family !== undefined ? { family } : {}),
  }
  // Match the server-side default for fresh users (user.ts: defaultRelations).
  // page1.locked + page2.free passes the `others` findability filter
  // (page1 != chat, page2 NOT IN locked/pending), so seeded users are
  // discoverable by `find` immediately.
  const relations = { page1: { state: 'locked' }, page2: { state: 'free' } }
  const { error } = await supabase.from('users').insert({
    user_id: user.id,
    name: p.name,
    birth_date: birthDateFor(p.age),
    is_male: p.isMale,
    is_for_male: true,
    is_for_female: true,
    age_from: 18,
    age_to: 99,
    range: 100_000_000,
    location: `SRID=4326;POINT(${jitter(p.city.lng)} ${jitter(p.city.lat)})`,
    data,
    relations,
    created_at: createdAt,
    last_seen: lastSeen,
  })
  if (error) throw new Error(`users insert: ${error.message}`)
}

async function main() {
  console.log(`\n=== Once TEST user seeder ===`)
  console.log(`target: ${SUPABASE_URL}`)
  console.log(`plan: ${TOTAL} users (${MEN_COUNT}M / ${WOMEN_COUNT}F), ${MIN_PHOTOS}-${MAX_PHOTOS} photos each\n`)

  console.log('⚠️  Cleaning non-ADMIN users (DB + storage + auth)...')
  await cleanupNonAdmin()
  console.log('cleanup done.\n')

  const maleNames = shuffle([...MALE_NAMES])
  const femaleNames = shuffle([...FEMALE_NAMES])
  const plan = []
  for (let i = 0; i < MEN_COUNT; i++) plan.push(buildPersona(i, true, maleNames[i % maleNames.length]))
  for (let i = 0; i < WOMEN_COUNT; i++) plan.push(buildPersona(i + MEN_COUNT, false, femaleNames[i % femaleNames.length]))
  shuffle(plan)

  let ok = 0, fail = 0
  for (const [idx, p] of plan.entries()) {
    const numPhotos = randInt(MIN_PHOTOS, MAX_PHOTOS)
    const label = `[${idx + 1}/${plan.length}] ${p.name} (${p.isMale ? 'M' : 'F'}, ${p.age}, ${p.city.name})`
    console.log(`${label} — generating ${numPhotos} photo(s)...`)
    let user = null
    try {
      user = await createAuthUser(idx)
      const baselineUrl = await generateBaseline(p)
      const filenames = []
      filenames.push(await processAndUpload(user.id, baselineUrl, 0))

      if (numPhotos > 1) {
        const shotPlan = buildShotPlan(p, numPhotos)
        for (let i = 0; i < shotPlan.length; i++) {
          const shot = shotPlan[i]
          try {
            const u = await generateWithRef(p, baselineUrl, shot.prompt, shot.image_size, shot.id_weight)
            filenames.push(await processAndUpload(user.id, u, i + 1))
          } catch (e) {
            const detail = e?.body ? JSON.stringify(e.body).slice(0, 300) : ''
            console.warn(`  ⚠ photo ${i + 2} (${shot.kind}) failed: ${e.message}${detail ? ' — ' + detail : ''} (continuing)`)
          }
        }
      }

      if (filenames.length === 0) throw new Error('no photos produced')

      await insertProfile(user, p, filenames)
      ok++
      console.log(`  ✓ ok — ${filenames.length} photo(s) uploaded`)
    } catch (err) {
      fail++
      console.error(`  ✗ ${err.message || err}`)
      if (user) {
        await clearStorageFor(user.id).catch(() => {})
        await supabase.from('users').delete().eq('user_id', user.id).catch(() => {})
        await supabase.auth.admin.deleteUser(user.id).catch(() => {})
      }
    }
  }

  console.log(`\ndone. created=${ok} failed=${fail}`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
