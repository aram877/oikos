'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import { dbClient } from '@/db/db.client'
import type { AccountMemberRow, UpdateMemberPermissionsInput } from '@/db/types'

export interface UseHouseholdMembersResult {
  members:           AccountMemberRow[]
  loading:           boolean
  error:             string | null
  isOwner:           boolean
  currentUserId:     string | null
  updatePermissions: (userId: string, input: UpdateMemberPermissionsInput) => Promise<void>
  removeMember:      (userId: string) => Promise<void>
}

export function useHouseholdMembers(): UseHouseholdMembersResult {
  const [members,       setMembers]       = useState<AccountMemberRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [isOwner,       setIsOwner]       = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [tick,          setTick]          = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const supabase = getSupabase()
        const [{ data: { user } }, accountId] = await Promise.all([
          supabase.auth.getUser(),
          getActiveAccountId(),
        ])
        const uid = user?.id ?? null
        const { data, error: rpcError } = await supabase.rpc('get_account_members', {
          p_account_id: accountId,
        })
        if (cancelled) return
        if (rpcError) throw new Error(rpcError.message)
        const rows = (data ?? []) as AccountMemberRow[]
        setMembers(rows)
        setCurrentUserId(uid)
        setIsOwner(rows.some((m) => m.user_id === uid && m.role === 'owner'))
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tick])

  const updatePermissions = useCallback(async (userId: string, input: UpdateMemberPermissionsInput) => {
    const prev = members
    setMembers((ms) => ms.map((m) => m.user_id === userId ? { ...m, ...input } : m))
    try {
      await dbClient.accounts.updateMemberPermissions(userId, input)
    } catch (err) {
      setMembers(prev)
      throw err
    }
  }, [members])

  const removeMember = useCallback(async (userId: string) => {
    const supabase = getSupabase()
    const accountId = await getActiveAccountId()
    const { error: rpcError } = await supabase.rpc('remove_account_member', {
      p_account_id: accountId,
      p_member_id:  userId,
    })

    if (rpcError) throw new Error(rpcError.message)
    setMembers((ms) => ms.filter((m) => m.user_id !== userId))
  }, [])

  return {
    members,
    loading,
    error,
    isOwner,
    currentUserId,
    updatePermissions,
    removeMember,
  }
}
