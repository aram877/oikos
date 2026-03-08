'use client'

import { useState } from 'react'
import type { MealWithIngredients, InsertMealInput, UpdateMealInput } from '@/db/types'
import { MealForm }      from './MealForm'
import { RecipeSearch }  from './RecipeSearch'

interface Props {
  meals:       MealWithIngredients[]
  canWrite:    boolean
  onAdd:       (input: InsertMealInput) => Promise<void>
  onUpdate:    (id: string, input: UpdateMealInput) => Promise<void>
  onDelete:    (id: string) => Promise<void>
}

type Panel = 'none' | 'manual' | 'search'

export function MealLibrary({ meals, canWrite, onAdd, onUpdate, onDelete }: Props) {
  const [panel,     setPanel]     = useState<Panel>('none')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  async function handleAdd(data: InsertMealInput | UpdateMealInput) {
    setError(null)
    await onAdd(data as InsertMealInput)
    setPanel('none')
  }

  async function handleUpdate(id: string, data: InsertMealInput | UpdateMealInput) {
    setError(null)
    await onUpdate(id, data as UpdateMealInput)
    setEditingId(null)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" from the meal library? Any slots using it will be cleared.`)) return
    setError(null)
    try {
      await onDelete(id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <aside className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Meal Library</h2>
        {canWrite && panel === 'none' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setPanel('search')}
              className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Search recipes
            </button>
            <button
              onClick={() => setPanel('manual')}
              className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              + New
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {panel === 'search' && (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <RecipeSearch
            onAdd={handleAdd}
            onClose={() => setPanel('none')}
          />
        </div>
      )}

      {panel === 'manual' && (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <MealForm
            onSave={handleAdd}
            onCancel={() => setPanel('none')}
          />
        </div>
      )}

      {meals.length === 0 && panel === 'none' && (
        <p className="text-sm text-neutral-400">
          {canWrite ? 'No meals yet — add your first meal above.' : 'No meals in the library.'}
        </p>
      )}

      <ul className="space-y-2">
        {meals.map((meal) => (
          <li
            key={meal.id}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700"
          >
            {editingId === meal.id ? (
              <div className="p-4">
                <MealForm
                  meal={meal}
                  onSave={(data) => handleUpdate(meal.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{meal.name}</p>
                  {meal.ingredients.length > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {meal.ingredients.map((i) => i.name).join(', ')}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setEditingId(meal.id)}
                      className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      title="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 14.25a2.25 2.25 0 0 1-2.25-2.25V4.75a2.25 2.25 0 0 1 2.25-2.25h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 0-.75.75v7.25c0 .414.336.75.75.75h7.25a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 1 1.5 0v4.5a2.25 2.25 0 0 1-2.25 2.25h-7.25Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(meal.id, meal.name)}
                      className="rounded p-1 text-neutral-400 hover:text-red-500"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
