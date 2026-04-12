import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CategoryRow, TransactionListRow, MonthlySummary } from '@/db/types'
import type { DbStatus, ListStatus } from '../_types'
import { currentMonthKey, prevMonthKey, nextMonthKey } from '../_utils/month'

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

  const loadTransactions = useCallback(async (mk: string) => {
    setListStatus('loading')
    setListError(null)
    setSummary(null)
    try {
      const [rows, sum] = await Promise.all([
        dbClient.transactions.listByMonth(mk),
        dbClient.transactions.getMonthlySummary(mk),
      ])
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
    reload: () => loadTransactions(monthKey),
  }
}
