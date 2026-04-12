'use client'

import { useState } from 'react'
import type { CategoryRow, CategorizationRuleRow } from '@/db/types'
import type { RecatStatus } from '../_hooks/useCategorizationRules'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function formatEur(cents: number) { return eurFmt.format(cents / 100) }

interface Props {
  rules:        CategorizationRuleRow[]
  categories:   CategoryRow[]
  loading:      boolean
  error:        string | null
  addRule:      (input: { description_contains: string; amount_min_cents: number | null; amount_max_cents: number | null; category_id: string; note: string | null }) => Promise<void>
  removeRule:   (id: string) => Promise<void>
  recategorize: () => Promise<void>
  recatStatus:  RecatStatus
  recatCurrent: number
  recatTotal:   number
  recatApplied: number
}

export function CategorizationRulesSection({ rules, categories, loading, error, addRule, removeRule, recategorize, recatStatus, recatCurrent, recatTotal, recatApplied }: Props) {
  const [desc,      setDesc]      = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note,      setNote]      = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeCategories = categories.filter(c => !c.deleted_at)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!desc.trim() || !categoryId) return
    setSaving(true)
    setSaveError(null)
    try {
      function parseCents(s: string): number | null {
        if (!s.trim()) return null
        const v = Math.round(parseFloat(s.replace(',', '.')) * 100)
        return isNaN(v) ? null : v
      }
      await addRule({
        description_contains: desc.trim(),
        amount_min_cents:     parseCents(amountMin),
        amount_max_cents:     parseCents(amountMax),
        category_id:          categoryId,
        note:                 note.trim() || null,
      })
      setDesc('')
      setAmountMin('')
      setAmountMax('')
      setCategoryId('')
      setNote('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await removeRule(id)
    } finally {
      setDeletingId(null)
    }
  }

  function categoryName(id: string) {
    return categories.find(c => c.id === id)?.name ?? id
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>
  if (error)   return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4">

      {/* Rule list */}
      {rules.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No rules yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rules.map(rule => (
            <li key={rule.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {rule.description_contains}
                </span>
                {(rule.amount_min_cents !== null || rule.amount_max_cents !== null) && (
                  <span className="ml-2 text-neutral-400">
                    {rule.amount_min_cents !== null && rule.amount_max_cents !== null && rule.amount_min_cents === rule.amount_max_cents
                      ? `= ${formatEur(rule.amount_min_cents)}`
                      : rule.amount_min_cents !== null && rule.amount_max_cents !== null
                        ? `${formatEur(rule.amount_min_cents)} – ${formatEur(rule.amount_max_cents)}`
                        : rule.amount_min_cents !== null
                          ? `≥ ${formatEur(rule.amount_min_cents)}`
                          : `≤ ${formatEur(rule.amount_max_cents!)}`
                    }
                  </span>
                )}
                <span className="mx-2 text-neutral-300 dark:text-neutral-600">→</span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {categoryName(rule.category_id)}
                </span>
                {rule.note && (
                  <span className="ml-2 text-xs text-neutral-400 italic">"{rule.note}"</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(rule.id)}
                disabled={deletingId === rule.id}
                className="shrink-0 text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 sm:col-span-2">
            <input
              type="text"
              placeholder="Description contains…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              required
              className="w-full rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Min amount (≥)"
            value={amountMin}
            onChange={e => setAmountMin(e.target.value)}
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Max amount (≤)"
            value={amountMax}
            onChange={e => setAmountMax(e.target.value)}
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            required
            className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">— category —</option>
            {activeCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="col-span-2">
            <input
              type="text"
              placeholder="Note (optional — applied to matched transactions)"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
        </div>

        {saveError && (
          <p className="text-xs text-red-500">{saveError}</p>
        )}

        <button
          type="submit"
          disabled={saving || !desc.trim() || !categoryId}
          className="rounded border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {saving ? 'Adding…' : 'Add rule'}
        </button>
      </form>

      {/* Re-categorize */}
      {rules.length > 0 && (
        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={recategorize}
              disabled={recatStatus === 'running'}
              className="rounded border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {recatStatus === 'running' ? 'Running…' : 'Re-categorize all'}
            </button>
            {recatStatus === 'running' && (
              <span className="text-xs text-neutral-400">{recatCurrent} / {recatTotal}</span>
            )}
            {recatStatus === 'done' && (
              <span className="text-xs text-neutral-500">
                Done — {recatApplied} transaction{recatApplied !== 1 ? 's' : ''} updated
              </span>
            )}
          </div>
          {recatStatus === 'idle' && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Applies current rules to all existing transactions, overriding their category if a rule matches.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
