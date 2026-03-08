'use client'

import { useState } from 'react'
import { useMealPlan, getWeekStart } from './_hooks/useMealPlan'
import { WeekGrid }   from './_components/WeekGrid'
import { useAbilities } from '@/hooks/useAbilities'

const THIS_WEEK = getWeekStart(0)
const NEXT_WEEK = getWeekStart(1)

export default function MealPlanPage() {
  const [activeWeek, setActiveWeek] = useState<string>(NEXT_WEEK)

  const { meals, slots, status, error, assignSlot, addToShoppingList } =
    useMealPlan(activeWeek)

  const abilities = useAbilities()
  const canWrite  = abilities.can('shopping', 'write')

  const [toast,      setToast]      = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function handleAddToShoppingList() {
    setAddingList(true)
    try {
      const { added, skipped } = await addToShoppingList()
      if (added === 0 && skipped === 0) {
        showToast('No ingredients to add — plan some meals first.')
      } else if (added === 0) {
        showToast(`All ${skipped} ingredient${skipped === 1 ? '' : 's'} already on the shopping list.`)
      } else {
        showToast(
          `${added} ingredient${added === 1 ? '' : 's'} added to shopping list` +
          (skipped > 0 ? `, ${skipped} already there.` : '.')
        )
      }
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`)
    } finally {
      setAddingList(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Meal Plan</h1>
        {canWrite && (
          <button
            onClick={handleAddToShoppingList}
            disabled={addingList || status !== 'loaded'}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {addingList ? 'Adding…' : '+ Add to shopping list'}
          </button>
        )}
      </div>

      {/* Week tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-neutral-200 p-1 w-fit dark:border-neutral-700">
        {([THIS_WEEK, NEXT_WEEK] as const).map((week, i) => (
          <button
            key={week}
            onClick={() => setActiveWeek(week)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeWeek === week
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {i === 0 ? 'This week' : 'Next week'}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 rounded-lg bg-neutral-800 px-4 py-3 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">
          {toast}
        </div>
      )}

      {status === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading…</p>
      )}

      {status === 'error' && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error ?? 'Failed to load meal plan.'}
        </p>
      )}

      {status === 'loaded' && (
        <WeekGrid
          weekStart={activeWeek}
          slots={slots}
          meals={meals}
          canWrite={canWrite}
          onAssign={assignSlot}
        />
      )}

    </div>
  )
}
