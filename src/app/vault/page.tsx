'use client'

import { useEffect, useMemo, useState } from 'react'
import { useVault } from './_hooks/useVault'
import { SetupForm } from './_components/SetupForm'
import { UnlockForm } from './_components/UnlockForm'
import { EntryDialog } from './_components/EntryDialog'
import { useAbilities } from '@/hooks/useAbilities'
import type { PasswordEntryRow, PasswordEntrySecret } from '@/db/types'

export default function VaultPage() {
  useEffect(() => { document.title = 'Vault | Oikos' }, [])

  const { role, can, loading: abilitiesLoading } = useAbilities()
  const isAdmin  = role === 'admin'
  const canRead  = abilitiesLoading || can('vault', 'read')
  const canWrite = abilitiesLoading || can('vault', 'write')

  const vault = useVault()
  const {
    status, entries, error, loadError,
    setup, unlock, lock,
    decryptEntry, addEntry, saveEntry, removeEntry, resetVault,
  } = vault

  const [filter,        setFilter]        = useState('')
  const [dialogEntry,   setDialogEntry]   = useState<PasswordEntryRow | null>(null)
  const [dialogSecret,  setDialogSecret]  = useState<PasswordEntrySecret | null>(null)
  const [adding,        setAdding]        = useState(false)
  const [busy,          setBusy]          = useState(false)
  const [confirmReset,  setConfirmReset]  = useState(false)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      e.name.toLowerCase().includes(q) || (e.url ?? '').toLowerCase().includes(q),
    )
  }, [entries, filter])

  async function openEntry(entry: PasswordEntryRow) {
    const secret = await decryptEntry(entry)
    setDialogEntry(entry)
    setDialogSecret(secret)
  }

  async function handleSubmit(input: { name: string; url: string | null; secret: PasswordEntrySecret }) {
    setBusy(true)
    try {
      if (dialogEntry) {
        await saveEntry(dialogEntry.id, input)
      } else {
        await addEntry(input)
      }
      setDialogEntry(null); setDialogSecret(null); setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!dialogEntry) return
    setBusy(true)
    try {
      await removeEntry(dialogEntry.id)
      setDialogEntry(null); setDialogSecret(null)
    } finally {
      setBusy(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────── //

  if (status === 'loading' || abilitiesLoading) {
    return <Shell><p className="py-12 text-center text-sm text-muted-foreground">Loading…</p></Shell>
  }

  if (status === 'error') {
    return (
      <Shell>
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{loadError ?? 'Failed to load.'}</p>
      </Shell>
    )
  }

  if (!canRead) {
    return (
      <Shell>
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium">Access required</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your household admin needs to grant you vault access.
          </p>
        </div>
      </Shell>
    )
  }

  if (status === 'not-set-up') {
    return <Shell><SetupForm isAdmin={isAdmin} onSetup={setup} /></Shell>
  }

  if (status === 'locked') {
    return <Shell><UnlockForm onUnlock={unlock} error={error} /></Shell>
  }

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search…"
          className="w-full max-w-xs rounded-full border border-input bg-background px-4 py-1.5 text-sm focus:outline-none focus:border-ring"
        />
        <div className="flex shrink-0 items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              + Add
            </button>
          )}
          <button
            type="button"
            onClick={lock}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Lock
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {entries.length === 0 ? 'No entries yet' : 'No matches'}
          </p>
          {entries.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Add your first shared password — Wi-Fi, Netflix, gym membership.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => openEntry(e)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {e.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{e.name}</p>
                  {e.url && <p className="truncate text-xs text-muted-foreground">{e.url}</p>}
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="mt-12 border-t border-border pt-6">
          <h3 className="text-sm font-semibold">Danger zone</h3>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="mt-2 text-xs text-destructive hover:underline"
            >
              Reset vault (deletes every entry)
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span>This permanently deletes every entry. There is no recovery.</span>
              <button
                type="button"
                onClick={async () => { await resetVault(); setConfirmReset(false) }}
                className="rounded-full bg-destructive px-3 py-1 font-medium text-white hover:opacity-90"
              >
                Yes, wipe vault
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {(adding || dialogEntry) && (
        <EntryDialog
          entry={dialogEntry}
          initialSecret={dialogSecret}
          busy={busy}
          canEdit={canWrite}
          onSubmit={handleSubmit}
          onDelete={dialogEntry && canWrite ? handleDelete : null}
          onClose={() => { setDialogEntry(null); setDialogSecret(null); setAdding(false) }}
        />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Household vault</h1>
      </div>
      {children}
    </div>
  )
}
