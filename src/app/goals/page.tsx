'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type { SavingsGoalRow } from '@/db/types'
import { Money } from '@/lib/privacy'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Status = 'loading' | 'loaded' | 'error'

function daysUntil(targetDate: string | null): number | null {
  if (!targetDate) return null
  const target = new Date(targetDate + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export default function GoalsPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [goals, setGoals] = useState<SavingsGoalRow[]>([])

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [current, setCurrent] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Savings goals | Oikos' }, [])

  async function load() {
    setStatus('loading')
    try {
      setGoals(await dbClient.savingsGoals.list())
      setStatus('loaded')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load goals.')
      setStatus('error')
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    const targetCents = Math.round(parseFloat(target) * 100)
    const currentCents = current ? Math.round(parseFloat(current) * 100) : 0
    if (!name.trim() || !Number.isFinite(targetCents) || targetCents <= 0) return
    setSaving(true)
    try {
      await dbClient.savingsGoals.insert({
        name: name.trim(),
        target_cents: targetCents,
        current_cents: Number.isFinite(currentCents) && currentCents >= 0 ? currentCents : 0,
        target_date: date || null,
      })
      setName('')
      setTarget('')
      setCurrent('')
      setDate('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleAddProgress(goal: SavingsGoalRow) {
    const raw = window.prompt(`Add to "${goal.name}" — amount in €:`, '')
    if (!raw) return
    const cents = Math.round(parseFloat(raw) * 100)
    if (!Number.isFinite(cents) || cents === 0) return
    const next = Math.max(0, goal.current_cents + cents)
    await dbClient.savingsGoals.update(goal.id, { current_cents: next })
    await load()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this goal?')) return
    await dbClient.savingsGoals.softDelete(id)
    await load()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <div className="mb-1 text-xs text-muted-foreground">
          <Link href="/transactions" className="hover:text-foreground transition-colors">Transactions</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">Savings goals</span>
        </div>
        <h1 className="text-xl font-semibold">Savings goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track named targets — vacations, emergency fund, big purchases.
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
                New goal
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Goal name (e.g. Vacation)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Target €"
                  className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Saved so far €"
                  className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
                />
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={!name.trim() || !target || saving}
                  size="sm"
                >
                  {saving ? 'Saving…' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {goals.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No goals yet. Add your first one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => {
                const pct = Math.min(100, Math.round((g.current_cents / g.target_cents) * 100))
                const done = g.current_cents >= g.target_cents
                const days = daysUntil(g.target_date)
                return (
                  <li key={g.id}>
                    <Card>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{g.name}</div>
                            <div className="text-xs text-muted-foreground">
                              <Money cents={g.current_cents} className="tabular-nums" />
                              <span className="mx-1">/</span>
                              <Money cents={g.target_cents} className="tabular-nums" />
                              <span className="ml-2">{pct}%</span>
                              {g.target_date && (
                                <span className="ml-2">
                                  · {g.target_date}
                                  {days !== null && (
                                    <span className={`ml-1 ${days < 0 ? 'text-red-500' : days < 30 ? 'text-amber-500' : ''}`}>
                                      ({days < 0 ? `${-days}d overdue` : `${days}d left`})
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddProgress(g)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              + Progress
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(g.id)}
                              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              done ? 'bg-green-500 dark:bg-green-400' : 'bg-blue-500 dark:bg-blue-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
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
