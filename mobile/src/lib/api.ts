import { supabase } from './supabase'
import { useUserStore } from '../stores/userStore'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!

export async function invoke<T = any>(fn: string, body?: object): Promise<T> {

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token ?? ''}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body ?? {}),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await supabase.auth.signOut()
      return null as any
    }
    throw new Error(await res.text())
  }

  // Some endpoints (e.g. app/reset) return an empty body when there is no
  // user record to serialize. Parsing `await res.json()` on "" throws a
  // SyntaxError, so read as text and only parse when non-empty.
  const text = await res.text()
  const data = (text ? JSON.parse(text) : null) as T
  // Iron rule: the `app` edge function returns the authoritative user record
  // on every call. Merge it straight into the store so no component needs to
  // fetch after invoking. Realtime covers the rest (changes from other
  // sources), and both funnels flow through the same applyServerUser entry.
  // We tag this path as 'invoke' so client-authored fields are skipped —
  // realtime (post-commit) is the truth source for those.
  if (fn === 'app' || fn.startsWith('app/')) useUserStore.getState().applyServerUser(data as any, 'invoke')
  return data
}

export function publicImageUrl(userId: string, folder: 'normal' | 'blur', filename: string) {
  // `encodeURI` preserves already-safe chars like `-`, `_`, `.` and slashes
  // in case the filename accidentally carries a path, while still escaping
  // spaces and unicode that RN's Image loader won't normalize on its own.
  return `${supabaseUrl}/storage/v1/object/public/users/${userId}/${folder}/${encodeURI(filename)}`
}
