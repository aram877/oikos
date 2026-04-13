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

function computeSummary(txs: TransactionListRow[]) {
  let income = 0, expense = 0
  for (const tx of txs) {
    if (tx.is_transfer) continue
    if (tx.amount_cents > 0) income += tx.amount_cents
    else expense += -tx.amount_cents
  }
  return { income, expense, net: income - expense }
}

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null
  return ((current - prev) / prev) * 100
}

// Module-level cache — past months are immutable.
const dashboardCache = new Map<string, TransactionListRow[]>()

// ── Page ──────────────────────────────────────────────────────────────────── //

export default function DashboardPage() {
  const todayKey = currentMonthKey()
  const [monthKey,          setMonthKey]          = useState(todayKey)
  const [transactions,      setTransactions]      = useState<TransactionListRow[]>([])
  const [prevTransactions,  setPrevTransactions]  = useState<TransactionListRow[]>([])
  const [status,            setStatus]            = useState<'loading' | 'loaded' | 'error'>('loading')
  const [sparkData,         setSparkData]         = useState<{ key: string; expense: number }[]>([])

  // Load current + previous month together (prev is always a past month → cacheable)
  const load = useCallback(async (mk: string) => {
    const prevMk    = shiftMonth(mk, -1)
    const mkIsPast  = mk < currentMonthKey()
    const cachedMk  = mkIsPast ? dashboardCache.get(mk) : undefined
    const cachedPrev = dashboardCache.get(prevMk)

    if (cachedMk && cachedPrev) {
      setTransactions(cachedMk)
      setPrevTransactions(cachedPrev)
      setStatus('loaded')
      return
    }

    setStatus('loading')
    try {
      const [rows, prevRows] = await Promise.all([
        cachedMk   ?? dbClient.transactions.listByMonth(mk),
        cachedPrev ?? dbClient.transactions.listByMonth(prevMk),
      ])
      if (mkIsPast) dashboardCache.set(mk, rows)
      dashboardCache.set(prevMk, prevRows)
      setTransactions(rows)
      setPrevTransactions(prevRows)
      setStatus('loaded')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => { load(monthKey) }, [monthKey, load])

  // Load 6-month sparkline once on mount
  useEffect(() => {
    const now   = new Date()
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

    dbClient.transactions.listByDateRange(fmt(start), fmt(end))
      .then(txs => {
        const byMonth = new Map<string, number>()
        for (const tx of txs) {
          if (tx.is_transfer || tx.amount_cents >= 0) continue
          const mk = tx.date.slice(0, 7)
          byMonth.set(mk, (byMonth.get(mk) ?? 0) + (-tx.amount_cents))
        }
        const months: { key: string; expense: number }[] = []
        for (let i = 5; i >= 0; i--) {
          const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          months.push({ key, expense: byMonth.get(key) ?? 0 })
        }
        setSparkData(months)
      })
      .catch(() => {})
  }, [])

  // ── Derived values ────────────────────────────────────────────────────── //

  const summary     = useMemo(() => computeSummary(transactions),     [transactions])
  const prevSummary = useMemo(() => computeSummary(prevTransactions),  [prevTransactions])

  const savingsRate   = summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null
  const incomeDelta   = pctChange(summary.income,  prevSummary.income)
  const spendingDelta = pctChange(summary.expense, prevSummary.expense)

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.is_transfer || tx.amount_cents >= 0) continue
      const name = tx.parent_category_name ?? tx.category_name ?? 'Uncategorized'
      map.set(name, (map.get(name) ?? 0) + (-tx.amount_cents))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)
  }, [transactions])

  const maxSpend        = categoryBreakdown[0]?.[1] ?? 1
  const maxSparkExpense = Math.max(...sparkData.map(d => d.expense), 1)
  const isCurrentMonth  = monthKey >= currentMonthKey()

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
          disabled={isCurrentMonth}
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:invisible dark:hover:bg-neutral-800"
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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Income"
              value={summary.income}
              color="green"
              delta={incomeDelta}
              deltaGoodWhenPositive
            />
            <SummaryCard
              label="Spending"
              value={-summary.expense}
              color="red"
              delta={spendingDelta}
              deltaGoodWhenPositive={false}
            />
            <SummaryCard
              label="Net"
              value={summary.net}
              color={summary.net >= 0 ? 'green' : 'red'}
              signed
            />
            <RateCard rate={savingsRate} />
          </div>

          {/* 6-month spending sparkline */}
          {sparkData.length > 0 && sparkData.some(d => d.expense > 0) && (
            <div className="mb-8">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Spending — last 6 months
              </h2>
              <div className="flex items-end gap-1" style={{ height: '72px' }}>
                {sparkData.map(({ key, expense }) => {
                  const barH    = Math.max(2, Math.round((expense / maxSparkExpense) * 56))
                  const isActive = key === monthKey
                  const label   = new Date(key + '-01T00:00:00Z')
                    .toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
                  return (
                    <button
                      key={key}
                      onClick={() => { if (key <= currentMonthKey()) setMonthKey(key) }}
                      className="flex flex-1 flex-col items-center justify-end gap-1 h-full hover:opacity-75 transition-opacity"
                      title={`${formatMonthLabel(key)}: ${formatEur(expense)}`}
                    >
                      <div
                        className={`w-full rounded-t-sm transition-all ${
                          isActive
                            ? 'bg-red-500 dark:bg-red-400'
                            : 'bg-red-200 dark:bg-red-900'
                        }`}
                        style={{ height: `${barH}px` }}
                      />
                      <span className={`text-xs leading-none ${
                        isActive ? 'font-medium text-neutral-700 dark:text-neutral-200' : 'text-neutral-400'
                      }`}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
  label:                string
  value:                number
  color:                'green' | 'red'
  signed?:              boolean
  delta?:               number | null
  deltaGoodWhenPositive?: boolean
}

function SummaryCard({ label, value, color, signed, delta, deltaGoodWhenPositive }: SummaryCardProps) {
  const colorClass = color === 'green'
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  let deltaColor = 'text-neutral-400'
  if (delta !== null && delta !== undefined && isFinite(delta)) {
    const isGood = deltaGoodWhenPositive !== undefined
      ? (deltaGoodWhenPositive ? delta > 0 : delta < 0)
      : false
    deltaColor = isGood ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="mb-1 text-xs text-neutral-400">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${colorClass}`}>
        {signed && value > 0 ? '+' : ''}{formatEur(value)}
      </p>
      {delta !== null && delta !== undefined && isFinite(delta) && (
        <p className={`mt-0.5 text-xs tabular-nums ${deltaColor}`}>
          {delta > 0 ? '+' : ''}{Math.round(delta)}% vs prev
        </p>
      )}
    </div>
  )
}

// ── RateCard ──────────────────────────────────────────────────────────────── //

function RateCard({ rate }: { rate: number | null }) {
  const colorClass = rate === null
    ? 'text-neutral-400'
    : rate >= 20
      ? 'text-green-600 dark:text-green-400'
      : rate >= 0
        ? 'text-neutral-700 dark:text-neutral-300'
        : 'text-red-600 dark:text-red-400'

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="mb-1 text-xs text-neutral-400">Savings Rate</p>
      <p className={`text-base font-semibold tabular-nums ${colorClass}`}>
        {rate === null ? 'N/A' : `${rate > 0 ? '+' : ''}${rate}%`}
      </p>
    </div>
  )
}
