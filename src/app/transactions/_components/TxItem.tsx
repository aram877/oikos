'use client'

import Link from "next/link";
import type { TransactionListRow } from "@/db/types";
import { Money } from "@/lib/privacy";
import { Badge } from "@/components/ui/badge";

interface Props {
  tx:            TransactionListRow
  receiptCount?: number
  /** Selection state — when defined, the row renders a checkbox column. */
  selected?:     boolean
  onToggleSelect?: (id: string) => void
}

export function TxItem({ tx, receiptCount = 0, selected, onToggleSelect }: Props) {
  const isIncome = tx.amount_cents > 0;
  const showCheckbox = onToggleSelect != null;

  const checkbox = showCheckbox ? (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(tx.id) }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:border-foreground/40'
      }`}
      aria-label={selected ? 'Unselect transaction' : 'Select transaction'}
    >
      {selected && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0L2.22 9.78a.75.75 0 0 1 1.06-1.06l2.47 2.47 6.97-6.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  ) : null

  if (tx.is_transfer) {
    return (
      <li className={selected ? 'bg-primary/5' : ''}>
        <Link
          href={`/transactions/${tx.id}`}
          prefetch={false}
          className="flex items-center gap-3 lg:gap-4 px-4 py-3 text-xs lg:text-sm hover:bg-muted/60 transition-colors opacity-60"
        >
          {checkbox}
          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
            {tx.date}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {tx.description}
          </span>
          {receiptCount > 0 && <ReceiptBadge count={receiptCount} />}
          <Badge variant="secondary" className="shrink-0 text-xs">Transfer</Badge>
          <Money cents={tx.amount_cents} className="tabular-nums font-medium text-muted-foreground" />
        </Link>
      </li>
    );
  }

  return (
    <li className={selected ? 'bg-primary/5' : ''}>
      <Link
        href={`/transactions/${tx.id}`}
        prefetch={false}
        className="flex items-start gap-2 lg:gap-4 px-4 py-3 text-xs hover:bg-muted/60 transition-colors lg:text-sm"
      >
        {checkbox && <div className="pt-0.5">{checkbox}</div>}
        <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
          {tx.date}
        </span>
        <div className="flex flex-wrap justify-between gap-2 lg:gap-4 flex-1 min-w-0">
          <div className="min-w-0 flex flex-col gap-0.5">
            <span className="min-w-0 break-words sm:truncate text-foreground">{tx.description}</span>
            {tx.notes && (
              <span className="text-xs text-muted-foreground truncate">{tx.notes}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start">
            {receiptCount > 0 && <ReceiptBadge count={receiptCount} />}
            {tx.category_name && (
              <Badge variant="secondary" className="text-[10px] lg:text-xs">
                {tx.category_name}
              </Badge>
            )}
          </div>
        </div>
        <Money
          cents={tx.amount_cents}
          className={`tabular-nums font-semibold shrink-0 ${
            isIncome
              ? "text-green-700 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        />
      </Link>
    </li>
  );
}

function ReceiptBadge({ count }: { count: number }) {
  return (
    <span
      title={`${count} receipt${count === 1 ? '' : 's'} attached`}
      className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
        <path d="m21 11-9.04 9.06a4.5 4.5 0 1 1-6.36-6.37l9.06-9.06a3 3 0 1 1 4.24 4.24l-9.04 9.06a1.5 1.5 0 0 1-2.12-2.12l8.34-8.34" />
      </svg>
      {count > 1 && <span className="tabular-nums">{count}</span>}
    </span>
  );
}
