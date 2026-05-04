import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/60 dark:bg-muted/40',
        className,
      )}
    />
  )
}

export function TransactionRowSkeleton() {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-20" />
    </li>
  )
}

export function SummaryCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-4">
          <Skeleton className="mb-2 h-3 w-12" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}
