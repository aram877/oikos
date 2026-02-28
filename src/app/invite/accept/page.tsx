'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface InviteDetails {
  account_name: string
  invited_by_name: string
}

type PageState = 'loading' | 'ready' | 'accepting' | 'error'

export default function AcceptInvitePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')

  const [state,   setState]   = useState<PageState>('loading')
  const [details, setDetails] = useState<InviteDetails | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link — no token found.')
      setState('error')
      return
    }

    async function loadDetails() {
      const supabase = createClient()
      const { data, error: rpcErr } = await supabase.rpc(
        'get_invitation_by_token',
        { p_token: token },
      )

      if (rpcErr || !data || (data as InviteDetails[]).length === 0) {
        setError('This invitation is invalid or has already been accepted.')
        setState('error')
        return
      }

      setDetails((data as InviteDetails[])[0])
      setState('ready')
    }

    loadDetails()
  }, [token])

  async function handleAccept() {
    if (!token) return
    setState('accepting')
    setError(null)

    const supabase = createClient()
    const { error: rpcErr } = await supabase.rpc('accept_invitation', { p_token: token })

    if (rpcErr) {
      setError(rpcErr.message)
      setState('ready')
      return
    }

    // Hard navigation — clears the module-level _accountId cache in
    // accountContext.ts so all repos re-query with the new account.
    window.location.replace('/transactions')
  }

  // ── Loading ────────────────────────────────────────────────────────────── //
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-500">Loading invitation…</p>
      </div>
    )
  }

  // ── Error (invalid / expired token) ───────────────────────────────────── //
  if (state === 'error' || !details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-3 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Invitation not found
          </h1>
          <p className="text-sm text-neutral-500">{error}</p>
          <button
            onClick={() => router.push('/transactions')}
            className="mt-6 text-sm text-neutral-700 underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            Go to app
          </button>
        </div>
      </div>
    )
  }

  // ── Confirmation ──────────────────────────────────────────────────────── //
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Join household?
        </h1>

        <p className="mb-6 text-sm text-neutral-500">
          <strong className="text-neutral-700 dark:text-neutral-300">
            {details.invited_by_name}
          </strong>{' '}
          has invited you to join{' '}
          <strong className="text-neutral-700 dark:text-neutral-300">
            {details.account_name}
          </strong>
          .
        </p>

        {/* Warning box */}
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <p className="font-medium">Before you accept</p>
          <p className="mt-1">
            You will be removed from your current household. Any personal data
            (transactions, categories, etc.) saved there will no longer be
            accessible to you.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={state === 'accepting'}
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {state === 'accepting' ? 'Joining…' : 'Accept & join'}
          </button>
          <button
            onClick={() => router.push('/transactions')}
            disabled={state === 'accepting'}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
