import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CategoryRow, TransactionListRow, MonthlySummary } from '@/db/types'
import type { DbStatus, ListStatus } from '../_types'
import { currentMonthKey, prevMonthKey, nextMonthKey } from '../_utils/month'
import { generateDueRecurringTransactions } from '@/lib/recurring'

// Module-level cache — persists across React renders and route navigations.
// Past months are immutable so they can be cached indefinitely.
// The current month is never cached (transactions may have just been added).
type MonthCacheEntry = { transactions: TransactionListRow[]; summary: MonthlySummary }
const monthCache = new Map<string, MonthCacheEntry>()

export type SignFilter = 'all' | 'income' | 'expense'
export type SortKey = 'date' | 'description' | 'amount'
export type SortDir = 'asc' | 'desc'

const SESSION_KEY = 'tx_list_ui'

type SavedUiState = {
  signFilter:          SignFilter
  selectedCategoryIds: string[]
  sortKey:             SortKey
  sortDir:             SortDir
}

const DEFAULTS: SavedUiState = {
  signFilter: 'all',
  selectedCategoryIds: [],
  sortKey: 'date',
  sortDir: 'desc',
}

function readSession(): SavedUiState {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SavedUiState) : DEFAULTS
  } catch { return DEFAULTS }
}

function saveSession(state: SavedUiState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

export function useTransactionList() {
  const [dbStatus, setDbStatus] = useState<DbStatus>('initializing')
  const [dbError, setDbError] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey)

  // Initialize directly from sessionStorage so the first render already has the right values.
  const [signFilter,          setSignFilter]          = useState<SignFilter>(() => readSession().signFilter)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(() => new Set(readSession().selectedCategoryIds))
  const [sortKey,             setSortKey]             = useState<SortKey>(() => readSession().sortKey)
  const [sortDir,             setSortDir]             = useState<SortDir>(() => readSession().sortDir)

  // Restore month from ?month= URL param on mount.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('month')
    if (param && /^\d{4}-\d{2}$/.test(param)) setMonthKey(param)
  }, [])

  // Persist UI state to sessionStorage whenever it changes.
  useEffect(() => {
    saveSession({ signFilter, selectedCategoryIds: [...selectedCategoryIds], sortKey, sortDir })
  }, [signFilter, selectedCategoryIds, sortKey, sortDir])

  const [transactions, setTransactions] = useState<TransactionListRow[]>([])
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [listStatus, setListStatus] = useState<ListStatus>('idle')
  const [listError, setListError] = useState<string | null>(null)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [receiptCounts, setReceiptCounts] = useState<Record<string, number>>({})

  const isCurrentMonth = monthKey === currentMonthKey()

  useEffect(() => {
    let cancelled = false
    dbClient
      .init()
      .then(() => { if (!cancelled) setDbStatus('ready') })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDbStatus('error')
          setDbError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => { cancelled = true }
  }, [])

  // Load categories once when DB is ready (they don't change per month)
  useEffect(() => {
    if (dbStatus !== 'ready') return
    dbClient.categories.list().then(setCategories).catch(() => {})
  }, [dbStatus])

  // Generate any due recurring transactions on first ready (run-once per session).
  useEffect(() => {
    if (dbStatus !== 'ready') return
    let cancelled = false
    const KEY = 'oikos:recurring_last_run'
    const today = new Date().toISOString().slice(0, 10)
    try {
      if (sessionStorage.getItem(KEY) === today) return
    } catch { /* ignore */ }
    generateDueRecurringTransactions()
      .then((created) => {
        if (cancelled) return
        try { sessionStorage.setItem(KEY, today) } catch { /* ignore */ }
        if (created > 0) {
          // Drop the cache for the current month so the new rows appear.
          monthCache.delete(currentMonthKey())
          loadTransactions(currentMonthKey(), true)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStatus])

  const loadTransactions = useCallback(async (mk: string, bust = false) => {
    const isPast = mk < currentMonthKey()

    // Serve from cache for past months (unless explicitly busting)
    if (isPast && !bust) {
      const cached = monthCache.get(mk)
      if (cached) {
        setTransactions(cached.transactions)
        setSummary(cached.summary)
        setListStatus('loaded')
        setListError(null)
        return
      }
    }

    setListStatus('loading')
    setListError(null)
    setSummary(null)
    try {
      const [rows, sum] = await Promise.all([
        dbClient.transactions.listByMonth(mk),
        dbClient.transactions.getMonthlySummary(mk),
      ])
      if (isPast) monthCache.set(mk, { transactions: rows, summary: sum })
      setTransactions(rows)
      setSummary(sum)
      setListStatus('loaded')
    } catch (err: unknown) {
      setListStatus('error')
      setListError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (dbStatus !== 'ready') return
    loadTransactions(monthKey)
  }, [dbStatus, monthKey, loadTransactions])

  // Fetch receipt counts in the background — non-blocking, paperclip indicator
  // appears as soon as the request returns.
  useEffect(() => {
    if (transactions.length === 0) { setReceiptCounts({}); return }
    let cancelled = false
    dbClient.receipts
      .counts(transactions.map((t) => t.id))
      .then((m) => { if (!cancelled) setReceiptCounts(m) })
      .catch(() => { /* non-critical */ })
    return () => { cancelled = true }
  }, [transactions])


  const hasActiveFilter = signFilter !== 'all' || selectedCategoryIds.size > 0

  const transferTransactions = useMemo(
    () => transactions.filter(tx => tx.is_transfer),
    [transactions],
  )

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter(tx => !tx.is_transfer)
    if (signFilter === 'income')  result = result.filter(tx => tx.amount_cents > 0)
    if (signFilter === 'expense') result = result.filter(tx => tx.amount_cents < 0)
    if (selectedCategoryIds.size > 0) {
      result = result.filter(tx => selectedCategoryIds.has(tx.category_id ?? ''))
    }
    result = [...result].sort((a, b) => {
      if (sortKey === 'date') {
        const cmp = b.date.localeCompare(a.date)
        return sortDir === 'desc' ? cmp : -cmp
      }
      if (sortKey === 'description') {
        const cmp = a.description.localeCompare(b.description)
        return sortDir === 'asc' ? cmp : -cmp
      }
      // amount — sort by actual value (10 > -3000)
      const cmp = b.amount_cents - a.amount_cents
      return sortDir === 'desc' ? cmp : -cmp
    })
    return result
  }, [transactions, signFilter, selectedCategoryIds, sortKey, sortDir])

  const filteredSummary = useMemo((): MonthlySummary | null => {
    if (!summary) return null
    if (!hasActiveFilter) return summary
    let income = 0, expense = 0
    for (const tx of filteredTransactions) {
      if (tx.is_transfer) continue
      if (tx.amount_cents > 0) income += tx.amount_cents
      else expense += tx.amount_cents
    }
    return { ...summary, total_income_cents: income, total_expense_cents: expense, net_cents: income + expense }
  }, [filteredTransactions, hasActiveFilter, summary])

  function clearFilters() {
    setSignFilter('all')
    setSelectedCategoryIds(new Set())
  }

  function setSort(key: SortKey, dir: SortDir) {
    setSortKey(key)
    setSortDir(dir)
  }

  return {
    dbStatus,
    dbError,
    monthKey,
    transactions,
    summary,
    listStatus,
    listError,
    isCurrentMonth,
    categories,
    receiptCounts,
    signFilter,
    setSignFilter,
    selectedCategoryIds,
    setSelectedCategoryIds,
    filteredTransactions,
    filteredSummary,
    hasActiveFilter,
    transferTransactions,
    clearFilters,
    sortKey,
    sortDir,
    setSort,
    goToPrevMonth: () => { setMonthKey(prevMonthKey); clearFilters() },
    goToNextMonth: () => { setMonthKey(nextMonthKey); clearFilters() },
    reload: () => { monthCache.delete(monthKey); loadTransactions(monthKey, true) },
  }
}
