'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSubscriptions } from './_hooks/useSubscriptions'
import { Money } from '@/lib/privacy'
import { dbClient } from '@/db/db.client'
import type { SubscriptionRow, SubscriptionCadence } from '@/db/types'

const CADENCE_OPTIONS: { value: SubscriptionCadence; label: string }[] = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'biweekly',  label: 'Biweekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
]

const CADENCE_PER_MONTH: Record<SubscriptionCadence, number> = {
  weekly:    52 / 12,
  biweekly:  26 / 12,
  monthly:   1,
  quarterly: 1 / 3,
  yearly:    1 / 12,
}

function monthlyCost(sub: SubscriptionRow): number {
  if (sub.expected_amount_cents == null) return 0
  return Math.abs(sub.expected_amount_cents) * CADENCE_PER_MONTH[sub.cadence]
}

export default function SubscriptionsPage() {
  useEffect(() => { document.title = 'Subscriptions | Oikos' }, [])

  const { items, spend, status, error, reload } = useSubscriptions()
  const [adding, setAdding] = useState(false)

  const active    = useMemo(() => items.filter((s) => !s.cancelled_on), [items])
  const cancelled = useMemo(() => items.filter((s) =>  s.cancelled_on), [items])

  const totalMonthly = useMemo(
    () => active.reduce((acc, s) => acc + monthlyCost(s), 0),
    [active],
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          + Add
        </button>
      </div>

      {status === 'loaded' && active.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-card px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Estimated monthly spend
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            <Money cents={Math.round(-totalMonthly)} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Across {active.length} active {active.length === 1 ? 'subscription' : 'subscriptions'}
          </div>
        </div>
      )}

      {status === 'loading' && <SkeletonList />}
      {status === 'error' && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {status === 'loaded' && (
        <>
          {active.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
              {active.map((s) => (
                <Row key={s.id} sub={s} chargeCount={spend[s.id]?.charge_count ?? 0} lastCharged={spend[s.id]?.last_charged_on ?? null} />
              ))}
            </ul>
          )}

          {cancelled.length > 0 && (
            <details className="mt-6 group">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Cancelled ({cancelled.length})
              </summary>
              <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden opacity-70">
                {cancelled.map((s) => (
                  <Row key={s.id} sub={s} chargeCount={spend[s.id]?.charge_count ?? 0} lastCharged={spend[s.id]?.last_charged_on ?? null} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onCreated={async () => { setAdding(false); await reload() }}
        />
      )}
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────── //

function Row({
  sub, chargeCount, lastCharged,
}: {
  sub:         SubscriptionRow
  chargeCount: number
  lastCharged: string | null
}) {
  const monthly = monthlyCost(sub)
  return (
    <li>
      <Link
        href={`/subscriptions/${sub.id}`}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{sub.name}</span>
            {sub.cancelled_on && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Cancelled
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {sub.cadence}
            {chargeCount > 0 && ` · ${chargeCount} charge${chargeCount === 1 ? '' : 's'} (30d)`}
            {lastCharged && ` · last ${lastCharged}`}
          </div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {sub.expected_amount_cents != null && (
            <Money cents={-Math.abs(sub.expected_amount_cents)} className="font-medium" />
          )}
          <div className="text-[11px] text-muted-foreground">
            ≈ <Money cents={Math.round(-monthly)} /> /mo
          </div>
        </div>
      </Link>
    </li>
  )
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">No subscriptions yet</p>
      <p className="text-xs text-muted-foreground">
        Track Netflix, Spotify, gym, insurance — anything that bills you on a schedule.
      </p>
    </div>
  )
}

// ── Add dialog (minimal — full editing is on the detail page) ──────────────── //

function AddDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name,    setName]    = useState('')
  const [amount,  setAmount]  = useState('')
  const [cadence, setCadence] = useState<SubscriptionCadence>('monthly')
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const cents = amount ? -Math.round(Number(amount.replace(',', '.')) * 100) : null
      await dbClient.subscriptions.insert({
        name:                  name.trim(),
        cadence,
        expected_amount_cents: Number.isFinite(cents) ? cents : null,
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">New subscription</h2>
        <div className="space-y-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Netflix"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Typical amount (€)" className="flex-1">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="15.99"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-ring"
              />
            </Field>
            <Field label="Cadence" className="flex-1">
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as SubscriptionCadence)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring"
              >
                {CADENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
