'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSubscriptionSuggestions } from '../_hooks/useSubscriptionSuggestions'
import { Money } from '@/lib/privacy'
import type { SubscriptionSuggestion } from '@/lib/subscriptionDetector'

const CADENCE_LABEL: Record<SubscriptionSuggestion['cadence'], string> = {
  weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
}

export default function DiscoverPage() {
  useEffect(() => { document.title = 'Discover subscriptions | Oikos' }, [])
  const { items, status, error, track, dismiss } = useSubscriptionSuggestions()
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/subscriptions" aria-label="Back" className="text-sm text-muted-foreground hover:text-foreground">←</Link>
        <h1 className="text-xl font-semibold">Discover subscriptions</h1>
      </div>

      <p className="mb-5 text-sm text-muted-foreground">
        We scanned the last 12 months of transactions for recurring patterns. Track the ones you want to monitor;
        dismiss the rest and they won&apos;t come back.
      </p>

      {status === 'loading' && <SkeletonList />}
      {status === 'error' && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {status === 'loaded' && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nothing new to suggest</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Either you&apos;re tracking everything, or there&apos;s no clear recurring pattern in the last 12 months.
          </p>
        </div>
      )}

      {status === 'loaded' && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((s) => (
            <SuggestionCard
              key={s.fingerprint}
              suggestion={s}
              onTrack={async (overrides) => {
                const id = await track(s, overrides)
                router.push(`/subscriptions/${id}`)
              }}
              onDismiss={() => dismiss(s).catch(() => {})}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────── //

function SuggestionCard({
  suggestion: s, onTrack, onDismiss,
}: {
  suggestion: SubscriptionSuggestion
  onTrack:    (overrides?: { name?: string }) => Promise<void>
  onDismiss:  () => void
}) {
  const [name,    setName]    = useState(s.suggestedName)
  const [busy,    setBusy]    = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function handleTrack() {
    setBusy(true)
    try { await onTrack({ name }) } finally { setBusy(false) }
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-base font-semibold leading-tight focus:outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              {CADENCE_LABEL[s.cadence]}
            </span>
            <span>
              <Money cents={s.amountCents} className="font-medium text-foreground" /> per charge
            </span>
            <span>{s.chargeCount} charge{s.chargeCount === 1 ? '' : 's'}</span>
            <span>last seen {s.lastSeen}</span>
            <span>≈ {s.intervalDaysMedian.toFixed(0)} days apart</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => { setConfirm(false); onDismiss() }}
                className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70"
              >
                Confirm dismiss
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleTrack}
                disabled={!name.trim() || busy}
                className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Tracking…' : 'Track this'}
              </button>
            </>
          )}
        </div>
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
          See {s.transactions.length} matching transaction{s.transactions.length === 1 ? '' : 's'}
        </summary>
        <ul className="mt-2 divide-y divide-border rounded-lg bg-muted/30">
          {s.transactions.slice().reverse().slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-1.5 text-[11px]">
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{t.date}</span>
              <span className="min-w-0 flex-1 truncate">{t.description}</span>
              <Money cents={t.amount_cents} className="shrink-0 tabular-nums font-medium" />
            </li>
          ))}
          {s.transactions.length > 8 && (
            <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
              + {s.transactions.length - 8} earlier
            </li>
          )}
        </ul>
      </details>
    </li>
  )
}

function SkeletonList() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-2xl border border-border bg-card p-4">
          <div className="space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}
