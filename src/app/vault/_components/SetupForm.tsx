'use client'

import { useState } from 'react'

interface Props {
  isAdmin: boolean
  onSetup: (passphrase: string) => Promise<void>
}

export function SetupForm({ isAdmin, onSetup }: Props) {
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [acknowledge, setAcknowledge] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <LockIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-base font-semibold">Vault not set up</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The household admin needs to set up the password vault first.
        </p>
      </div>
    )
  }

  async function submit() {
    setErr(null)
    if (pass1.length < 8) { setErr('Passphrase must be at least 8 characters.'); return }
    if (pass1 !== pass2)  { setErr('Passphrases don’t match.'); return }
    if (!acknowledge)     { setErr('Please confirm the warning before continuing.'); return }
    setBusy(true)
    try {
      await onSetup(pass1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <ShieldIcon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Set up the household vault</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose a master passphrase that all household members will use to unlock
        shared passwords.  This passphrase encrypts every entry on your device
        before it leaves &mdash; the server never sees it.
      </p>

      <div className="mt-5 space-y-3">
        <Field label="Master passphrase">
          <input
            autoFocus
            type="password"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
            className={inputCls}
            placeholder="At least 8 characters"
          />
        </Field>
        <Field label="Confirm passphrase">
          <input
            type="password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            className={inputCls}
          />
        </Field>

        <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-300">
          <input
            type="checkbox"
            checked={acknowledge}
            onChange={(e) => setAcknowledge(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            <strong>Important:</strong> if every member forgets the passphrase,
            the vault contents are lost forever.  There is no recovery.
          </span>
        </label>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Setting up…' : 'Create vault'}
        </button>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 1.5a.75.75 0 0 1 .26.046l8.25 3a.75.75 0 0 1 .49.704V12c0 4.91-3.146 9.187-7.853 10.7a.75.75 0 0 1-.494 0C7.946 21.187 4.8 16.91 4.8 12V5.25a.75.75 0 0 1 .49-.704l8.25-3A.75.75 0 0 1 12 1.5Zm3.78 9.78a.75.75 0 1 0-1.06-1.06l-4.97 4.97-1.97-1.97a.75.75 0 1 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l5.5-5.5Z" clipRule="evenodd" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 1.5a4.5 4.5 0 0 0-4.5 4.5v3h-1.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-1.5V6A4.5 4.5 0 0 0 12 1.5Zm-3 4.5a3 3 0 0 1 6 0v3H9V6Z" clipRule="evenodd" />
    </svg>
  )
}
