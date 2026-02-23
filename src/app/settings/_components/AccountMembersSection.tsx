'use client'

import type { UseAccountMembersResult } from '../_hooks/useAccountMembers'

interface Props extends UseAccountMembersResult {
  currentUserId: string
}

export function AccountMembersSection({
  members,
  loading,
  error,
  removeMember,
  currentUserId,
}: Props) {
  if (loading) {
    return <p className="text-sm text-neutral-400">Loading members…</p>
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Failed to load members: {error}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const isOwner = m.role === 'owner'
        const isSelf  = m.user_id === currentUserId
        return (
          <li
            key={m.user_id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
          >
            <span className="flex items-center gap-2">
              <span className="text-neutral-800 dark:text-neutral-200">{m.email}</span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                {m.role}
              </span>
            </span>

            {!isSelf && (
              <button
                type="button"
                onClick={() => removeMember(m.user_id)}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400"
                aria-label={`Remove ${m.email}`}
              >
                {isOwner ? 'Remove' : 'Remove'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
