import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sjsblyumdlwckrshwxei.supabase.co'
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE) {
  console.error('ERROR: set SUPABASE_SERVICE_ROLE_KEY env var (Supabase Dashboard → Settings → API → service_role)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const MALE_NAMES = ['אבי','יוסי','רן','עומר','ניר','איתי','גיא','רועי','שחר','יובל','אסף','טל','אלון','עידן','אריאל','תומר','עמית','דני','יואב','בן','גל','עופר','אמיר','נועם','שי']
const FEMALE_NAMES = ['נועה','שירה','מיכל','יעל','עדי','תמר','הדר','רוני','מעיין','ליאור','דנה','הילה','מורן','ענבל','שני','קרן','אביגיל','שלומית','רותם','ליאת','מיה','אור','נטע','טליה','איילת']

const BIOS_M = [
  'אוהב טיולים בטבע ואוכל טוב',
  'רץ בבוקר, יוגה בערב',
  'מוזיקאי חובב, גיטרה ותקליטים',
  'מהנדס, אבא לכלב',
  'טבח חובב וחובב יין',
  'חולה כדורסל וסדרות',
  'מצלם נופים ברחבי הארץ',
  'אבא לשניים, אוהב ים',
  'קורא ספרים ומטייל',
  'רוכב אופניים בסופ״ש',
  'עורך דין ביום, נגן ג׳אז בלילה',
  'חובב טרקים ומקומות חדשים',
  'תוכניתן, אוהב שקט',
]
const BIOS_F = [
  'אוהבת קפה ושמש',
  'יוגה, טבע ושקט',
  'מעצבת פנים, אמא לחתולה',
  'רופאת שיניים, אוהבת ריקוד',
  'אוהבת ספרים ישנים ובתי קפה',
  'מטפסת ורוכבת אופניים',
  'שפית חובבת ואמא',
  'אוהבת לצאת להופעות',
  'פסיכולוגית, חובבת ים',
  'מטיילת בעולם',
  'מורה ליוגה, אוהבת שוקולד',
  'אדריכלית עם חיבה לאמנות',
  'רצה למרחקים ארוכים',
]

const CITIES = [
  { name: 'Tel Aviv',      lat: 32.0853, lng: 34.7818 },
  { name: 'Jerusalem',     lat: 31.7683, lng: 35.2137 },
  { name: 'Haifa',         lat: 32.7940, lng: 34.9896 },
  { name: 'Beer Sheva',    lat: 31.2518, lng: 34.7915 },
  { name: 'Netanya',       lat: 32.3215, lng: 34.8532 },
  { name: 'Rishon LeZion', lat: 31.9730, lng: 34.8066 },
  { name: 'Petah Tikva',   lat: 32.0878, lng: 34.8878 },
  { name: 'Ashdod',        lat: 31.8044, lng: 34.6553 },
  { name: 'Ramat Gan',     lat: 32.0823, lng: 34.8143 },
  { name: 'Herzliya',      lat: 32.1663, lng: 34.8434 },
  { name: 'Eilat',         lat: 29.5577, lng: 34.9519 },
  { name: 'Kfar Saba',     lat: 32.1789, lng: 34.9067 },
  { name: 'Modiin',        lat: 31.8969, lng: 35.0099 },
  { name: 'Raanana',       lat: 32.1836, lng: 34.8712 },
  { name: 'Rehovot',       lat: 31.8947, lng: 34.8094 },
]

const TOTAL = 50
const MEN_COUNT = 25
const WOMEN_COUNT = TOTAL - MEN_COUNT
const AGE_MIN = 30
const AGE_MAX = 50
const SEED_EMAIL_DOMAIN = 'seed.once.local'

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function randBirthDate(minAge, maxAge) {
  const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1))
  const now = new Date()
  const year = now.getFullYear() - age
  const month = Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

function jitter(v, amt = 0.06) {
  return v + (Math.random() - 0.5) * amt
}

async function createAuthUser(idx) {
  const email = `seed_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}@${SEED_EMAIL_DOMAIN}`
  const password = crypto.randomBytes(16).toString('hex')
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { seed: true },
  })
  if (error) throw new Error(`auth.admin.createUser: ${error.message}`)
  return data.user
}

