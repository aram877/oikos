'use client'

import { useState, useEffect, useCallback } from 'react'
import { INVITABLE_ROLES, type Role } from '@/lib/abilities'

export interface PendingInvitation {
  token:      string
  email:      string
  role:       Role
  created_at: string
}

export interface UseInviteResult {
  invite:             (email: string, role: Role) => Promise<boolean>
  loading:            boolean
  error:              string | null
  success:            boolean
  reset:              () => void
  pendingInvitations: PendingInvitation[]
  loadingPending:     boolean
  fetchPending:       () => Promise<void>
  revoke:             (token: string) => Promise<boolean>
}

export { INVITABLE_ROLES }

export function useInvite(): UseInviteResult {
  const [loading,            setLoading]            = useState(false)
  const [error,              setError]              = useState<string | null>(null)
  const [success,            setSuccess]            = useState(false)
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [loadingPending,     setLoadingPending]     = useState(false)

  const fetchPending = useCallback(async () => {
    setLoadingPending(true)
    try {
      const res  = await fetch('/api/invitations')
      const body = await res.json() as { invitations?: PendingInvitation[] }
      setPendingInvitations(body.invitations ?? [])
    } finally {
      setLoadingPending(false)
    }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function invite(email: string, role: Role): Promise<boolean> {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/invitations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, role }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      setSuccess(true)
      await fetchPending()
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function revoke(token: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/invitations?token=${token}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setPendingInvitations((prev) => prev.filter((i) => i.token !== token))
      return true
    } catch {
      return false
    }
  }

  return {
    invite,
    loading,
    error,
    success,
    reset: () => { setError(null); setSuccess(false) },
    pendingInvitations,
    loadingPending,
    fetchPending,
    revoke,
  }
}
