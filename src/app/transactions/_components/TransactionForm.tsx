'use client'

import Link from 'next/link'
import type { AccountRow, CategoryRow } from '@/db/types'
import type { AmountSign } from '../_types'

interface TransactionFormProps {
  accounts: AccountRow[]
  categories: CategoryRow[]
  date: string
  description: string
  amountStr: string
  sign: AmountSign
  accountId: string
  categoryId: string
  busy: boolean
  submitError: string | null
  submitLabel: string
  onDateChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onAmountStrChange: (v: string) => void
  onSignChange: (v: AmountSign) => void
  onAccountIdChange: (v: string) => void
  onCategoryIdChange: (v: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  cancelHref?: string
  categoryChanged?: boolean
  matchCount?: number
  applyToAll?: boolean
  onApplyToAllChange?: (v: boolean) => void
}

export function TransactionForm({
  accounts,
  categories,
  date,
  description,
  amountStr,
  sign,
  accountId,
  categoryId,
  busy,
  submitError,
  submitLabel,
  onDateChange,
  onDescriptionChange,
  onAmountStrChange,
  onSignChange,
  onAccountIdChange,
  onCategoryIdChange,
  onSubmit,
  cancelHref = '/transactions',
  categoryChanged = false,
  matchCount = 0,
  applyToAll = false,
  onApplyToAllChange,
}: TransactionFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">

      {/* Date */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          required
          disabled={busy}
          className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {/* Description */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Description</span>
        <input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          required
          disabled={busy}
          className="rounded border border-neutral-200 px-3 py-2 text-sm placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {/* Amount + sign toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount (EUR)</span>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded border border-neutral-200 text-sm dark:border-neutral-700">
            <button
              type="button"
              onClick={() => onSignChange('expense')}
              disabled={busy}
              className={`px-3 py-2 font-medium transition-colors ${
                sign === 'expense'
                  ? 'bg-red-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              − Expense
            </button>
            <button
              type="button"
              onClick={() => onSignChange('income')}
              disabled={busy}
              className={`px-3 py-2 font-medium transition-colors ${
                sign === 'income'
                  ? 'bg-green-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              + Income
            </button>
          </div>
          <input
            type="number"
            value={amountStr}
            onChange={(e) => onAmountStrChange(e.target.value)}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            required
            disabled={busy}
            className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm tabular-nums placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Category</span>
          <select
            value={categoryId}
            onChange={(e) => onCategoryIdChange(e.target.value)}
            disabled={busy}
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {categoryChanged && matchCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => onApplyToAllChange?.(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded border-neutral-300 accent-neutral-900 dark:accent-neutral-100"
            />
            Apply to all {matchCount} matching transaction{matchCount !== 1 ? 's' : ''} this month
          </label>
        )}
      </div>

      {/* Account (hidden when only one — no meaningful choice) */}
      {accounts.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Account</span>
          <select
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            disabled={busy}
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}

      {/* Error */}
      {submitError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {submitError}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Cancel
        </Link>
      </div>

    </form>
  )
}
