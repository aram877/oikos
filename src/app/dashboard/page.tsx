'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type { TransactionListRow } from '@/db/types'
import { formatEur } from '@/app/transactions/_utils/currency'

// ── Helpers ───────────────────────────────────────────────────────────────── //

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

// ── Page ─────────────────────────────────────────────────────────────────── //

export default function DashboardPage() {
  const [monthKey,     setMonthKey]     = useState(currentMonthKey)
  const [transactions, setTransactions] = useState<TransactionListRow[]>([])
  const [status,       setStatus]       = useState<'loading' | 'loaded' | 'error'>('loading')

  const load = useCallback(async (mk: string) => {
    setStatus('loading')
    try {
      const rows = await dbClient.transactions.listByMonth(mk)
      setTransactions(rows)
      setStatus('loaded')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => { load(monthKey) }, [monthKey, load])

  // ── Compute summary ───────────────────────────────────────────────────── //
  const summary = useMemo(() => {
    let income = 0, expense = 0, saved = 0
    for (const tx of transactions) {
      if (tx.is_transfer) {
        if (tx.amount_cents < 0) saved += -tx.amount_cents
      } else if (tx.amount_cents > 0) {
        income += tx.amount_cents
      } else {
        expense += -tx.amount_cents  // store as positive
      }
    }
    return { income, expense, saved, net: income - expense }
  }, [transactions])

  // ── Top spending categories ───────────────────────────────────────────── //
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.is_transfer || tx.amount_cents >= 0) continue
      const name = tx.parent_category_name ?? tx.category_name ?? 'Uncategorized'
      map.set(name, (map.get(name) ?? 0) + (-tx.amount_cents))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)
  }, [transactions])

  const maxSpend = categoryBreakdown[0]?.[1] ?? 1

  // ── Render ───────────────────────────────────────────────────────────── //
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Overview</h1>
        <button
          onClick={() => setMonthKey(k => shiftMonth(k, -1))}
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium">{formatMonthLabel(monthKey)}</span>
        <button
          onClick={() => setMonthKey(k => shiftMonth(k, +1))}
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Next →
        </button>
      </div>

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-neutral-400">Loading…</p>
      )}

      {status === 'error' && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Failed to load transactions.
        </p>
      )}

      {status === 'loaded' && (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Income"   value={summary.income}   display="positive" color="green" />
            <SummaryCard label="Spending" value={summary.expense}  display="negative" color="red"   />
            <SummaryCard label="Saved"    value={summary.saved}    display="positive" color="blue"  />
            <SummaryCard label="Net"      value={summary.net}      display="signed"   color={summary.net >= 0 ? 'green' : 'red'} />
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <div>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Spending by category
              </h2>
              <div className="space-y-3">
                {categoryBreakdown.map(([name, cents]) => (
                  <div key={name} className="flex items-center gap-2 sm:gap-3">
                    <span className="w-24 shrink-0 truncate text-sm sm:w-36">{name}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div
                        className="h-2 rounded-full bg-red-400 dark:bg-red-500 transition-all"
                        style={{ width: `${Math.round((cents / maxSpend) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right tabular-nums text-sm text-red-600 dark:text-red-400 sm:w-24">
                      {formatEur(-cents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transactions.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-400">
              No transactions for this month.
            </p>
          )}

          {/* Footer link */}
          <div className="mt-8 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Link
              href={`/transactions?month=${monthKey}`}
              className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              View all transactions →
            </Link>
          </div>
        </>
      )}

    </div>
  )
}

// ── SummaryCard ───────────────────────────────────────────────────────────── //

interface SummaryCardProps {
  label:   string
  value:   number
  display: 'positive' | 'negative' | 'signed'
  color:   'green' | 'red' | 'blue'
}

function SummaryCard({ label, value, display, color }: SummaryCardProps) {
  const colorClass = {
    green: 'text-green-600 dark:text-green-400',
    red:   'text-red-600 dark:text-red-400',
    blue:  'text-blue-600 dark:text-blue-400',
  }[color]

  let prefix = ''
  let displayValue = Math.abs(value)
  if (display === 'negative') prefix = '−'
  if (display === 'signed')   prefix = value >= 0 ? '+' : '−'

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="mb-1 text-xs text-neutral-400">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${colorClass}`}>
        {prefix}{formatEur(displayValue)}
      </p>
    </div>
  )
}