async function uploadPair(userId, localPath, storedName) {
  const bytes = fs.readFileSync(localPath)
  for (const folder of ['normal', 'blur']) {
    const { error } = await supabase.storage
      .from('users')
      .upload(`${userId}/${folder}/${storedName}`, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (error) throw new Error(`storage upload ${folder}: ${error.message}`)
  }
}

async function insertProfile(user, profile) {
  const { error } = await supabase.from('users').insert({
    user_id: user.id,
    name: profile.name,
    birth_date: profile.birth_date,
    is_male: profile.is_male,
    is_for_male: true,
    is_for_female: true,
    age_from: 18,
    age_to: 99,
    range: 100_000_000,
    state: 'VISIBLE',
    message: profile.bio,
    images: { normal: [profile.storedName], blur: [profile.storedName] },
    location: `SRID=4326;POINT(${profile.lng} ${profile.lat})`,
    watchers: {},
    subscription: {
      endpoint: `https://fcm.googleapis.com/fcm/send/seed-${user.id}`,
      keys: { p256dh: 'seed', auth: 'seed' },
      _seed: true,
    },
  })
  if (error) throw new Error(`users insert: ${error.message}`)
}

async function main() {
  const profilesDir = path.join(__dirname, '..', 'assets', 'profiles', '30-50')
  if (!fs.existsSync(profilesDir)) {
    console.error('profiles dir not found:', profilesDir)
    process.exit(1)
  }
  const files = fs.readdirSync(profilesDir)
  const men = shuffle(files.filter(f => f.startsWith('man_')))
  const women = shuffle(files.filter(f => f.startsWith('woman_')))
  if (men.length < MEN_COUNT || women.length < WOMEN_COUNT) {
    console.error(`not enough images: men=${men.length}, women=${women.length}`)
    process.exit(1)
  }

  const maleNames = shuffle([...MALE_NAMES])
  const femaleNames = shuffle([...FEMALE_NAMES])

  const plan = []
  for (let i = 0; i < MEN_COUNT; i++) {
    plan.push({
      is_male: true,
      name: maleNames[i % maleNames.length],
      bio: BIOS_M[Math.floor(Math.random() * BIOS_M.length)],
      file: men[i],
    })
  }
  for (let i = 0; i < WOMEN_COUNT; i++) {
    plan.push({
      is_male: false,
      name: femaleNames[i % femaleNames.length],
      bio: BIOS_F[Math.floor(Math.random() * BIOS_F.length)],
      file: women[i],
    })
  }
  shuffle(plan)

  let ok = 0, fail = 0
  for (const [idx, p] of plan.entries()) {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)]
    const profile = {
      name: p.name,
      is_male: p.is_male,
      bio: p.bio,
      birth_date: randBirthDate(AGE_MIN, AGE_MAX),
      lat: jitter(city.lat),
      lng: jitter(city.lng),
      storedName: `${Date.now()}_${idx}_${p.file}`,
    }
    let user
    try {
      user = await createAuthUser(idx)
      await uploadPair(user.id, path.join(profilesDir, p.file), profile.storedName)
      await insertProfile(user, profile)
      ok++
      console.log(`[${idx + 1}/${plan.length}] ✓ ${p.name} (${p.is_male ? 'M' : 'F'}) @ ${city.name}`)
    } catch (err) {
      fail++
      console.error(`[${idx + 1}/${plan.length}] ✗ ${p.name}: ${err.message || err}`)
      if (user) await supabase.auth.admin.deleteUser(user.id).catch(() => {})
    }
  }
  console.log(`\nDone. created=${ok} failed=${fail}`)
}

main().catch(err => { console.error(err); process.exit(1) })
