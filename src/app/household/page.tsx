'use client'

import { useState } from 'react'
import { useHouseholdMembers } from './_hooks/useHouseholdMembers'
import { useInvite } from '@/app/settings/_hooks/useInvite'
import type { AccessLevel, AccountMemberRow, UpdateMemberPermissionsInput } from '@/db/types'

const ACCESS_LEVELS: AccessLevel[] = ['none', 'read', 'write']

function AccessRadio({
  memberId,
  feature,
  value,
  onChange,
  disabled,
}: {
  memberId: string
  feature:  string
  value:    AccessLevel
  onChange: (v: AccessLevel) => void
  disabled: boolean
}) {
  const name = `${memberId}-${feature.toLowerCase()}`
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-neutral-500 shrink-0">{feature}</span>
      {ACCESS_LEVELS.map((level) => (
        <label
          key={level}
          className={`flex items-center gap-1 select-none ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name={name}
            value={level}
            checked={value === level}
            onChange={() => !disabled && onChange(level)}
            disabled={disabled}
            className="accent-blue-500"
          />
          <span className="capitalize">{level}</span>
        </label>
      ))}
    </div>
  )
}

function MemberCard({
  member,
  isSelf,
  isOwner,
  onUpdatePermissions,
  onRemove,
}: {
  member:              AccountMemberRow
  isSelf:              boolean
  isOwner:             boolean
  onUpdatePermissions: (input: UpdateMemberPermissionsInput) => Promise<void>
  onRemove:            () => Promise<void>
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing,      setRemoving]      = useState(false)
  const [removeError,   setRemoveError]   = useState<string | null>(null)

  const displayName = member.display_name ?? member.email
  const initial     = displayName[0].toUpperCase()

  async function handleRemove() {
    setRemoving(true)
    setRemoveError(null)
    try {
      await onRemove()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err))
      setRemoving(false)
      setConfirmRemove(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold dark:bg-neutral-700 shrink-0">
            {initial}
          </span>
          <div>
            <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
              {member.display_name ?? member.email}
            </div>
            {member.display_name && (
              <div className="text-xs text-neutral-500">{member.email}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            {member.role}
          </span>
          {isOwner && !isSelf && member.role !== 'owner' && (
            confirmRemove ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Remove?</span>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-red-600 hover:text-red-700 font-medium"
                >
                  {removing ? 'Removing…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-neutral-500 hover:text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )
          )}
        </div>
      </div>

      {removeError && (
        <p className="text-xs text-red-600">{removeError}</p>
      )}

      {member.role === 'owner' ? (
        <p className="text-xs text-neutral-400">Full access to all features</p>
      ) : (
        <div className="space-y-1.5 pt-1">
          <AccessRadio
            memberId={member.user_id}
            feature="Finance"
            value={member.finance_access}
            onChange={(v) => onUpdatePermissions({ finance_access: v })}
            disabled={!isOwner}
          />
          <AccessRadio
            memberId={member.user_id}
            feature="Shopping"
            value={member.shopping_access}
            onChange={(v) => onUpdatePermissions({ shopping_access: v })}
            disabled={!isOwner}
          />
          <AccessRadio
            memberId={member.user_id}
            feature="Calendar"
            value={member.calendar_access}
            onChange={(v) => onUpdatePermissions({ calendar_access: v })}
            disabled={!isOwner}
          />
        </div>
      )}
    </div>
  )
}

export default function HouseholdPage() {
  const {
    members, loading, error, isOwner, currentUserId,
    updatePermissions, removeMember,
  } = useHouseholdMembers()

  const {
    invite, loading: inviting, error: inviteError,
    success: inviteSuccess, reset: resetInvite,
  } = useInvite()

  const [inviteEmail, setInviteEmail] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    await invite(inviteEmail.trim())
    if (!inviteError) setInviteEmail('')
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Household Members
      </h1>

      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {!loading && (
        <div className="space-y-3">
          {members.map((member) => (
            <MemberCard
              key={member.user_id}
              member={member}
              isSelf={member.user_id === currentUserId}
              isOwner={isOwner}
              onUpdatePermissions={(input) => updatePermissions(member.user_id, input)}
              onRemove={() => removeMember(member.user_id)}
            />
          ))}
        </div>
      )}

      {isOwner && (
        <section className="border-t border-neutral-200 dark:border-neutral-800 pt-6 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Invite someone
          </h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); resetInvite() }}
              className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {inviteError   && <p className="text-xs text-red-600">{inviteError}</p>}
          {inviteSuccess && <p className="text-xs text-green-600">Invitation sent!</p>}
        </section>
      )}
    </main>
  )
}
