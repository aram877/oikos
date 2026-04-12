'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useYearly } from './_hooks/useYearly'
import { useAutoCategorize } from '@/app/transactions/_hooks/useAutoCategorize'
import { useAbilities } from '@/hooks/useAbilities'
import { useAccountBalance } from '@/hooks/useAccountBalance'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Formatter ─────────────────────────────────────────────────────────────── //

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function formatEur(cents: number) { return eurFmt.format(cents / 100) }

// ── Page ──────────────────────────────────────────────────────────────────── //

export default function YearlyPage() {
  const router = useRouter()
  const { year, currentYear, status, error, summary, load, goToYear } = useYearly()
  const { can, loading: abilitiesLoading } = useAbilities()
  const { balance } = useAccountBalance()

  const {
    categorizeStatus,
    currentIndex,
    totalCount,
    categorizedCount,
    startCategorize,
    dismissResult,
  } = useAutoCategorize(null, () => load(year))

  useEffect(() => {
    document.title = 'Yearly Overview | Oikos'
    load(year)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Yearly Overview</h1>

        {(abilitiesLoading || can('ai', 'write')) && (
          <Button
            variant="outline"
            size="sm"
            onClick={startCategorize}
            disabled={abilitiesLoading || categorizeStatus === 'running'}
          >
            {categorizeStatus === 'running'
              ? `Categorizing ${currentIndex}/${totalCount}…`
              : 'Auto-categorize all'}
          </Button>
        )}
      </div>

      {/* Auto-categorize result banner */}
      {categorizeStatus === 'done' && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-muted px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Categorized {categorizedCount} of {totalCount} transactions
          </span>
          <button onClick={dismissResult} className="ml-4 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Net worth bar */}
      {balance && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-xs text-muted-foreground mb-1">Checking</div>
              <div className={`text-base font-semibold tabular-nums ${balance.balance_cents >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
                {formatEur(balance.balance_cents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-xs text-muted-foreground mb-1">Savings (est.)</div>
              <div className="text-base font-semibold tabular-nums text-foreground">
                {formatEur(-balance.transfers_cents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-xs text-muted-foreground mb-1">Net worth</div>
              <div className={`text-base font-bold tabular-nums ${balance.cashflow_cents >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatEur(balance.cashflow_cents)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Year navigation */}
      <div className="mb-6 flex items-center justify-center gap-4">
        <button
          onClick={() => goToYear(year - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Previous year"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="min-w-16 text-center text-lg font-semibold">{year}</span>
        <button
          onClick={() => goToYear(year + 1)}
          disabled={year >= currentYear}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next year"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="py-12 text-center text-sm text-red-500">{error}</p>
      )}

      {/* Summary table */}
      {status === 'loaded' && summary && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">Month</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">Income</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">Expenses</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {summary.months.map(m => (
                <tr
                  key={m.yearMonth}
                  onClick={() => router.push(`/transactions?month=${m.yearMonth}`)}
                  className={`cursor-pointer ${m.txCount === 0 ? 'opacity-35' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'}`}
                >
                  <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                    {m.label}
                    {m.txCount > 0 && (
                      <span className="ml-2 text-xs text-neutral-400">{m.txCount} tx</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">
                    {m.incomeCents > 0 ? formatEur(m.incomeCents) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                    {m.expenseCents < 0 ? formatEur(m.expenseCents) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    m.netCents >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {m.txCount > 0 ? formatEur(m.netCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
              <tr>
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-green-700 dark:text-green-400">
                  {formatEur(summary.totalIncome)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                  {formatEur(summary.totalExpense)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                  summary.totalNet >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatEur(summary.totalNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Analyst link */}
      {status === 'loaded' && (
        <div className="mt-4 text-center">
          <Link
            href="/analyst"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Deep analysis →
          </Link>
        </div>
      )}
    </div>
  )
}
