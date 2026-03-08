'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import { MealLibrary } from '@/app/meal-plan/_components/MealLibrary'
import { useAbilities } from '@/hooks/useAbilities'
import type { MealWithIngredients, InsertMealInput, UpdateMealInput } from '@/db/types'

export default function MealLibraryPage() {
  const [meals,  setMeals]  = useState<MealWithIngredients[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,  setError]  = useState<string | null>(null)

  const abilities = useAbilities()
  const canWrite  = abilities.can('shopping', 'write')

  useEffect(() => {
    dbClient.mealPlan.listMeals()
      .then((m) => { setMeals(m); setStatus('loaded') })
      .catch((err) => { setError((err as Error).message); setStatus('error') })
  }, [])

  const addMeal = useCallback(async (input: InsertMealInput) => {
    const meal = await dbClient.mealPlan.insertMeal(input)
    setMeals((prev) => [...prev, meal].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const saveMeal = useCallback(async (id: string, input: UpdateMealInput) => {
    const updated = await dbClient.mealPlan.updateMeal(id, input)
    setMeals((prev) => prev.map((m) => (m.id === id ? updated : m)))
  }, [])

  const removeMeal = useCallback(async (id: string) => {
    await dbClient.mealPlan.deleteMeal(id)
    setMeals((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold">Meal Library</h1>

      {status === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-400">Loading…</p>
      )}

      {status === 'error' && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error ?? 'Failed to load meal library.'}
        </p>
      )}

      {status === 'loaded' && (
        <MealLibrary
          meals={meals}
          canWrite={canWrite}
          onAdd={addMeal}
          onUpdate={saveMeal}
          onDelete={removeMeal}
        />
      )}
    </div>
  )
}
