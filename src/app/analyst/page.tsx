"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAnalyst } from "./_hooks/useAnalyst";
import { StatusMsg } from "@/components/StatusMsg";
import { ErrorBox } from "@/components/ErrorBox";
import type {
  AnalystReport,
  CashFlowSummary,
  ExpenseBreakdownItem,
  FixedExpenseItem,
  VariableExpenseItem,
  RecurringItem,
  MerchantItem,
  AnomalyItem,
} from "@/lib/analyst";
// SubcategoryItem shape is accessed via ExpenseBreakdownItem['subcategories'][number]

// ── Shared formatter ──────────────────────────────────────────────────────── //

const eurFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
function formatEur(cents: number): string {
  return eurFmt.format(cents / 100);
}

// ── Card wrapper ──────────────────────────────────────────────────────────── //

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 mb-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Section A — Cash Flow ─────────────────────────────────────────────────── //

function CashFlowCard({ cf }: { cf: CashFlowSummary }) {
  const [open, setOpen] = useState(false)
  const transferTotal = cf.transfers.reduce((sum, tx) => sum + tx.amount_cents, 0)

  return (
    <Card title="Cash Flow Summary">
      <div className="grid grid-cols-3 text-center text-sm">
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Income</div>
          <div className="font-medium text-green-600 dark:text-green-400">
            {formatEur(cf.totalIncomeCents)}
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Expenses</div>
          <div className="font-medium text-red-600 dark:text-red-400">
            {formatEur(cf.totalExpenseCents)}
          </div>
        </div>
        <div>
          <div className="mb-0.5 text-xs text-neutral-500">Net</div>
          <div
            className={`font-semibold ${
              cf.netCents >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatEur(cf.netCents)}
          </div>
        </div>
      </div>

      {cf.transferCount > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 dark:hover:bg-neutral-900 dark:hover:text-neutral-300"
          >
            <span>
              {cf.transferCount} transfer{cf.transferCount !== 1 ? "s" : ""} excluded from income/expense totals
              {' · '}
              <span className="tabular-nums">{formatEur(transferTotal)}</span>
            </span>
            <span>{open ? '▲' : '▼'}</span>
          </button>

          {open && (
            <ul className="mt-1 divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {cf.transfers.map(tx => (
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

      {cf.transferCount === 0 && (
        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          No transfers in this period.
        </p>
      )}
    </Card>
  );
}

// ── Section B — Expense Breakdown ─────────────────────────────────────────── //

function ExpenseBreakdownCard({ items }: { items: ExpenseBreakdownItem[] }) {
  if (items.length === 0) {
    return (
      <Card title="Expense Breakdown">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          No expenses in this period.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Expense Breakdown">
      <table className="w-full text-sm">
        <tbody>
          {items.map((item, index) => (
            <React.Fragment key={item.category + index}>
              {/* Parent row */}
              <tr
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-1.5 pr-3 font-medium text-neutral-800 dark:text-neutral-200">
                  {item.category}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
                  {formatEur(item.totalCents)}
                </td>
                <td className="py-1.5 w-32">
                  <div className="relative h-2 rounded bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="absolute left-0 top-0 h-2 rounded bg-neutral-400 dark:bg-neutral-500"
                      style={{
                        width: `${Math.min(100, item.pct).toFixed(1)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-neutral-400">
                    {item.pct.toFixed(1)}%
                  </span>
                </td>
              </tr>
              {/* Subcategory rows */}
              {item.subcategories.map((sub) => (
                <tr
                  key={`${item.category}__${sub.name}`}
                  className="border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1 pr-3 pl-5 text-neutral-500 dark:text-neutral-400 before:mr-1.5 before:content-['↳']">
                    {sub.name}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                    {formatEur(sub.totalCents)}
                  </td>
                  <td />
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── Section C — Fixed vs Variable ─────────────────────────────────────────── //

function FixedVariableCard({
  fixed,
  variable,
  variableTotalCents,
}: {
  fixed: FixedExpenseItem[];
  variable: VariableExpenseItem[];
  variableTotalCents: number;
}) {
  const fixedTotal = fixed.reduce((s, f) => s + f.monthlyAvgCents, 0);
  return (
    <Card title="Fixed vs Variable Expenses">
      {/* Summary row */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1 rounded-lg bg-neutral-50 p-3 text-center dark:bg-neutral-900">
          <div className="text-xs text-neutral-500">Fixed (monthly avg)</div>
          <div className="mt-1 font-semibold text-neutral-800 dark:text-neutral-200">
            {formatEur(fixedTotal)}
          </div>
        </div>
        <div className="flex-1 rounded-lg bg-neutral-50 p-3 text-center dark:bg-neutral-900">
          <div className="text-xs text-neutral-500">
            Variable (period total)
          </div>
          <div className="mt-1 font-semibold text-neutral-800 dark:text-neutral-200">
            {formatEur(variableTotalCents)}
          </div>
        </div>
      </div>

      {/* Fixed list */}
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Fixed
      </div>
      {fixed.length === 0 ? (
        <p className="mb-4 text-sm text-neutral-400 dark:text-neutral-500">
          None detected.
        </p>
      ) : (
        <ul className="mb-4 space-y-1.5">
          {fixed.map((item) => (
            <li key={item.name} className="flex justify-between text-sm">
              <span className="truncate text-neutral-700 dark:text-neutral-300">
                {item.name}
              </span>
              <span className="ml-4 shrink-0 tabular-nums text-neutral-500">
                {formatEur(item.monthlyAvgCents)}/mo
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Variable list */}
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Variable
      </div>
      {variable.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          None detected.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {variable.map((item) => (
            <li key={item.name} className="flex justify-between text-sm">
              <span className="truncate text-neutral-700 dark:text-neutral-300">
                {item.name}
              </span>
              <span className="ml-4 shrink-0 tabular-nums text-neutral-500">
                {formatEur(item.totalCents)}
                <span className="ml-1 text-xs text-neutral-400">
                  ×{item.count}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Section D — Recurring Payments ───────────────────────────────────────── //

const FREQUENCY_LABEL: Record<RecurringItem["frequency"], string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

function RecurringCard({ items }: { items: RecurringItem[] }) {
  if (items.length === 0) {
    return (
      <Card title="Recurring Payments">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          No recurring payments detected.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Recurring Payments">
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {FREQUENCY_LABEL[item.frequency]}
              </span>
              <span className="truncate text-neutral-700 dark:text-neutral-300">
                {item.name}
              </span>
            </div>
            <div className="ml-4 shrink-0 text-right">
              <span className="tabular-nums text-neutral-700 dark:text-neutral-300">
                {formatEur(item.avgAmountCents)}
              </span>
              <span className="ml-2 text-xs text-neutral-400">
                next {item.nextExpectedDate}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Section E — Merchant Analysis ─────────────────────────────────────────── //

function MerchantCard({ items }: { items: MerchantItem[] }) {
  if (items.length === 0) {
    return (
      <Card title="Merchant Analysis">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          No merchant data.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Merchant Analysis">
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-neutral-400">
              {i + 1}.
            </span>
            <span className="flex-1 truncate text-neutral-700 dark:text-neutral-300">
              {item.name}
            </span>
            <span className="shrink-0 tabular-nums text-neutral-700 dark:text-neutral-300">
              {formatEur(item.totalCents)}
            </span>
            <span className="shrink-0 text-xs text-neutral-400">
              {item.txCount} tx
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Section F — Anomalies ─────────────────────────────────────────────────── //

function AnomaliesCard({ items }: { items: AnomalyItem[] }) {
  return (
    <Card title="Anomaly Detection">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          No anomalies detected.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.txId} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs text-neutral-400">{item.date} </span>
                  <span className="truncate text-neutral-700 dark:text-neutral-300">
                    {item.description}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums text-neutral-700 dark:text-neutral-300">
                  {formatEur(item.amountCents)}
                </span>
              </div>
              <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {item.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────── //

export default function AnalystPage() {
  const { status, error, report, generate } = useAnalyst();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Financial Analysis</h1>
          {report && (
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              {report.periodLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "loaded" && (
            <button
              onClick={generate}
              className="rounded border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Regenerate
            </button>
          )}
          <Link
            href="/transactions"
            className="rounded border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            ← Transactions
          </Link>
        </div>
      </div>

      {/* Idle — prompt to generate */}
      {status === "idle" && (
        <div className="py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Analyse the last 3 months of transactions.
          </p>
          <button
            onClick={generate}
            className="rounded bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Generate report
          </button>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && <StatusMsg>Analyzing…</StatusMsg>}

      {/* Error */}
      {status === "error" && (
        <ErrorBox
          message={error ?? "Failed to load analysis."}
          onRetry={generate}
          retryLabel="Try again"
        />
      )}

      {/* Report */}
      {status === "loaded" && report && <Report report={report} />}
    </div>
  );
}

function Report({ report }: { report: AnalystReport }) {
  if (
    report.cashFlow.totalIncomeCents === 0 &&
    report.cashFlow.totalExpenseCents === 0 &&
    report.cashFlow.transferCount === 0
  ) {
    return (
      <p className="py-16 text-center text-sm text-neutral-500">
        No data for this period.
      </p>
    );
  }
  return (
    <>
      <CashFlowCard cf={report.cashFlow} />
      <ExpenseBreakdownCard items={report.expenseBreakdown} />
      <FixedVariableCard
        fixed={report.fixedExpenses}
        variable={report.variableExpenses}
        variableTotalCents={report.variableTotalCents}
      />
      <RecurringCard items={report.recurringPayments} />
      <MerchantCard items={report.merchantAnalysis} />
      <AnomaliesCard items={report.anomalies} />
    </>
  );
}
