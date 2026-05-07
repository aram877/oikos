'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSubscriptionDetail } from '../_hooks/useSubscriptionDetail'
import { Money } from '@/lib/privacy'
import { dbClient } from '@/db/db.client'
import { matchSubscription } from '@/lib/subscriptionMatcher'
import type { CategoryRow, SubscriptionCadence, TransactionListRow, SubscriptionMatchPatternRow } from '@/db/types'

const CADENCE_OPTIONS: { value: SubscriptionCadence; label: string }[] = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'biweekly',  label: 'Biweekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

export default function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { sub, patterns, history, status, error, update, addPattern, removePattern, softDelete, reload }
    = useSubscriptionDetail(id)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  useEffect(() => { dbClient.categories.list().then(setCategories).catch(() => {}) }, [])
  useEffect(() => { document.title = sub ? `${sub.name} | Subscriptions` : 'Subscription | Oikos' }, [sub])

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [scanError,     setScanError]     = useState<string | null>(null)
  const [scanResult,    setScanResult]    = useState<{ matched: number; total: number } | null>(null)

  if (status === 'loading') {
    return <Shell><p className="py-12 text-center text-sm text-muted-foreground">Loading…</p></Shell>
  }
  if (status === 'not-found') {
    return <Shell><p className="py-12 text-center text-sm text-muted-foreground">Subscription not found.</p></Shell>
  }
  if (status === 'error' || !sub) {
    return <Shell><p className="text-sm text-destructive">{error ?? 'Failed to load.'}</p></Shell>
  }

  async function deleteAndLeave() {
    await softDelete()
    router.push('/subscriptions')
  }

  async function scanHistory() {
    if (!sub) return
    setScanError(null)
    setScanResult(null)
    try {
      // Pull the last 12 months of transactions and run the matcher locally
      // against THIS subscription's patterns only.  Simpler than a server-
      // side bulk operation and gives the user instant per-row preview.
      const end   = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      const txs = await dbClient.transactions.listByDateRange(
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
      )
      const candidates = txs.filter((t) => !t.is_transfer && t.subscription_id == null)
      const matchedIds: string[] = []
      for (const tx of candidates) {
        const hit = matchSubscription(patterns, { description: tx.description, amount_cents: tx.amount_cents })
        if (hit === sub.id) matchedIds.push(tx.id)
      }
      const linked = await dbClient.subscriptions.linkTransactionsBulk(matchedIds, sub.id)
      setScanResult({ matched: linked, total: candidates.length })
      await reload()
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/subscriptions" aria-label="Back" className="text-sm text-muted-foreground hover:text-foreground">←</Link>
        <h1 className="text-xl font-semibold">{sub.name}</h1>
        {sub.cancelled_on && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Cancelled</span>
        )}
      </div>

      {/* ── Form ───────────────────────────────────────────────────────── */}
      <Section title="Details">
        <DetailsForm
          sub={sub}
          categories={categories}
          onSave={update}
        />
      </Section>

      {/* ── Match patterns ─────────────────────────────────────────────── */}
      <Section
        title="Match patterns"
        sub="Patterns that link bank descriptions to this subscription. Add multiple patterns when the bank labels differ (e.g. one for NETFLIX.COM, one for APPLE.COM/BILL narrowed by amount)."
      >
        <PatternsEditor
          patterns={patterns}
          onAdd={addPattern}
          onDelete={removePattern}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={scanHistory}
            disabled={patterns.length === 0}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Apply patterns to past 12 months
          </button>
          {scanResult && (
            <span className="text-xs text-muted-foreground">
              Matched and linked {scanResult.matched} of {scanResult.total} candidates.
            </span>
          )}
          {scanError && <span className="text-xs text-destructive">{scanError}</span>}
        </div>
      </Section>

      {/* ── History ────────────────────────────────────────────────────── */}
      <Section title={`Linked transactions (${history.length})`}>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No transactions linked yet. Add a match pattern above and run &ldquo;Apply&rdquo; — or open a transaction and pick this subscription manually.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {history.map((tx) => <HistoryRow key={tx.id} tx={tx} />)}
          </ul>
        )}
      </Section>

      {/* ── Danger zone ────────────────────────────────────────────────── */}
      <Section title="Danger zone">
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-destructive hover:underline"
          >
            Delete subscription
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Delete this subscription? Linked transactions are kept; their link is cleared.</span>
            <button
              type="button"
              onClick={deleteAndLeave}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-sm text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </Section>
    </Shell>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────── //

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DetailsForm({
  sub, categories, onSave,
}: {
  sub:        ReturnType<typeof useSubscriptionDetail>['sub']
  categories: CategoryRow[]
  onSave:     ReturnType<typeof useSubscriptionDetail>['update']
}) {
  const [name,    setName]    = useState(sub?.name ?? '')
  const [vendor,  setVendor]  = useState(sub?.vendor ?? '')
  const [amount,  setAmount]  = useState(
    sub?.expected_amount_cents != null ? (Math.abs(sub.expected_amount_cents) / 100).toFixed(2) : '',
  )
  const [cadence, setCadence] = useState<SubscriptionCadence>(sub?.cadence ?? 'monthly')
  const [categoryId, setCategoryId] = useState<string | ''>(sub?.category_id ?? '')
  const [cancelled, setCancelled] = useState(sub?.cancelled_on ?? '')
  const [notes,   setNotes]   = useState(sub?.notes ?? '')
  const [busy,    setBusy]    = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFeedback(null)
    try {
      const cents = amount ? -Math.round(Number(amount.replace(',', '.')) * 100) : null
      await onSave({
        name:                  name.trim() || sub!.name,
        vendor:                vendor.trim() || null,
        category_id:           categoryId || null,
        expected_amount_cents: Number.isFinite(cents) ? cents : null,
        cadence,
        cancelled_on:          cancelled || null,
        notes:                 notes.trim() || null,
      })
      setFeedback('Saved')
      setTimeout(() => setFeedback(null), 1500)
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Vendor (optional)">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Netflix Inc" className={inputCls} />
        </Field>
        <Field label="Typical amount (€)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="15.99" className={inputCls} />
        </Field>
        <Field label="Cadence">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as SubscriptionCadence)} className={inputCls}>
            {CADENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {categories.filter((c) => !c.deleted_at).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Cancelled on (optional)">
          <input
            type="date"
            value={cancelled}
            onChange={(e) => setCancelled(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${inputCls} resize-none`}
          placeholder="Anything worth remembering"
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {feedback && <span className="text-xs text-muted-foreground">{feedback}</span>}
        <button type="button" onClick={save} disabled={busy} className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
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

function PatternsEditor({
  patterns, onAdd, onDelete,
}: {
  patterns: SubscriptionMatchPatternRow[]
  onAdd:    (input: { description_contains: string; amount_min_cents?: number | null; amount_max_cents?: number | null }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [desc, setDesc] = useState('')
  const [min,  setMin]  = useState('')
  const [max,  setMax]  = useState('')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState<string | null>(null)

  async function add() {
    if (!desc.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const minC = min ? Math.round(Number(min.replace(',', '.')) * 100) : null
      const maxC = max ? Math.round(Number(max.replace(',', '.')) * 100) : null
      await onAdd({
        description_contains: desc.trim(),
        amount_min_cents:     Number.isFinite(minC as number) ? minC : null,
        amount_max_cents:     Number.isFinite(maxC as number) ? maxC : null,
      })
      setDesc(''); setMin(''); setMax('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      {patterns.length > 0 && (
        <ul className="space-y-1.5">
          {patterns.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-card px-1.5 py-0.5 text-xs">{p.description_contains}</code>
                  {(p.amount_min_cents != null || p.amount_max_cents != null) && (
                    <span className="text-xs text-muted-foreground">
                      {p.amount_min_cents != null && `≥ €${(p.amount_min_cents / 100).toFixed(2)}`}
                      {p.amount_min_cents != null && p.amount_max_cents != null && '  ·  '}
                      {p.amount_max_cents != null && `≤ €${(p.amount_max_cents / 100).toFixed(2)}`}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                aria-label="Delete pattern"
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description contains (e.g. APPLE.COM/BILL)"
          className={inputCls}
        />
        <input
          value={min}
          onChange={(e) => setMin(e.target.value)}
          inputMode="decimal"
          placeholder="Min €"
          className={`${inputCls} sm:w-24`}
        />
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          inputMode="decimal"
          placeholder="Max €"
          className={`${inputCls} sm:w-24`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!desc.trim() || busy}
          className="rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <p className="text-[11px] text-muted-foreground">
        Substring is case-insensitive. Amount bounds compare against |amount| in euros — leave blank for &ldquo;any amount&rdquo;.
      </p>
    </div>
  )
}

function HistoryRow({ tx }: { tx: TransactionListRow }) {
  return (
    <li>
      <Link
        href={`/transactions/${tx.id}`}
        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors"
      >
        <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">{tx.date}</span>
        <span className="min-w-0 flex-1 truncate">{tx.description}</span>
        <Money cents={tx.amount_cents} className="shrink-0 tabular-nums font-medium" />
      </Link>
    </li>
  )
}
