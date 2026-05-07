'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/db/supabase'
import { dbClient } from '@/db/db.client'

/**
 * Total unread-message count for the active account, server-derived from
 * `message_reads`.  Updates in realtime on new messages and on read events.
 */
export function MessagesNavBadge() {
  const [count, setCount] = useState(0)
  const pathname          = usePathname()

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    async function refresh() {
      try {
        const n = await dbClient.messages.unreadCount()
        if (!cancelled) setCount(n)
      } catch {
        // Silently ignore — badge is non-critical.
      }
    }

    refresh()

    const channel = supabase
      .channel('messages_badge_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },      () => refresh())
      .on('postgres_changes', { event: '*',      schema: 'public', table: 'message_reads' }, () => refresh())
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [pathname])

  if (count === 0) return null

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
      {count > 9 ? '9+' : count}
    </span>
  )
}
