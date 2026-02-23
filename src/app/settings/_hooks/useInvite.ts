'use client'

import { useState } from 'react'

export interface UseInviteResult {
  invite:   (email: string) => Promise<void>
  loading:  boolean
  error:    string | null
  success:  boolean
  reset:    () => void
}

export function useInvite(): UseInviteResult {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function invite(email: string) {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/invitations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return {
    invite,
    loading,
    error,
    success,
    reset: () => { setError(null); setSuccess(false) },
  }
}
