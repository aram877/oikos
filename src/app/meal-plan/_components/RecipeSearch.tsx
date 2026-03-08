'use client'

import { useEffect, useRef, useState } from 'react'
import type { InsertMealInput } from '@/db/types'

// ── TheMealDB helpers ─────────────────────────────────────────────────────── //

interface MealDBMeal {
  idMeal:         string
  strMeal:        string
  [key: string]:  string | null
}

interface MealDBResponse {
  meals: MealDBMeal[] | null
}

function extractIngredients(meal: MealDBMeal): string[] {
  const ings: string[] = []
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]
    if (name && name.trim()) ings.push(name.trim())
  }
  return ings
}

async function searchRecipes(query: string): Promise<MealDBMeal[]> {
  const res = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
  )
  if (!res.ok) throw new Error('Recipe search failed')
  const json: MealDBResponse = await res.json()
  return json.meals ?? []
}

// ── Component ─────────────────────────────────────────────────────────────── //

interface Props {
  onAdd:    (input: InsertMealInput) => Promise<void>
  onClose:  () => void
}

type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

export function RecipeSearch({ onAdd, onClose }: Props) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<MealDBMeal[]>([])
  const [searchSt, setSearchSt] = useState<SearchStatus>('idle')
  const [selected, setSelected] = useState<MealDBMeal | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearchSt('idle')
      return
    }

    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setSearchSt('searching')
      setSelected(null)
      try {
        const meals = await searchRecipes(trimmed)
        setResults(meals)
        setSearchSt('done')
      } catch {
        setSearchSt('error')
      }
    }, 350)

    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    setSaveErr(null)
    try {
      await onAdd({
        name:        selected.strMeal,
        ingredients: extractIngredients(selected),
      })
      onClose()
    } catch (err) {
      setSaveErr((err as Error).message)
      setSaving(false)
    }
  }

  const ingredients = selected ? extractIngredients(selected) : []

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
          placeholder="Search recipes… (e.g. pasta, chicken)"
          autoFocus
          className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
        {searchSt === 'searching' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
            Searching…
          </span>
        )}
      </div>

      {searchSt === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400">Search failed — check your connection.</p>
      )}

      {/* Results list — hidden once a recipe is selected */}
      {!selected && searchSt === 'done' && (
        <>
          {results.length === 0 ? (
            <p className="text-xs text-neutral-400">No recipes found.</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
              {results.map((meal) => (
                <li key={meal.idMeal}>
                  <button
                    onClick={() => setSelected(meal)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {meal.strMeal}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Confirmation panel */}
      {selected && (
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700 space-y-2">
          <p className="text-sm font-medium">{selected.strMeal}</p>

          {ingredients.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {ingredients.map((ing, i) => (
                <li
                  key={i}
                  className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                >
                  {ing}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-400">No ingredients listed.</p>
          )}

          {saveErr && (
            <p className="text-xs text-red-600 dark:text-red-400">{saveErr}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="rounded bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {saving ? 'Adding…' : 'Add to my library'}
            </button>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Cancel */}
      <button
        onClick={onClose}
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        Cancel search
      </button>
    </div>
  )
}
