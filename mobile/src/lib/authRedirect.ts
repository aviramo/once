import * as Linking from 'expo-linking'
import { supabase } from './supabase'

// The deep link the magic-link email points back to. Must be in the
// "Additional Redirect URLs" allowlist on the Supabase dashboard
// (Auth → URL Configuration). With the `once` scheme registered in
// app.json, this resolves to `once://login-callback`.
export function getMagicLinkRedirect(): string {
  return Linking.createURL('login-callback')
}

// Parse a deep link URL coming from Supabase (after the user clicked the
// magic link) and create a session. Returns true if a session was created.
//
// Supabase's implicit-flow magic link uses the URL fragment, e.g.
//   once://login-callback#access_token=...&refresh_token=...&type=magiclink
// We accept either fragment or query-string just in case the project is
// later switched to PKCE/code flow (then exchange via exchangeCodeForSession).
export async function consumeMagicLinkUrl(url: string): Promise<boolean> {
  try {
    const parsed = Linking.parse(url)
    const fragment = extractFragment(url)
    const params: Record<string, string> = {
      ...(parsed.queryParams as Record<string, string> | null ?? {}),
      ...fragment,
    }

    if (params.error || params.error_code) {
      console.error('Magic link error:', params.error_description || params.error)
      return false
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      })
      if (error) {
        console.error('Magic link setSession error:', error)
        return false
      }
      return true
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code)
      if (error) {
        console.error('Magic link exchangeCodeForSession error:', error)
        return false
      }
      return true
    }

    return false
  } catch (e) {
    console.error('consumeMagicLinkUrl threw:', e)
    return false
  }
}

function extractFragment(url: string): Record<string, string> {
  const idx = url.indexOf('#')
  if (idx < 0) return {}
  const frag = url.slice(idx + 1)
  const out: Record<string, string> = {}
  for (const piece of frag.split('&')) {
    if (!piece) continue
    const eq = piece.indexOf('=')
    if (eq < 0) {
      out[decodeURIComponent(piece)] = ''
    } else {
      out[decodeURIComponent(piece.slice(0, eq))] = decodeURIComponent(piece.slice(eq + 1))
    }
  }
  return out
}
