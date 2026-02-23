'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import type { AccountMemberRow } from '@/db/types'

export interface UseAccountMembersResult {
  members:    AccountMemberRow[]
  loading:    boolean
  error:      string | null
  removeMember: (userId: string) => Promise<void>
  refresh:    () => void
}

export function useAccountMembers(): UseAccountMembersResult {
  const [members, setMembers] = useState<AccountMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [supabase, accountId] = await Promise.all([
          Promise.resolve(getSupabase()),
          getActiveAccountId(),
        ])
        const { data, error: rpcError } = await supabase.rpc('get_account_members', {
          p_account_id: accountId,
        })
        if (cancelled) return
        if (rpcError) throw new Error(rpcError.message)
        setMembers((data ?? []) as AccountMemberRow[])
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tick])

  const removeMember = useCallback(async (userId: string) => {
    const [supabase, accountId] = await Promise.all([
      Promise.resolve(getSupabase()),
      getActiveAccountId(),
    ])
    const { error: delError } = await supabase
      .from('account_members')
      .delete()
      .eq('account_id', accountId)
      .eq('user_id', userId)

    if (delError) throw new Error(delError.message)
    setTick((t) => t + 1)
  }, [])

  return {
    members,
    loading,
    error,
    removeMember,
    refresh: () => setTick((t) => t + 1),
  }
}
