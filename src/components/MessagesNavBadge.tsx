'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

/** Returns the oldest last-seen timestamp across all conversation keys, or epoch if none. */
function getOldestLastSeen(): string {
  if (typeof window === 'undefined') return new Date(0).toISOString()
  let oldest: string | null = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('msgs_last_seen')) continue
    const val = localStorage.getItem(key)
    if (!val) continue
    if (oldest === null || val < oldest) oldest = val
  }
  return oldest ?? new Date(0).toISOString()
}

export function MessagesNavBadge() {
  const [count,   setCount]   = useState(0)
  const pathname              = usePathname()
  const accountIdRef          = useRef<string | null>(null)

  // Reset count when on any messages page
  useEffect(() => {
    if (pathname.startsWith('/messages')) {
      setCount(0)
    }
  }, [pathname])

  // Initial unread count + realtime
  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    async function loadCount() {
      try {
        const [accountId, { data: userData }] = await Promise.all([
          getActiveAccountId(),
          supabase.auth.getUser(),
        ])
        if (cancelled) return
        accountIdRef.current = accountId

        const currentUserId = userData.user?.id
        const lastSeen = getOldestLastSeen()

        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .gt('created_at', lastSeen)

        if (currentUserId) {
          query = query.neq('user_id', currentUserId)
        }

        const { count: unread } = await query

        if (!cancelled && !pathname.startsWith('/messages')) {
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
        (payload) => {
          if (pathname.startsWith('/messages')) {
            // Already viewing messages — don't increment
            return
          }
          setCount((c) => c + 1)
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
