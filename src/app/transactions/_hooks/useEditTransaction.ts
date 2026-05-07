import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dbClient } from '@/db/db.client'
import type { AccountRow, CategoryRow, TransactionRow } from '@/db/types'
import type { PageStatus, SubmitStatus, DeleteStep, AmountSign } from '../_types'
import { toCents, centsToForm } from '../_utils/currency'

export function useEditTransaction(id: string) {
  const router = useRouter()

  const [pageStatus, setPageStatus] = useState<PageStatus>('initializing')
  const [initError, setInitError] = useState<string | null>(null)
  const [tx, setTx] = useState<TransactionRow | null>(null)
  // The month the transaction originally belongs to — used for back navigation.
  const [txMonthKey, setTxMonthKey] = useState<string>('')
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const [date, setDate] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')
  const [sign, setSign] = useState<AmountSign>('expense')
  const [accountId, setAccountId] = useState<string>('')
  const [categoryId,         setCategoryId]         = useState<string>('')
  const [originalCategoryId, setOriginalCategoryId] = useState<string>('')
  const [matchCount,          setMatchCount]          = useState<number>(0)
  const [applyToAll,          setApplyToAll]          = useState<boolean>(false)
  const [isTransfer,          setIsTransfer]          = useState<boolean>(false)
  const [notes,               setNotes]               = useState<string>('')

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle')

  const busy = submitStatus === 'submitting' || submitStatus === 'done' || deleteStep === 'deleting'

  useEffect(() => {
    let cancelled = false
    dbClient
      .init()
      .then(() => Promise.all([
        dbClient.transactions.get(id),
        dbClient.accounts.list(),
        dbClient.categories.list(),
      ]))
      .then(([loaded, accs, cats]) => {
        if (cancelled) return
        if (!loaded) {
          setPageStatus('not-found')
          return
        }
        const { amountStr: a, sign: s } = centsToForm(loaded.amount_cents)
        setDate(loaded.date)
        setDescription(loaded.description)
        setAmountStr(a)
        setSign(s)
        setAccountId(loaded.account_id)
        setCategoryId(loaded.category_id ?? '')
        setOriginalCategoryId(loaded.category_id ?? '')
        setIsTransfer(loaded.is_transfer)
        setNotes(loaded.notes ?? '')
        setTx(loaded)
        // Fire-and-forget: non-critical — silently ignore errors
        dbClient.transactions
          .countSameDescriptionInMonth(loaded.description, loaded.date.slice(0, 7), id)
          .then(setMatchCount)
          .catch(() => {})
        setTxMonthKey(loaded.date.slice(0, 7))
        setAccounts(accs)
        setCategories(cats)
        setPageStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPageStatus('error')
        setInitError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [id])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    const cents = toCents(amountStr, sign)
    if (cents === null) {
      setSubmitError('Enter a positive amount (e.g. 12.50).')
      return
    }
    if (!description.trim()) {
      setSubmitError('Description cannot be empty.')
      return
    }
    if (!date) {
      setSubmitError('Select a date.')
      return
    }

    setSubmitStatus('submitting')
    try {
      await dbClient.transactions.update(id, {
        category_id:  categoryId || null,
        amount_cents: cents,
        date,
        description:  description.trim(),
        notes:        notes.trim() || null,
        is_transfer:  isTransfer,
      })
      if (applyToAll && matchCount > 0) {
        await dbClient.transactions.updateCategoryByDescriptionInMonth(
          description.trim(),
          date.slice(0, 7),
          categoryId || null,
          id,
        )
      }
      setSubmitStatus('done')
      router.push(`/transactions?month=${date.slice(0, 7)}`)
    } catch (err: unknown) {
      setSubmitStatus('idle')
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeleteConfirm() {
    setDeleteStep('deleting')
    try {
      await dbClient.transactions.softDelete(id)
      router.push(`/transactions?month=${txMonthKey}`)
    } catch (err: unknown) {
      setDeleteStep('confirm')
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
    tx,
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
    startDelete: () => setDeleteStep('confirm'),
    cancelDelete: () => setDeleteStep('idle'),
  }
}
