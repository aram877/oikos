'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type {
  MealWithIngredients,
  MealPlanSlotWithMeal,
  InsertMealInput,
  UpdateMealInput,
  UpsertSlotInput,
  SlotName,
} from '@/db/types'

/**
 * Returns the Monday of a week as YYYY-MM-DD.
 * offsetWeeks=0 → this week, offsetWeeks=1 → next week, etc.
 */
export function getWeekStart(offsetWeeks = 0): string {
  const now = new Date()
  const day = now.getDay()                       // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day         // shift to Monday
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offsetWeeks * 7)
  return monday.toISOString().slice(0, 10)
}

type Status = 'loading' | 'loaded' | 'error'

export interface UseMealPlanReturn {
  weekStart:  string
  meals:      MealWithIngredients[]
  slots:      MealPlanSlotWithMeal[]
  status:     Status
  error:      string | null
  // Meal library actions
  addMeal:    (input: InsertMealInput) => Promise<void>
  saveMeal:   (id: string, input: UpdateMealInput) => Promise<void>
  removeMeal: (id: string) => Promise<void>
  // Grid actions
  assignSlot: (input: UpsertSlotInput) => Promise<void>
  // Shopping integration
  addToShoppingList: () => Promise<{ added: number; skipped: number }>
}

export function useMealPlan(weekStart: string): UseMealPlanReturn {
  const [meals,  setMeals]  = useState<MealWithIngredients[]>([])
  const [slots,  setSlots]  = useState<MealPlanSlotWithMeal[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error,  setError]  = useState<string | null>(null)

  // Load meals once on mount
  useEffect(() => {
    let cancelled = false
    dbClient.mealPlan.listMeals()
      .then((m) => { if (!cancelled) setMeals(m) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Reload slots whenever the selected week changes
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    dbClient.mealPlan.listSlots(weekStart)
      .then((s) => {
        if (cancelled) return
        setSlots(s)
        setStatus('loaded')
      })
      .catch((err) => {
        if (cancelled) return
        setError((err as Error).message)
        setStatus('error')
      })

    return () => { cancelled = true }
  }, [weekStart])

  const addMeal = useCallback(async (input: InsertMealInput) => {
    const meal = await dbClient.mealPlan.insertMeal(input)
    setMeals((prev) => [...prev, meal].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const saveMeal = useCallback(async (id: string, input: UpdateMealInput) => {
    const updated = await dbClient.mealPlan.updateMeal(id, input)
    setMeals((prev) => prev.map((m) => m.id === id ? updated : m))
  }, [])

  const removeMeal = useCallback(async (id: string) => {
    await dbClient.mealPlan.deleteMeal(id)
    setMeals((prev) => prev.filter((m) => m.id !== id))
    // Clear any slots referencing this meal (they become null in DB via ON DELETE SET NULL)
    setSlots((prev) => prev.map((s) => s.meal_id === id ? { ...s, meal_id: null, meal_name: null } : s))
  }, [])

  const assignSlot = useCallback(async (input: UpsertSlotInput) => {
    // Optimistic update
    const mealName = input.meal_id
      ? meals.find((m) => m.id === input.meal_id)?.name ?? null
      : null

    setSlots((prev) => {
      const filtered = prev.filter(
        (s) => !(s.day_of_week === input.day_of_week && s.slot === input.slot)
      )
      if (input.meal_id === null) return filtered
      return [
        ...filtered,
        {
          id:          '',
          account_id:  '',
          week_start:  input.week_start,
          day_of_week: input.day_of_week,
          slot:        input.slot as SlotName,
          meal_id:     input.meal_id,
          meal_name:   mealName,
        },
      ]
    })

    try {
      await dbClient.mealPlan.upsertSlot(input)
    } catch (err) {
      // Rollback on error — refetch
      const fresh = await dbClient.mealPlan.listSlots(input.week_start)
      setSlots(fresh)
      throw err
    }
  }, [meals])

  const addToShoppingList = useCallback(async () => {
    return dbClient.mealPlan.addWeekToShoppingList(weekStart)
  }, [weekStart])

  return {
    weekStart,
    meals,
    slots,
    status,
    error,
    addMeal,
    saveMeal,
    removeMeal,
    assignSlot,
    addToShoppingList,
  }
}
