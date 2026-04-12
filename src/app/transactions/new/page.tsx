'use client'

import Link from 'next/link'
import { useNewTransaction } from '../_hooks/useNewTransaction'
import { TransactionForm } from '../_components/TransactionForm'
import { ErrorBox } from '@/components/ErrorBox'

export default function NewTransactionPage() {
  const {
    pageStatus,
    initError,
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
    isTransfer,
    setIsTransfer,
    notes,
    setNotes,
    submitStatus,
    submitError,
    handleSubmit,
  } = useNewTransaction()

  if (pageStatus === 'initializing') {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <p className="py-12 text-center text-sm text-neutral-500">Opening database…</p>
      </div>
    )
  }

  if (pageStatus === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-6">
        <ErrorBox
          message={initError ?? 'Failed to open database.'}
          onRetry={() => window.location.reload()}
          retryLabel="Reload page"
        />
      </div>
    )
  }

  const busy = submitStatus === 'submitting' || submitStatus === 'done'

  return (
    <div className="mx-auto max-w-md px-4 py-6">

      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/transactions"
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          aria-label="Back to transactions"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold">Add transaction</h1>
      </div>

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
        submitLabel={submitStatus === 'submitting' ? 'Saving…' : 'Save transaction'}
        onDateChange={setDate}
        onDescriptionChange={setDescription}
        onAmountStrChange={setAmountStr}
        onSignChange={setSign}
        onAccountIdChange={setAccountId}
        onCategoryIdChange={setCategoryId}
        onIsTransferChange={setIsTransfer}
        onNotesChange={setNotes}
        onSubmit={handleSubmit}
      />

    </div>
  )
}
