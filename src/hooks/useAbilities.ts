'use client'

/**
 * useAbilities — exposes the current user's abilities based on their role
 * and per-feature access columns.
 *
 * Usage:
 *   const { can, role, loading } = useAbilities()
 *
 *   // hide a button when the user has no AI write access
 *   {can('ai', 'write') && <AutoCategorizeButton />}
 *
 *   // disable a delete button when not an admin
 *   <button disabled={!can('finance', 'delete')}>Delete</button>
 *
 *   // branch on role directly
 *   {role === 'admin' && <AdminPanel />}
 */

import { useState, useEffect } from 'react'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import {
  can as canFn,
  canRole as canRoleFn,
  type Role,
  type Feature,
  type Action,
} from '@/lib/abilities'
import type { AccessLevel } from '@/db/types'

// The columns we select from account_members for the current user
interface MemberRow {
  role:             Role
  finance_access:   AccessLevel
  shopping_access:  AccessLevel
  calendar_access:  AccessLevel
  settings_access:  AccessLevel
  ai_access:        AccessLevel
  messaging_access: AccessLevel
  vault_access:     AccessLevel
}

// Maps a Feature name to its DB column name
function accessColumn(feature: Feature): keyof MemberRow {
  return `${feature}_access` as keyof MemberRow
}

export interface UseAbilitiesResult {
  /** Check if the current user can perform action on feature (role ceiling + access column). */
  can:     (feature: Feature, action: Action) => boolean
  /** Ceiling-only check — ignores the access column. Useful for disabling/hiding controls. */
  canRole: (feature: Feature, action: Action) => boolean
  role:    Role | null
  loading: boolean
}

export function useAbilities(): UseAbilitiesResult {
  const [member,  setMember]  = useState<MemberRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase  = getSupabase()
        const accountId = await getActiveAccountId()

        const { data } = await supabase
          .from('account_members')
          .select('role, finance_access, shopping_access, calendar_access, settings_access, ai_access, messaging_access, vault_access')
          .eq('account_id', accountId)
          .single()

        if (!cancelled && data) setMember(data as MemberRow)
      } catch {
        // silently degrade — can() returns false when member is null
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  function can(feature: Feature, action: Action): boolean {
    if (!member) return false
    const accessLevel = member[accessColumn(feature)] as AccessLevel
    return canFn(member.role, feature, action, accessLevel)
  }

  function canRole(feature: Feature, action: Action): boolean {
    if (!member) return false
    return canRoleFn(member.role, feature, action)
  }

  return { can, canRole, role: member?.role ?? null, loading }
}
