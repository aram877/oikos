'use client'

import { useCallback, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { TransactionListRow } from '@/db/types'

export interface MonthSummary {
  yearMonth: string   // 'YYYY-MM'
  label:     string   // 'Jan', 'Feb', …
  incomeCents:  number
  expenseCents: number
  netCents:     number
  txCount:      number
}

export interface YearlySummary {
  months:       MonthSummary[]
  totalIncome:  number
  totalExpense: number
  totalNet:     number
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildYearlySummary(txs: TransactionListRow[], year: number): YearlySummary {
  const map = new Map<string, MonthSummary>()

  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    map.set(ym, {
      yearMonth:    ym,
      label:        MONTH_LABELS[m - 1],
      incomeCents:  0,
      expenseCents: 0,
      netCents:     0,
      txCount:      0,
    })
  }

  for (const tx of txs) {
    if (tx.is_transfer) continue
    const ym = tx.date.slice(0, 7)
    const ms = map.get(ym)
    if (!ms) continue
    if (tx.amount_cents > 0) ms.incomeCents  += tx.amount_cents
    else                      ms.expenseCents += tx.amount_cents
    ms.netCents += tx.amount_cents
    ms.txCount++
  }

  const months = Array.from(map.values())
  return {
    months,
    totalIncome:  months.reduce((s, m) => s + m.incomeCents,  0),
    totalExpense: months.reduce((s, m) => s + m.expenseCents, 0),
    totalNet:     months.reduce((s, m) => s + m.netCents,     0),
  }
}

export function useYearly() {
  const currentYear = new Date().getFullYear()
  const [year,    setYear]    = useState(currentYear)
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [error,   setError]   = useState<string | null>(null)
  const [summary, setSummary] = useState<YearlySummary | null>(null)

  const load = useCallback(async (y: number) => {
    setStatus('loading')
    setError(null)
    try {
      await dbClient.init()
      const startDate = `${y}-01-01`
      const endDate   = `${y + 1}-01-01`
      const txs = await dbClient.transactions.listByDateRange(startDate, endDate)
      setSummary(buildYearlySummary(txs, y))
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  function goToYear(y: number) {
    setYear(y)
    load(y)
  }

  return { year, currentYear, status, error, summary, load, goToYear }
}
