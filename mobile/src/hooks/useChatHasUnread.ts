import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUserStore } from '../stores/userStore'

// Minimal "are there unread partner messages right now" signal for the home
// card's open-chat button. ChatPage owns the full unread COUNT, but it lives
// inside an OverlaySheet that is UNMOUNTED while the chat is closed — which is
// exactly when the home badge must stay live (a message arriving while the
// user is on the home card). So this hook tracks the boolean independently and
// cheaply, mirroring ChatPage's realtime pattern:
//   unread ⇔ the newest partner message is newer than my durable last-read.
// `chat_reads` (reader_id = me, peer_id = partner) is the last-read source of
// truth — the same durable row ChatPage upserts on read, so opening the chat
// clears the badge across sessions/devices without any extra plumbing.
//
// `chatOpen` is the home overlay flag: while the chat sheet is open the user
// is reading, so the badge is force-cleared and inbound messages are ignored
// (ChatPage marks them read). It re-arms the moment the sheet closes.
export function useChatHasUnread(chatOpen: boolean): boolean {
  const userId = useUserStore(s => s.profile?.user_id ?? '')
  const otherId = useUserStore(s => s.profile?.relations?.match?.user_id ?? '')
  const inChat = useUserStore(s => s.profile?.state === 'chat')
  const [hasUnread, setHasUnread] = useState(false)

  // Opening the chat = reading it. Force-clear and keep the realtime callback
  // from re-arming while the sheet is up.
  const chatOpenRef = useRef(chatOpen)
  chatOpenRef.current = chatOpen
  useEffect(() => {
    if (chatOpen) setHasUnread(false)
  }, [chatOpen])

  useEffect(() => {
    if (!userId || !otherId || !inChat) { setHasUnread(false); return }
    let cancelled = false

    // Initial reconciliation: newest partner message vs. my durable last-read.
    ;(async () => {
      const [readRes, msgRes] = await Promise.all([
        supabase.from('chat_reads').select('last_read_at')
          .eq('reader_id', userId).eq('peer_id', otherId).maybeSingle(),
        supabase.from('chat').select('created_at')
          .eq('user_id', otherId).eq('other_id', userId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (cancelled || chatOpenRef.current) return
      const lastRead = (readRes.data as { last_read_at?: string } | null)?.last_read_at ?? null
      const latest = (msgRes.data as { created_at?: string } | null)?.created_at ?? null
      if (latest && (!lastRead || latest > lastRead)) setHasUnread(true)
    })()

    // Live: a partner message arriving while the sheet is closed marks unread.
    // Same channel shape as ChatPage's inbound subscription (filter on my
    // other_id, then match the sender).
    const channel = supabase
      .channel(`home-unread:${userId}:${otherId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'chat', filter: `other_id=eq.${userId}` },
        (payload: any) => {
          const row = payload?.new as { user_id?: string } | undefined
          if (!row || row.user_id !== otherId) return
          if (!chatOpenRef.current) setHasUnread(true)
        },
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [userId, otherId, inChat])

  return hasUnread
}
