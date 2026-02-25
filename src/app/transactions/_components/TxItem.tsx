import Link from 'next/link'
import type { TransactionListRow } from '@/db/types'
import { formatEur } from '../_utils/currency'

export function TxItem({ tx }: { tx: TransactionListRow }) {
  const isIncome = tx.amount_cents > 0
  return (
    <li>
      <Link
        href={`/transactions/${tx.id}`}
        prefetch={false}
        className="flex items-center gap-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 -mx-1 rounded px-1"
      >
        <span className="w-24 shrink-0 tabular-nums text-neutral-500">{tx.date}</span>
        <span className="min-w-0 flex-1 truncate">{tx.description}</span>
        {tx.category_name && (
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {tx.category_name}
          </span>
        )}
        <span
          className={`tabular-nums font-medium ${
            isIncome
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {formatEur(tx.amount_cents)}
        </span>
      </Link>
    </li>
  )
}
