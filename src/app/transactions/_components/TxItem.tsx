import Link from "next/link";
import type { TransactionListRow } from "@/db/types";
import { formatEur } from "../_utils/currency";
import { Badge } from "@/components/ui/badge";

export function TxItem({ tx }: { tx: TransactionListRow }) {
  const isIncome = tx.amount_cents > 0;

  if (tx.is_transfer) {
    return (
      <li>
        <Link
          href={`/transactions/${tx.id}`}
          prefetch={false}
          className="flex items-center gap-4 px-4 py-3 text-xs lg:text-sm hover:bg-muted/60 transition-colors opacity-60"
        >
          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
            {tx.date}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {tx.description}
          </span>
          <Badge variant="secondary" className="shrink-0 text-xs">Transfer</Badge>
          <span className="tabular-nums font-medium text-muted-foreground">
            {formatEur(tx.amount_cents)}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/transactions/${tx.id}`}
        prefetch={false}
        className="flex items-start gap-2 lg:gap-4 px-4 py-3 text-xs hover:bg-muted/60 transition-colors lg:text-sm"
      >
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
          {tx.category_name && (
            <Badge variant="secondary" className="text-[10px] lg:text-xs shrink-0 self-start">
              {tx.category_name}
            </Badge>
          )}
        </div>
        <span
          className={`tabular-nums font-semibold shrink-0 ${
            isIncome
              ? "text-green-700 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatEur(tx.amount_cents)}
        </span>
      </Link>
    </li>
  );
}
