'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

export function MessagesNavBadge() {
  const [count,   setCount]   = useState(0)
  const pathname              = usePathname()
  const accountIdRef          = useRef<string | null>(null)

  // Reset count when on messages page
  useEffect(() => {
    if (pathname === '/messages') {
      setCount(0)
      localStorage.setItem('msgs_last_seen', new Date().toISOString())
    }
  }, [pathname])

  // Initial unread count + realtime
  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    async function loadCount() {
      try {
        const accountId = await getActiveAccountId()
        if (cancelled) return
        accountIdRef.current = accountId

        const lastSeen = localStorage.getItem('msgs_last_seen') ?? new Date(0).toISOString()

        const { count: unread } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .gt('created_at', lastSeen)

        if (!cancelled && pathname !== '/messages') {
          setCount(unread ?? 0)
        }
      } catch {
        // Silently ignore
      }
    }

    loadCount()

    const channel = supabase
      .channel('messages_badge_rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          if (pathname !== '/messages') {
            setCount((c) => c + 1)
          } else {
            localStorage.setItem('msgs_last_seen', new Date().toISOString())
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (count === 0) return null

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
      {count > 9 ? '9+' : count}
    </span>
  )
}
