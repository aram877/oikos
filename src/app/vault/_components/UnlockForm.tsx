'use client'

import { useState } from 'react'

interface Props {
  onUnlock: (passphrase: string) => Promise<boolean>
  error:    string | null
}

export function UnlockForm({ onUnlock, error }: Props) {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!pass) return
    setBusy(true)
    try {
      await onUnlock(pass)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <LockIcon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Unlock vault</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Enter the household master passphrase to decrypt shared passwords.
      </p>

      <div className="mt-5 space-y-3">
        <input
          autoFocus
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Master passphrase"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !pass}
          className="w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 1.5a4.5 4.5 0 0 0-4.5 4.5v3h-1.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-1.5V6A4.5 4.5 0 0 0 12 1.5Zm-3 4.5a3 3 0 0 1 6 0v3H9V6Z" clipRule="evenodd" />
    </svg>
  )
}
