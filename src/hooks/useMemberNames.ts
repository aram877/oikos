'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import type { AccountMemberRow } from '@/db/types'

export interface MemberInfo {
  name:       string
  avatar_url: string | null
}

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

/**
 * Returns a map of userId → { name, avatar_url } for all members of the active account.
 * Also returns the current user's ID.
 * Returns {} while loading or on error.
 */
export function useMemberProfiles(): {
  profiles:      Record<string, MemberInfo>
  currentUserId: string | null
} {
  const [profiles,      setProfiles]      = useState<Record<string, MemberInfo>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase  = getSupabase()
        const accountId = await getActiveAccountId()

        const [{ data: membersData }, { data: userData }] = await Promise.all([
          supabase.rpc('get_account_members', { p_account_id: accountId }),
          supabase.auth.getUser(),
        ])

        if (cancelled) return

        const map: Record<string, MemberInfo> = {}
        for (const m of (membersData ?? []) as AccountMemberRow[]) {
          map[m.user_id] = {
            name:       m.display_name ?? m.email,
            avatar_url: null,
          }
        }

        // Fetch avatar URLs from profiles table
        const userIds = Object.keys(map)
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, avatar_url')
            .in('id', userIds)
          for (const p of (profilesData ?? []) as { id: string; avatar_url: string | null }[]) {
            if (map[p.id]) map[p.id].avatar_url = p.avatar_url
          }
        }

        setProfiles(map)
        setCurrentUserId(userData.user?.id ?? null)
      } catch {
        // Silently ignore
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { profiles, currentUserId }
}
