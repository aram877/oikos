import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dbClient } from '@/db/db.client'
import type { AccountRow, CategoryRow } from '@/db/types'
import type { PageStatus, SubmitStatus, AmountSign } from '../_types'
import { todayIso } from '../_utils/month'
import { toCents } from '../_utils/currency'

export function useNewTransaction() {
  const router = useRouter()

  const [pageStatus, setPageStatus] = useState<PageStatus>('initializing')
  const [initError, setInitError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const [date, setDate] = useState<string>(todayIso)
  const [description, setDescription] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')
  const [sign, setSign] = useState<AmountSign>('expense')
  const [accountId, setAccountId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    dbClient
      .init()
      .then(() => Promise.all([dbClient.accounts.list(), dbClient.categories.list()]))
      .then(([accs, cats]) => {
        if (cancelled) return
        setAccounts(accs)
        setCategories(cats)
        if (accs.length > 0) setAccountId(accs[0].id)
        setPageStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPageStatus('error')
        setInitError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    if (!accountId) {
      setSubmitError('No account available.')
      return
    }

    setSubmitStatus('submitting')
    try {
      await dbClient.transactions.insert({
        account_id: accountId,
        category_id: categoryId || null,
        amount_cents: cents,
        date,
        description: description.trim(),
        notes: null,
      })
      setSubmitStatus('done')
      router.push('/transactions')
    } catch (err: unknown) {
      setSubmitStatus('idle')
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
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
    submitStatus,
    submitError,
    handleSubmit,
  }
}
