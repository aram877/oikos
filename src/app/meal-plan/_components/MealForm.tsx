'use client'

import { useState } from 'react'
import type { MealWithIngredients, InsertMealInput, UpdateMealInput } from '@/db/types'

interface Props {
  /** Pass a meal to edit, omit to create */
  meal?:     MealWithIngredients
  onSave:    (data: InsertMealInput | UpdateMealInput) => Promise<void>
  onCancel:  () => void
}

export function MealForm({ meal, onSave, onCancel }: Props) {
  const [name,        setName]        = useState(meal?.name ?? '')
  const [ingInput,    setIngInput]    = useState('')
  const [ingredients, setIngredients] = useState<string[]>(
    meal?.ingredients.map((i) => i.name) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  function addIngredient() {
    const trimmed = ingInput.trim()
    if (!trimmed) return
    setIngredients((prev) => [...prev, trimmed])
    setIngInput('')
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    setError(null)
    try {
      await onSave({ name: trimmedName, ingredients })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
          Meal name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Spaghetti Bolognese"
          required
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
          Ingredients
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={ingInput}
            onChange={(e) => setIngInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient() } }}
            placeholder="Add ingredient, press Enter"
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          <button
            type="button"
            onClick={addIngredient}
            className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          >
            Add
          </button>
        </div>

        {ingredients.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ingredients.map((ing, idx) => (
              <li
                key={idx}
                className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
              >
                {ing}
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {saving ? 'Saving…' : meal ? 'Update' : 'Add meal'}
        </button>
      </div>
    </form>
  )
}
