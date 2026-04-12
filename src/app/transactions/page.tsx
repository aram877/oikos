"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MonthlySummary, TransactionListRow } from "@/db/types";
import { useTransactionList } from "./_hooks/useTransactionList";
import { useAutoCategorize } from "./_hooks/useAutoCategorize";
import { TxItem } from "./_components/TxItem";
import { FilterBar } from "./_components/FilterBar";
import { formatMonthLabel } from "./_utils/month";
import { formatEur } from "./_utils/currency";
import { ErrorBox } from "@/components/ErrorBox";
import { StatusMsg } from "@/components/StatusMsg";
import { useAbilities } from "@/hooks/useAbilities";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  } = useTransactionList();

  const { can, loading: abilitiesLoading } = useAbilities();

  useEffect(() => { document.title = 'Transactions | Oikos' }, [])

  const loaded = dbStatus === "ready" && listStatus === "loaded";

  const {
    categorizeStatus,
    currentIndex,
    totalCount,
    categorizedCount,
    startCategorize,
    dismissResult,
  } = useAutoCategorize(transactions, reload);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/yearly" className="hover:text-foreground transition-colors">Yearly</Link>
          <span>/</span>
          <span className="text-foreground">{formatMonthLabel(monthKey)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Transactions</h1>
          <div className="flex items-center gap-2">
            <Link href="/transactions/new" className={cn(buttonVariants({ size: 'sm' }))}>
              + Add
            </Link>
            <Link
              href="/settings"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Settings"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Secondary actions */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(abilitiesLoading || can("ai", "write")) && (
            <Button
              variant="outline"
              size="sm"
              onClick={startCategorize}
              disabled={abilitiesLoading || categorizeStatus === "running"}
            >
              Auto-categorize
            </Button>
          )}
          <Link href="/analyst" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Analyst
          </Link>
          <Link href="/import" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Import CSV
          </Link>
        </div>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-center gap-4">
        <button
          onClick={goToPrevMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <h2 className="min-w-36 text-center text-base font-medium">{formatMonthLabel(monthKey)}</h2>
        <button
          onClick={goToNextMonth}
          disabled={isCurrentMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Filter bar */}
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

      {/* Summary cards */}
      {loaded && filteredSummary !== null && (
        <SummaryBar
          summary={filteredSummary}
          transfers={transferTransactions}
        />
      )}

      {/* Auto-categorize progress banner */}
      {categorizeStatus === "running" && (
        <p className="mb-3 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
          Categorizing {currentIndex}/{totalCount}…
        </p>
      )}

      {/* Auto-categorize result banner */}
      {categorizeStatus === "done" && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-muted px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Categorized {categorizedCount} of {totalCount}
          </span>
          <button
            onClick={dismissResult}
            className="ml-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* DB initialising */}
      {dbStatus === "initializing" && <StatusMsg>Opening database…</StatusMsg>}

      {/* DB error */}
      {dbStatus === "error" && (
        <ErrorBox
          message={dbError ?? "Unknown error opening database."}
          onRetry={() => window.location.reload()}
          retryLabel="Reload page"
        />
      )}

      {/* List loading */}
      {dbStatus === "ready" && listStatus === "loading" && (
        <StatusMsg>Loading…</StatusMsg>
      )}

      {/* List error */}
      {dbStatus === "ready" && listStatus === "error" && (
        <ErrorBox
          message={listError ?? "Failed to load transactions."}
          onRetry={reload}
          retryLabel="Retry"
        />
      )}

      {/* Empty state — no transactions in month */}
      {loaded && transactions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-muted-foreground/30">
            <path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
            <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" />
            <path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" />
          </svg>
          <p className="text-sm text-muted-foreground">
            No transactions in {formatMonthLabel(monthKey)}.
          </p>
          <Link href="/transactions/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Add your first one →
          </Link>
        </div>
      )}

      {/* Empty state — filters hide everything */}
      {loaded && transactions.length > 0 && filteredTransactions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions match the current filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Transaction list */}
      {loaded && filteredTransactions.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filteredTransactions.map((tx) => (
                <TxItem key={tx.id} tx={tx} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryBar({
  summary,
  transfers,
}: {
  summary: MonthlySummary;
  transfers: TransactionListRow[];
}) {
  const [open, setOpen] = useState(false);

  const transferTotal = transfers.reduce((sum, tx) => sum + tx.amount_cents, 0);

  return (
    <div className="mb-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Income</div>
            <div className="text-base font-semibold text-green-700 dark:text-green-400 tabular-nums">
              {formatEur(summary.total_income_cents)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Expenses</div>
            <div className="text-base font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {formatEur(summary.total_expense_cents)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Net</div>
            <div
              className={`text-base font-bold tabular-nums ${
                summary.net_cents >= 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatEur(summary.net_cents)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transfers collapsible */}
      {transfers.length > 0 && (
        <div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <span>
              {transfers.length} transfer{transfers.length !== 1 ? "s" : ""}{" "}
              excluded
              {" · "}
              <span className="tabular-nums">{formatEur(transferTotal)}</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>

          {open && (
            <Card className="mt-1">
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {transfers.map((tx) => (
                    <li key={tx.id}>
                      <Link
                        href={`/transactions/${tx.id}`}
                        prefetch={false}
                        className="flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                      >
                        <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                          {tx.date}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {tx.description}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatEur(tx.amount_cents)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
