'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dbClient } from '@/db/db.client'
import { scanReceipt, ScanReceiptError } from '@/lib/scanReceipt'
import type { CategoryRow, AccountRow } from '@/db/types'

type Phase = 'pick' | 'scanning' | 'review' | 'saving'

interface Props {
  /** Pre-loaded categories so we don't refetch what the page already has. */
  categories: CategoryRow[]
  onClose:    () => void
  /** Called after a successful save so the parent can re-fetch the list. */
  onSaved?:   () => void
}

const ACCEPT = 'image/*,application/pdf'

export function ScanReceiptModal({ categories, onClose, onSaved }: Props) {
  const router = useRouter()
  const [phase,    setPhase]    = useState<Phase>('pick')
  const [error,    setError]    = useState<string | null>(null)
  const [file,     setFile]     = useState<File | null>(null)
  const [accounts, setAccounts] = useState<AccountRow[]>([])

  // Form state, populated from the AI extraction or filled in by the user.
  const [description, setDescription] = useState('')
  const [amountStr,   setAmountStr]   = useState('')
  const [date,        setDate]        = useState('')
  const [accountId,   setAccountId]   = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [attach,      setAttach]      = useState(true)

  // Load accounts once on mount.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const accs = await dbClient.accounts.list().catch(() => [])
      if (cancelled) return
      setAccounts(accs)
      if (accs.length > 0) setAccountId(accs[0].id)
    })()
    return () => { cancelled = true }
  }, [])

  const inputRef = useRef<HTMLInputElement>(null)

  // Derive (don't store) a preview URL — useMemo avoids the lint rule about
  // synchronous setState in an effect.  The URL is revoked on cleanup.
  const preview = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null
    return URL.createObjectURL(file)
  }, [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // Esc to close (ignored while a network request is in flight).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (phase === 'scanning' || phase === 'saving') return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  async function handlePick(picked: File) {
    setError(null)
    setFile(picked)
    setPhase('scanning')
    try {
      const { result } = await scanReceipt(picked)
      setDescription(result.merchant ?? '')
      setDate(result.date ?? new Date().toISOString().slice(0, 10))
      if (result.amount_cents != null) {
        setAmountStr((result.amount_cents / 100).toFixed(2))
      } else {
        setAmountStr('')
      }
      setPhase('review')
    } catch (err) {
      setError(err instanceof ScanReceiptError ? err.message : (err instanceof Error ? err.message : String(err)))
      setPhase('pick')
    }
  }

  async function handleSave() {
    setError(null)
    const cents = amountStr ? -Math.round(Number(amountStr.replace(',', '.')) * 100) : NaN
    if (!Number.isFinite(cents) || cents === 0) { setError('Enter a valid amount.'); return }
    if (!description.trim())                      { setError('Description is required.'); return }
    if (!date)                                    { setError('Date is required.'); return }
    if (!accountId)                               { setError('No account available.'); return }

    setPhase('saving')
    try {
      const tx = await dbClient.transactions.insert({
        account_id:  accountId,
        category_id: categoryId || null,
        amount_cents: cents,
        date,
        description: description.trim(),
        notes:       null,
        is_transfer: false,
      })
      if (attach && file) {
        try { await dbClient.receipts.insert(tx.id, file) } catch {
          // Non-fatal — the transaction is already saved.
        }
      }
      onSaved?.()
      onClose()
      router.push(`/transactions?month=${tx.date.slice(0, 7)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('review')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => { if (phase !== 'scanning' && phase !== 'saving') onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <SparkleIcon className="h-4 w-4 text-primary" />
            Scan receipt
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'scanning' || phase === 'saving'}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* ── PICK ───────────────────────────────────────────────────── */}
        {phase === 'pick' && (
          <>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files[0]) handlePick(e.dataTransfer.files[0])
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-foreground/40 hover:bg-muted/60"
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => e.target.files?.[0] && handlePick(e.target.files[0])}
                className="sr-only"
              />
              <CameraIcon className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Drop or pick a receipt</p>
              <p className="text-xs text-muted-foreground">JPG / PNG / WEBP / PDF · up to 10 MB</p>
            </label>
            <p className="mt-3 text-[11px] text-muted-foreground">
              We&apos;ll send the image to Claude to extract the merchant, amount, and date.
              You&apos;ll get a chance to review before saving.
            </p>
          </>
        )}

        {/* ── SCANNING ───────────────────────────────────────────────── */}
        {phase === 'scanning' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-sm font-medium">Reading receipt…</p>
            <p className="text-[11px] text-muted-foreground">Sending to Claude.</p>
          </div>
        )}

        {/* ── REVIEW ─────────────────────────────────────────────────── */}
        {(phase === 'review' || phase === 'saving') && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
              {preview && (
                <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Receipt preview" className="aspect-square w-full object-cover" />
                </div>
              )}

              <div className="space-y-3">
                <Field label="Merchant / description">
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (€)">
                    <input
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      inputMode="decimal"
                      placeholder="12.50"
                      className={`${inputCls} tabular-nums`}
                    />
                  </Field>
                  <Field label="Date">
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                      <option value="">— None —</option>
                      {categories.filter((c) => !c.deleted_at).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Account">
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={attach}
                    onChange={(e) => setAttach(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Attach the original file as a receipt
                </label>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'saving'}
                className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={phase === 'saving'}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {phase === 'saving' ? 'Saving…' : 'Save transaction'}
              </button>
            </div>
          </>
        )}

        {/* ── PICK error fallback ────────────────────────────────────── */}
        {phase === 'pick' && error && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576L2.044 12.72a.75.75 0 0 1 0-1.442l2.846-.813a3.75 3.75 0 0 0 2.576-2.576l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036a2.625 2.625 0 0 0 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258a2.625 2.625 0 0 0-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5Z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  )
}
