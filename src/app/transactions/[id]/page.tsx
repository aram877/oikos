'use client'

import { use } from 'react'
import Link from 'next/link'
import { useEditTransaction } from '../_hooks/useEditTransaction'
import { TransactionForm } from '../_components/TransactionForm'
import { ReceiptsSection } from '../_components/ReceiptsSection'
import { ErrorBox } from '@/components/ErrorBox'
import { useAbilities } from '@/hooks/useAbilities'

export default function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const {
    pageStatus,
    initError,
    txMonthKey,
    accounts,
    categories,
    date,
    setDate,
    description,
    setDescription,
    amountStr,
    setAmountStr,
    sign,
    setSign,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    originalCategoryId,
    matchCount,
    applyToAll,
    setApplyToAll,
    isTransfer,
    setIsTransfer,
    notes,
    setNotes,
    submitStatus,
    submitError,
    deleteStep,
    busy,
    handleSave,
    handleDeleteConfirm,
    startDelete,
    cancelDelete,
  } = useEditTransaction(id)

  const { can } = useAbilities()
  const backHref = txMonthKey ? `/transactions?month=${txMonthKey}` : '/transactions'

  if (pageStatus === 'initializing') {
    return (
      <Shell backHref={backHref}>
        <p className="py-12 text-center text-sm text-neutral-500">Loading…</p>
      </Shell>
    )
  }

  if (pageStatus === 'not-found') {
    return (
      <Shell backHref={backHref}>
        <p className="py-12 text-center text-sm text-neutral-500">Transaction not found.</p>
        <div className="text-center">
          <Link href={backHref} className="text-sm text-neutral-500 underline">
            Back to transactions
          </Link>
        </div>
      </Shell>
    )
  }

  if (pageStatus === 'error') {
    return (
      <Shell backHref={backHref}>
        <ErrorBox
          message={initError ?? 'Failed to load transaction.'}
          onRetry={() => window.location.reload()}
          retryLabel="Reload page"
        />
      </Shell>
    )
  }

  return (
    <Shell backHref={backHref}>

      <TransactionForm
        accounts={accounts}
        categories={categories}
        date={date}
        description={description}
        amountStr={amountStr}
        sign={sign}
        accountId={accountId}
        categoryId={categoryId}
        isTransfer={isTransfer}
        notes={notes}
        busy={busy}
        submitError={submitError}
        submitLabel={submitStatus === 'submitting' ? 'Saving…' : 'Save changes'}
        onDateChange={setDate}
        onDescriptionChange={setDescription}
        onAmountStrChange={setAmountStr}
        onSignChange={setSign}
        onAccountIdChange={setAccountId}
        onCategoryIdChange={setCategoryId}
        onIsTransferChange={setIsTransfer}
        onNotesChange={setNotes}
        onSubmit={handleSave}
        cancelHref={backHref}
        categoryChanged={categoryId !== originalCategoryId}
        matchCount={matchCount}
        applyToAll={applyToAll}
        onApplyToAllChange={setApplyToAll}
      />

      <ReceiptsSection transactionId={id} canEdit={can('finance', 'write')} />

      {/* Delete (2-step) — visually separated from the save form */}
      <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        {deleteStep === 'idle' && (
          <button
            type="button"
            onClick={startDelete}
            disabled={busy}
            className="text-sm text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
          >
            Delete transaction
          </button>
        )}

        {deleteStep === 'confirm' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Delete this transaction? This cannot be undone.
            </span>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={cancelDelete}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}

        {deleteStep === 'deleting' && (
          <span className="text-sm text-neutral-400">Deleting…</span>
        )}
      </div>

    </Shell>
  )
}

function Shell({ children, backHref }: { children: React.ReactNode; backHref: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={backHref}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          aria-label="Back to transactions"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold">Edit transaction</h1>
      </div>
      {children}
    </div>
  )
}
