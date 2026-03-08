'use client'

import { useState } from 'react'
import type { MealWithIngredients, MealPlanSlotWithMeal, SlotName, UpsertSlotInput } from '@/db/types'

const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SLOTS: SlotName[] = ['breakfast', 'lunch', 'dinner']

interface Props {
  weekStart:    string
  slots:        MealPlanSlotWithMeal[]
  meals:        MealWithIngredients[]
  canWrite:     boolean
  onAssign:     (input: UpsertSlotInput) => Promise<void>
}

interface AssignTarget {
  dayOfWeek: number
  slot:      SlotName
}

export function WeekGrid({ weekStart, slots, meals, canWrite, onAssign }: Props) {
  const [target,  setTarget]  = useState<AssignTarget | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function getSlot(dayOfWeek: number, slot: SlotName): MealPlanSlotWithMeal | undefined {
    return slots.find((s) => s.day_of_week === dayOfWeek && s.slot === slot)
  }

  async function assign(mealId: string | null) {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await onAssign({
        week_start:  weekStart,
        day_of_week: target.dayOfWeek,
        slot:        target.slot,
        meal_id:     mealId,
      })
      setTarget(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Format week range label: "Mon 3 – Sun 9 Mar 2026"
  const monday = new Date(weekStart + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
  const fmtFull = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const weekLabel = `${fmt.format(monday)} – ${fmtFull.format(sunday)}`

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">This week</h2>
        <span className="text-xs text-neutral-500">{weekLabel}</span>
      </div>

      {error && (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Grid: rows = slots, cols = days */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-24 pb-2 text-left text-xs font-medium text-neutral-400" />
              {DAYS.map((day, idx) => (
                <th
                  key={day}
                  className="pb-2 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400"
                >
                  {day}
                  <span className="ml-1 text-neutral-400">
                    {new Date(monday.getTime() + idx * 86400000).getDate()}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-2 pr-3 text-xs font-medium text-neutral-400 capitalize">{slot}</td>
                {DAYS.map((_, dayIdx) => {
                  const assigned = getSlot(dayIdx, slot)
                  const isTarget = target?.dayOfWeek === dayIdx && target.slot === slot

                  return (
                    <td key={dayIdx} className="py-1.5 px-1 text-center">
                      {canWrite ? (
                        <button
                          onClick={() => setTarget(isTarget ? null : { dayOfWeek: dayIdx, slot })}
                          className={`w-full min-h-[36px] rounded px-2 py-1 text-xs transition-colors ${
                            isTarget
                              ? 'ring-2 ring-neutral-400 bg-neutral-50 dark:bg-neutral-800'
                              : assigned
                              ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                              : 'bg-neutral-50 text-neutral-300 hover:bg-neutral-100 dark:bg-neutral-800/50 dark:text-neutral-600 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {assigned?.meal_name ?? '+'}
                        </button>
                      ) : (
                        <div className={`w-full min-h-[36px] rounded px-2 py-1 text-xs flex items-center justify-center ${
                          assigned
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'text-neutral-300 dark:text-neutral-600'
                        }`}>
                          {assigned?.meal_name ?? '–'}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Meal picker dropdown */}
      {target && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-2 text-xs font-medium text-neutral-500 capitalize">
            Assign meal — {DAYS[target.dayOfWeek]}, {target.slot}
          </p>

          {meals.length === 0 ? (
            <p className="text-xs text-neutral-400">No meals in library yet. Add some first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {meals.map((meal) => (
                <button
                  key={meal.id}
                  disabled={saving}
                  onClick={() => assign(meal.id)}
                  className="rounded-full border border-neutral-200 px-3 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-50"
                >
                  {meal.name}
                </button>
              ))}
              {getSlot(target.dayOfWeek, target.slot) && (
                <button
                  disabled={saving}
                  onClick={() => assign(null)}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setTarget(null)}
            className="mt-2 text-xs text-neutral-400 hover:text-neutral-600"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
