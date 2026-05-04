'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type { BudgetRow, CategoryRow, TransactionListRow } from '@/db/types'
import { Money } from '@/lib/privacy'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Status = 'loading' | 'loaded' | 'error'

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function spendByCategoryThisMonth(txs: TransactionListRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of txs) {
    if (tx.is_transfer || tx.amount_cents >= 0) continue
    const key = tx.category_id ?? '__uncat__'
    map.set(key, (map.get(key) ?? 0) + Math.abs(tx.amount_cents))
  }
  return map
}

export default function BudgetsPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [spend, setSpend] = useState<Map<string, number>>(new Map())

  const [editingCategory, setEditingCategory] = useState<string>('')
  const [editingAmount, setEditingAmount] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Budgets | Oikos' }, [])

  async function load() {
    setStatus('loading')
    try {
      const [bs, cs, txs] = await Promise.all([
        dbClient.budgets.list(),
        dbClient.categories.list(),
        dbClient.transactions.listByMonth(currentMonthKey()),
      ])
      setBudgets(bs)
      setCategories(cs)
      setSpend(spendByCategoryThisMonth(txs))
      setStatus('loaded')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load budgets.')
      setStatus('error')
    }
  }

  useEffect(() => { load() }, [])

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRow>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const budgetedCategoryIds = useMemo(
    () => new Set(budgets.map((b) => b.category_id)),
    [budgets],
  )

  const availableCategories = useMemo(
    () => categories.filter((c) => !budgetedCategoryIds.has(c.id)),
    [categories, budgetedCategoryIds],
  )

  async function handleSave() {
    if (!editingCategory) return
    const cents = Math.round(parseFloat(editingAmount) * 100)
    if (!Number.isFinite(cents) || cents <= 0) return
    setSaving(true)
    try {
      await dbClient.budgets.upsert({ category_id: editingCategory, amount_cents: cents })
      setEditingCategory('')
      setEditingAmount('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await dbClient.budgets.delete(id)
    await load()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <div className="mb-1 text-xs text-muted-foreground">
          <Link href="/transactions" className="hover:text-foreground transition-colors">Transactions</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Budgets</span>
        </div>
        <h1 className="text-xl font-semibold">Monthly budgets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set a monthly cap per category. Progress is computed from this month&apos;s expenses.
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
          {/* Add new budget */}
          {availableCategories.length > 0 && (
            <Card className="mb-4">
              <CardContent className="space-y-2 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  New budget
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={editingCategory}
                    onChange={(e) => setEditingCategory(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                  >
                    <option value="">Choose category…</option>
                    {availableCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={editingAmount}
                    onChange={(e) => setEditingAmount(e.target.value)}
                    placeholder="€ / month"
                    className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                  />
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!editingCategory || !editingAmount || saving}
                    size="sm"
                  >
                    {saving ? 'Saving…' : 'Add'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing budgets */}
          {budgets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No budgets yet. Add one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {budgets.map((b) => {
                const cat = categoriesById.get(b.category_id)
                const spent = spend.get(b.category_id) ?? 0
                const pct = Math.min(100, Math.round((spent / b.amount_cents) * 100))
                const over = spent > b.amount_cents
                return (
                  <li key={b.id}>
                    <Card>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {cat?.name ?? 'Unknown category'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <Money cents={-spent} className="tabular-nums" />
                              <span className="mx-1">/</span>
                              <Money cents={-b.amount_cents} className="tabular-nums" />
                              <span className="ml-2">{pct}%</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDelete(b.id)}
                            aria-label="Delete budget"
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              over
                                ? 'bg-red-500 dark:bg-red-400'
                                : pct >= 80
                                  ? 'bg-amber-500 dark:bg-amber-400'
                                  : 'bg-green-500 dark:bg-green-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {over && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Over budget by{' '}
                            <Money cents={-(spent - b.amount_cents)} className="tabular-nums font-medium" />
                          </p>
                        )}
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
