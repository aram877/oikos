'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MonthlySummary, TransactionListRow } from '@/db/types'
import { useTransactionList } from './_hooks/useTransactionList'
import { useAutoCategorize } from './_hooks/useAutoCategorize'
import { TxItem } from './_components/TxItem'
import { FilterBar } from './_components/FilterBar'
import { formatMonthLabel } from './_utils/month'
import { formatEur } from './_utils/currency'
import { ErrorBox } from '@/components/ErrorBox'
import { StatusMsg } from '@/components/StatusMsg'

export default function TransactionsPage() {
  const {
    dbStatus,
    dbError,
    monthKey,
    transactions,
    listStatus,
    listError,
    isCurrentMonth,
    categories,
    signFilter,
    setSignFilter,
    selectedCategoryIds,
    setSelectedCategoryIds,
    transferTransactions,
    filteredTransactions,
    filteredSummary,
    hasActiveFilter,
    clearFilters,
    goToPrevMonth,
    goToNextMonth,
    reload,
  } = useTransactionList()

  const loaded = dbStatus === 'ready' && listStatus === 'loaded'

  const { categorizeStatus, currentIndex, totalCount, categorizedCount, startCategorize, dismissResult } =
    useAutoCategorize(transactions, reload)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        {/* Row 1: title + primary actions (always visible) */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Transactions</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/transactions/new"
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              + Add
            </Link>
            <Link
              href="/settings"
              className="rounded px-2 py-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              aria-label="Settings"
              title="Settings"
            >
              ⚙
            </Link>
          </div>
        </div>

        {/* Row 2: secondary actions — wrap on mobile */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {loaded && (
            <button
              onClick={startCategorize}
              disabled={categorizeStatus === 'running'}
              className="rounded border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Auto-categorize
            </button>
          )}
          <Link
            href="/analyst"
            className="rounded border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Analyst
          </Link>
          <Link
            href="/import"
            className="rounded border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Import CSV
          </Link>
        </div>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={goToPrevMonth}
          className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          aria-label="Previous month"
        >
          ← Prev
        </button>
        <h2 className="text-base font-medium">{formatMonthLabel(monthKey)}</h2>
        <button
          onClick={goToNextMonth}
          disabled={isCurrentMonth}
          className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
          aria-label="Next month"
        >
          Next →
        </button>
      </div>

      {/* Filter bar — only when loaded */}
      {loaded && (
        <FilterBar
          signFilter={signFilter}
          onSignFilterChange={setSignFilter}
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          onCategorySelectionChange={setSelectedCategoryIds}
          hasActiveFilter={hasActiveFilter}
          onClear={clearFilters}
        />
      )}

      {/* Summary bar */}
      {loaded && filteredSummary !== null && (
        <SummaryBar summary={filteredSummary} transfers={transferTransactions} />
      )}

      {/* Auto-categorize progress banner */}
      {categorizeStatus === 'running' && (
        <p className="mb-3 rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          Categorizing {currentIndex}/{totalCount}…
        </p>
      )}

      {/* Auto-categorize result banner */}
      {categorizeStatus === 'done' && (
        <div className="mb-3 flex items-center justify-between rounded bg-neutral-100 px-4 py-2 text-sm dark:bg-neutral-800">
          <span className="text-neutral-700 dark:text-neutral-300">
            Categorized {categorizedCount} of {totalCount}
          </span>
          <button
            onClick={dismissResult}
            className="ml-4 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* DB initialising */}
      {dbStatus === 'initializing' && <StatusMsg>Opening database…</StatusMsg>}

      {/* DB error */}
      {dbStatus === 'error' && (
        <ErrorBox
          message={dbError ?? 'Unknown error opening database.'}
          onRetry={() => window.location.reload()}
          retryLabel="Reload page"
        />
      )}

      {/* List loading */}
      {dbStatus === 'ready' && listStatus === 'loading' && <StatusMsg>Loading…</StatusMsg>}

      {/* List error */}
      {dbStatus === 'ready' && listStatus === 'error' && (
        <ErrorBox
          message={listError ?? 'Failed to load transactions.'}
          onRetry={reload}
          retryLabel="Retry"
        />
      )}

      {/* Empty state — no transactions in month */}
      {loaded && transactions.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-500">
          No transactions in {formatMonthLabel(monthKey)}.
        </p>
      )}

      {/* Empty state — transactions exist but filters hide them all */}
      {loaded && transactions.length > 0 && filteredTransactions.length === 0 && (
        <div className="py-16 text-center">
          <p className="mb-3 text-sm text-neutral-500">No transactions match the current filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Transaction list */}
      {loaded && filteredTransactions.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {filteredTransactions.map((tx) => (
            <TxItem key={tx.id} tx={tx} />
          ))}
        </ul>
      )}

    </div>
  )
}

function SummaryBar({
  summary,
  transfers,
}: {
  summary:   MonthlySummary
  transfers: TransactionListRow[]
}) {
  const [open, setOpen] = useState(false)

  const transferTotal = transfers.reduce((sum, tx) => sum + tx.amount_cents, 0)

  return (
    <div className="mb-4">
      {/* Totals row */}
      <div className="grid grid-cols-3 rounded-lg bg-neutral-50 px-4 py-3 text-center text-sm dark:bg-neutral-900">
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Income</div>
          <div className="font-medium text-green-600 dark:text-green-400">
            {formatEur(summary.total_income_cents)}
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Expenses</div>
          <div className="font-medium text-red-600 dark:text-red-400">
            {formatEur(summary.total_expense_cents)}
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Net</div>
          <div
            className={`font-semibold ${
              summary.net_cents >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatEur(summary.net_cents)}
          </div>
        </div>
      </div>

      {/* Transfers collapsible */}
      {transfers.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 dark:hover:bg-neutral-900 dark:hover:text-neutral-300"
          >
            <span>
              {transfers.length} transfer{transfers.length !== 1 ? 's' : ''} excluded
              {' · '}
              <span className="tabular-nums">{formatEur(transferTotal)}</span>
            </span>
            <span>{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <ul className="mt-1 divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {transfers.map(tx => (
                <li key={tx.id}>
                  <Link
                    href={`/transactions/${tx.id}`}
                    prefetch={false}
                    className="flex items-center gap-4 px-3 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <span className="w-24 shrink-0 tabular-nums text-neutral-400">{tx.date}</span>
                    <span className="min-w-0 flex-1 truncate text-neutral-500">{tx.description}</span>
                    <span className="tabular-nums text-neutral-500">{formatEur(tx.amount_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
