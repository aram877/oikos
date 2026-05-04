'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type {
  CategoryRow,
  RecurringFrequency,
  RecurringTransactionRow,
} from '@/db/types'
import { Money } from '@/lib/privacy'
import { summarizeNext } from '@/lib/recurring'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Status = 'loading' | 'loaded' | 'error'
type Sign = 'expense' | 'income'

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly',  label: 'Monthly' },
  { value: 'yearly',   label: 'Yearly' },
]

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RecurringPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<RecurringTransactionRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  // form
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [sign, setSign] = useState<Sign>('expense')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [startDate, setStartDate] = useState(todayLocal())
  const [categoryId, setCategoryId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Recurring | Oikos' }, [])

  async function load() {
    setStatus('loading')
    try {
      const [list, cats] = await Promise.all([
        dbClient.recurringTransactions.list(),
        dbClient.categories.list(),
      ])
      setItems(list)
      setCategories(cats)
      setStatus('loaded')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
      setStatus('error')
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    const cents = Math.round(parseFloat(amount) * 100)
    if (!description.trim() || !Number.isFinite(cents) || cents <= 0) return
    setSaving(true)
    try {
      await dbClient.recurringTransactions.insert({
        category_id:  categoryId || null,
        description:  description.trim(),
        amount_cents: sign === 'expense' ? -cents : cents,
        frequency,
        start_date:   startDate,
      })
      setDescription('')
      setAmount('')
      setCategoryId('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function togglePause(id: string, paused: boolean) {
    await dbClient.recurringTransactions.update(id, { paused: !paused })
    await load()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Stop this recurring transaction?')) return
    await dbClient.recurringTransactions.softDelete(id)
    await load()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <div className="mb-1 text-xs text-muted-foreground">
          <Link href="/transactions" className="hover:text-foreground transition-colors">Transactions</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Recurring</span>
        </div>
        <h1 className="text-xl font-semibold">Recurring transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Templates that auto-create transactions on a schedule. Generated when you visit /transactions.
        </p>
      </div>

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-red-500">{error}</p>
      )}

      {status === 'loaded' && (
        <>
          <Card className="mb-4">
            <CardContent className="space-y-2 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New recurring
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (e.g. Rent)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <select
                  value={sign}
                  onChange={(e) => setSign(e.target.value as Sign)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="€"
                  className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={!description.trim() || !amount || saving}
                  size="sm"
                >
                  {saving ? 'Saving…' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing recurring yet. Add a template above.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((t) => {
                const cat = categories.find((c) => c.id === t.category_id)
                return (
                  <li key={t.id}>
                    <Card>
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {t.description}
                            {t.paused && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {summarizeNext(t)}
                            {cat && <span className="ml-2">· {cat.name}</span>}
                          </div>
                        </div>
                        <Money
                          cents={t.amount_cents}
                          className={`shrink-0 tabular-nums font-medium ${
                            t.amount_cents >= 0
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => togglePause(t.id, t.paused)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t.paused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Stop
                        </button>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
