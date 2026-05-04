'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type { TransactionListRow, CategoryRow } from '@/db/types'
import { TxItem } from '@/app/transactions/_components/TxItem'
import { Money } from '@/lib/privacy'
import { Card, CardContent } from '@/components/ui/card'

type Status = 'loading' | 'loaded' | 'error'

export default function SearchPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState<TransactionListRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const [query, setQuery] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')

  useEffect(() => {
    document.title = 'Search | Oikos'
    let cancelled = false
    Promise.all([dbClient.transactions.listAllActive(), dbClient.categories.list()])
      .then(([txs, cats]) => {
        if (cancelled) return
        setAll(txs)
        setCategories(cats)
        setStatus('loaded')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load transactions.')
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [])

  const results = useMemo(() => {
    if (status !== 'loaded') return []
    const q = query.trim().toLowerCase()
    const min = minAmount ? Math.round(parseFloat(minAmount) * 100) : null
    const max = maxAmount ? Math.round(parseFloat(maxAmount) * 100) : null
    return all.filter((tx) => {
      if (q && !tx.description.toLowerCase().includes(q) && !(tx.notes ?? '').toLowerCase().includes(q)) {
        return false
      }
      if (categoryId && tx.category_id !== categoryId) return false
      const abs = Math.abs(tx.amount_cents)
      if (min !== null && Number.isFinite(min) && abs < min) return false
      if (max !== null && Number.isFinite(max) && abs > max) return false
      if (startDate && tx.date < startDate) return false
      if (endDate && tx.date > endDate) return false
      return true
    })
  }, [all, query, minAmount, maxAmount, startDate, endDate, categoryId, status])

  const total = useMemo(() => results.reduce((s, t) => s + t.amount_cents, 0), [results])

  const hasFilters = query || minAmount || maxAmount || startDate || endDate || categoryId

  function clearAll() {
    setQuery('')
    setMinAmount('')
    setMaxAmount('')
    setStartDate('')
    setEndDate('')
    setCategoryId('')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            <Link href="/transactions" className="hover:text-foreground transition-colors">Transactions</Link>
            <span className="mx-1.5">/</span>
            <span className="text-foreground">Search</span>
          </div>
          <h1 className="text-xl font-semibold">Search transactions</h1>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description or notes…"
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Min €"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Max €"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </CardContent>
      </Card>

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-red-500">{error}</p>
      )}

      {status === 'loaded' && (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length} match{results.length === 1 ? '' : 'es'}</span>
            {results.length > 0 && (
              <span>
                Total <Money cents={total} className="tabular-nums font-medium" />
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {hasFilters ? 'No transactions match these filters.' : 'Type to search across all transactions.'}
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {results.slice(0, 200).map((tx) => (
                    <TxItem key={tx.id} tx={tx} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {results.length > 200 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing first 200 — refine filters to narrow down.
            </p>
          )}
        </>
      )}
    </div>
  )
}
