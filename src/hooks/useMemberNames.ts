'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import type { AccountMemberRow } from '@/db/types'

/**
 * Returns a map of userId → displayName for all members of the active account.
 * Returns {} while loading or on error.
 */
export function useMemberNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [supabase, accountId] = await Promise.all([
          Promise.resolve(getSupabase()),
          getActiveAccountId(),
        ])
        const { data } = await supabase.rpc('get_account_members', {
          p_account_id: accountId,
        })
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const m of (data ?? []) as AccountMemberRow[]) {
          map[m.user_id] = m.display_name ?? m.email
        }
        setNames(map)
      } catch {
        // Silently ignore — callers fall back to empty string
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return names
}
