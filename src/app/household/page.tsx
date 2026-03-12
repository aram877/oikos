'use client'

import { useState, useCallback, useEffect } from 'react'
import { useHouseholdMembers } from './_hooks/useHouseholdMembers'
import { useInvite, INVITABLE_ROLES } from '@/app/settings/_hooks/useInvite'
import { ROLE_LABELS, ROLE_DESCRIPTIONS, canRole } from '@/lib/abilities'
import type { AccessLevel, AccountMemberRow, UpdateMemberPermissionsInput } from '@/db/types'
import type { Role } from '@/lib/abilities'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const ACCESS_LEVELS: AccessLevel[] = ['none', 'read', 'write']

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground shrink-0">
      {name[0].toUpperCase()}
    </span>
  )
}

// ── Access radio with per-save feedback ───────────────────────────────────── //

function AccessRadio({
  memberId,
  feature,
  value,
  onSave,
  disabled,
}: {
  memberId: string
  feature:  string
  value:    AccessLevel
  onSave:   (v: AccessLevel) => Promise<void>
  disabled: boolean
}) {
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<'saved' | 'error' | null>(null)
  const name = `${memberId}-${feature.toLowerCase()}`

  async function handleChange(level: AccessLevel) {
    if (disabled || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await onSave(level)
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch {
      setSaveMsg('error')
      setTimeout(() => setSaveMsg(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-muted-foreground shrink-0">{feature}</span>
      {ACCESS_LEVELS.map((level) => (
        <label
          key={level}
          className={`flex items-center gap-1 select-none ${disabled || saving ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name={name}
            value={level}
            checked={value === level}
            onChange={() => handleChange(level)}
            disabled={disabled || saving}
            className="accent-foreground"
          />
          <span className="capitalize text-muted-foreground">{level}</span>
        </label>
      ))}
      {saveMsg === 'saved' && (
        <span className="text-xs text-green-700 dark:text-green-400 transition-opacity">Saved ✓</span>
      )}
      {saveMsg === 'error' && (
        <span className="text-xs text-destructive">Failed to save</span>
      )}
    </div>
  )
}

function MemberRow({ member, isSelf }: { member: AccountMemberRow; isSelf: boolean }) {
  const displayName = member.display_name ?? member.email
  const role        = member.role as Role
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Avatar name={displayName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {displayName}
              {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {ROLE_LABELS[role] ?? role}
            </Badge>
          </div>
          {member.display_name && (
            <div className="text-xs text-muted-foreground truncate">{member.email}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AdminMemberCard({
  member,
  isSelf,
  onUpdatePermissions,
  onRemove,
}: {
  member:              AccountMemberRow
  isSelf:              boolean
  onUpdatePermissions: (input: UpdateMemberPermissionsInput) => Promise<void>
  onRemove:            () => Promise<void>
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing,      setRemoving]      = useState(false)
  const [removeError,   setRemoveError]   = useState<string | null>(null)

  const displayName = member.display_name ?? member.email
  const role        = member.role as Role

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar name={displayName} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {displayName}
                  {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </span>
                <Badge variant="secondary">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              </div>
              {member.display_name && (
                <div className="text-xs text-muted-foreground">{member.email}</div>
              )}
            </div>
          </div>

          {!isSelf && role !== 'admin' && (
            confirmRemove ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Remove?</span>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-destructive hover:text-destructive/80 font-medium transition-colors"
                >
                  {removing ? 'Removing…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-sm text-destructive/70 hover:text-destructive transition-colors"
              >
                Remove
              </button>
            )
          )}
        </div>
      </CardHeader>

      {removeError && (
        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-destructive">{removeError}</p>
        </CardContent>
      )}

      {role === 'admin' ? (
        <CardContent className="pt-0 pb-4">
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS.admin}</p>
        </CardContent>
      ) : (
        <CardContent className="pt-0 pb-4">
          <Separator className="mb-3" />
          <div className="space-y-2">
            <AccessRadio
              memberId={member.user_id}
              feature="Finance"
              value={member.finance_access}
              onSave={(v) => onUpdatePermissions({ finance_access: v })}
              disabled={!canRole(role, 'finance', 'read')}
            />
            <AccessRadio
              memberId={member.user_id}
              feature="Shopping"
              value={member.shopping_access}
              onSave={(v) => onUpdatePermissions({ shopping_access: v })}
              disabled={false}
            />
            <AccessRadio
              memberId={member.user_id}
              feature="Calendar"
              value={member.calendar_access}
              onSave={(v) => onUpdatePermissions({ calendar_access: v })}
              disabled={false}
            />
            <AccessRadio
              memberId={member.user_id}
              feature="Settings"
              value={member.settings_access}
              onSave={(v) => onUpdatePermissions({ settings_access: v })}
              disabled={false}
            />
            <AccessRadio
              memberId={member.user_id}
              feature="AI"
              value={member.ai_access}
              onSave={(v) => onUpdatePermissions({ ai_access: v })}
              disabled={false}
            />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Pending invitation row with revoke confirmation ───────────────────────── //

function PendingInviteRow({
  email, role, token, onRevoke,
}: {
  email:    string
  role:     Role
  token:    string
  onRevoke: (token: string) => void
}) {
  const [confirm, setConfirm] = useState(false)

  return (
    <li className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm text-foreground">{email}</span>
      <span className="flex items-center gap-3">
        <Badge variant="secondary" className="text-xs">
          {ROLE_LABELS[role]}
        </Badge>
        {confirm ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Revoke?</span>
            <button
              type="button"
              onClick={() => onRevoke(token)}
              className="font-medium text-destructive transition-colors hover:text-destructive/80"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-xs text-destructive/70 transition-colors hover:text-destructive hover:underline"
          >
            Revoke
          </button>
        )}
      </span>
    </li>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────── //

export default function HouseholdPage() {
  useEffect(() => { document.title = 'Household | Household' }, [])

  const {
    members, loading, error, isAdmin, currentUserId,
    updatePermissions, removeMember,
  } = useHouseholdMembers()

  const {
    invite, loading: inviting, error: inviteError,
    success: inviteSuccess, reset: resetInvite,
    pendingInvitations, loadingPending, revoke,
  } = useInvite()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<Role>('parent')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    const ok = await invite(inviteEmail.trim(), inviteRole)
    if (ok) setInviteEmail('')
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold">Household Members</h1>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error   && <p className="text-sm text-destructive">{error}</p>}

      {!loading && (
        <div className="space-y-3">
          {isAdmin
            ? members.map((member) => (
                <AdminMemberCard
                  key={member.user_id}
                  member={member}
                  isSelf={member.user_id === currentUserId}
                  onUpdatePermissions={(input) => updatePermissions(member.user_id, input)}
                  onRemove={() => removeMember(member.user_id)}
                />
              ))
            : members.map((member) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  isSelf={member.user_id === currentUserId}
                />
              ))
          }
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Invite someone</h2>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="flex gap-4">
                {INVITABLE_ROLES.map((r) => (
                  <label key={r} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="invite-role"
                      value={r}
                      checked={inviteRole === r}
                      onChange={() => setInviteRole(r)}
                      className="mt-0.5 accent-foreground"
                    />
                    <span>
                      <span className="block text-sm font-medium">{ROLE_LABELS[r]}</span>
                      <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); resetInvite() }}
                  className="flex-1"
                />
                <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? 'Sending…' : 'Send invite'}
                </Button>
              </div>

              {inviteError   && <p className="text-xs text-destructive">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-green-700 dark:text-green-400">Invitation sent!</p>}
            </form>

            {(loadingPending || pendingInvitations.length > 0) && (
              <div>
                <Separator className="mb-3" />
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pending invitations
                </p>
                {loadingPending ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (
                  <ul className="space-y-1.5">
                    {pendingInvitations.map((inv) => (
                      <PendingInviteRow
                        key={inv.token}
                        email={inv.email}
                        role={inv.role}
                        token={inv.token}
                        onRevoke={revoke}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  )
}
