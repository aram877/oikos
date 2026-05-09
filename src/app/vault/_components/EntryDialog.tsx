'use client'

import { useEffect, useState } from 'react'
import type { PasswordEntryRow, PasswordEntrySecret } from '@/db/types'

interface Props {
  /** Existing entry (edit mode) or null (add mode). */
  entry:        PasswordEntryRow | null
  /** Initial decrypted secret for edit mode. */
  initialSecret: PasswordEntrySecret | null
  busy:         boolean
  canEdit:      boolean
  onSubmit:     (input: { name: string; url: string | null; secret: PasswordEntrySecret }) => Promise<void>
  onDelete:     (() => Promise<void>) | null
  onClose:      () => void
}

const EMPTY: PasswordEntrySecret = { username: '', password: '', notes: '', totp_secret: null }

export function EntryDialog({ entry, initialSecret, busy, canEdit, onSubmit, onDelete, onClose }: Props) {
  const [name,     setName]     = useState(entry?.name ?? '')
  const [url,      setUrl]      = useState(entry?.url ?? '')
  const [username, setUsername] = useState(initialSecret?.username ?? '')
  const [password, setPassword] = useState(initialSecret?.password ?? '')
  const [notes,    setNotes]    = useState(initialSecret?.notes ?? '')
  const [reveal,   setReveal]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  async function copy(text: string) {
    if (!text) return
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard blocked */ }
  }

  async function generate() {
    // 16-char password from a sane alphabet.  Skip ambiguous chars.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
    const arr = new Uint32Array(16)
    crypto.getRandomValues(arr)
    let out = ''
    for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length]
    setPassword(out)
    setReveal(true)
  }

  async function submit() {
    setErr(null)
    if (!name.trim()) { setErr('Name is required.'); return }
    try {
      await onSubmit({
        name: name.trim(),
        url:  url.trim() || null,
        secret: { ...EMPTY, username, password, notes },
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!busy) onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <h2 className="mb-4 text-base font-semibold">{entry ? 'Edit entry' : 'New entry'}</h2>

        <div className="space-y-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Netflix"
              disabled={!canEdit}
              className={inputCls}
            />
          </Field>
          <Field label="URL (optional)">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://netflix.com"
              disabled={!canEdit}
              className={inputCls}
            />
          </Field>
          <Field label="Username / email">
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!canEdit}
                className={inputCls}
              />
              <CopyBtn onClick={() => copy(username)} disabled={!username} />
            </div>
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <input
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!canEdit}
                className={`${inputCls} ${reveal ? '' : 'tracking-widest'}`}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide' : 'Reveal'}
                className="rounded-lg border border-border bg-card px-2.5 text-xs hover:bg-muted"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
              <CopyBtn onClick={() => copy(password)} disabled={!password} />
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={generate}
                className="mt-1 text-[11px] text-primary hover:underline"
              >
                Generate strong password
              </button>
            )}
          </Field>
          <Field label="Notes">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              className={`${inputCls} resize-none`}
              placeholder="Optional"
            />
          </Field>
        </div>

        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {entry && onDelete ? (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => { await onDelete() }}
                  disabled={busy}
                  className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                disabled={busy}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            )
          ) : <span />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={submit}
                disabled={busy || !name.trim()}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CopyBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      disabled={disabled}
      aria-label="Copy"
      className="rounded-lg border border-border bg-card px-2.5 text-xs hover:bg-muted disabled:opacity-50"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const inputCls = 'min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring disabled:opacity-70'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
