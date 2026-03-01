'use client'

import { useState } from 'react'
import type { UseInviteResult } from '../_hooks/useInvite'

interface Props extends UseInviteResult {
  onInvited?: () => void
}

export function InviteSection({
  invite, loading, error, success, reset, onInvited,
  pendingInvitations, loadingPending, revoke,
}: Props) {
  const [email, setEmail] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset()
    const ok = await invite(email)
    if (ok) {
      setEmail('')
      onInvited?.()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="email"
            required
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {loading ? 'Inviting…' : 'Invite'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Invitation sent successfully.
          </p>
        )}
      </form>

      {/* Pending invitations list */}
      {(loadingPending || pendingInvitations.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Pending invitations
          </p>
          {loadingPending ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {pendingInvitations.map((inv) => (
                <li
                  key={inv.token}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {inv.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke(inv.token)}
                    className="text-xs text-red-500 hover:underline dark:text-red-400"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
