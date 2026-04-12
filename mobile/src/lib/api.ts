import { supabase } from './supabase'
import { useUserStore } from '../stores/userStore'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!

let _lastInvokeTime = 0
export const getLastInvokeTime = () => _lastInvokeTime

export async function invoke<T = any>(fn: string, body?: object): Promise<T> {
  _lastInvokeTime = Date.now()

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

  const data = await res.json() as T
  // Iron rule: the `app` edge function returns the authoritative user record
  // on every call. Merge it straight into the store so no component needs to
  // fetch after invoking. Realtime covers the rest (changes from other
  // sources), and both funnels flow through the same applyServerUser entry.
  // We tag this path as 'invoke' so client-authored fields are skipped —
  // realtime (post-commit) is the truth source for those.
  if (fn === 'app') useUserStore.getState().applyServerUser(data as any, 'invoke')
  return data
}
