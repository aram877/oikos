import type {
  MealRow,
  MealIngredientRow,
  MealWithIngredients,
  MealPlanSlotWithMeal,
  InsertMealInput,
  UpdateMealInput,
  UpsertSlotInput,
} from '../types'
import { getSupabase }        from '../supabase'
import { getActiveAccountId } from '../accountContext'

// ── Meal library ──────────────────────────────────────────────────────────── //

/**
 * Returns all meals for the active account, each with their ingredient list.
 */
export async function listMeals(): Promise<MealWithIngredients[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('meals')
    .select('id, account_id, name, created_at, meal_ingredients(id, meal_id, name)')
    .eq('account_id', accountId)
    .order('name', { ascending: true })

  if (error) throw new Error(`[mealPlanRepo.listMeals] ${error.message}`)

  return ((data ?? []) as unknown as Array<MealRow & { meal_ingredients: MealIngredientRow[] }>).map(
    (m) => ({ ...m, ingredients: m.meal_ingredients })
  )
}

/**
 * Inserts a meal and its ingredients in a single transaction-like sequence.
 * Returns the meal with ingredients.
 */
export async function insertMeal(input: InsertMealInput): Promise<MealWithIngredients> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: meal, error: mealErr } = await supabase
    .from('meals')
    .insert({ account_id: accountId, name: input.name.trim() })
    .select('id, account_id, name, created_at')
    .single()

  if (mealErr) throw new Error(`[mealPlanRepo.insertMeal] ${mealErr.message}`)
  if (!meal)   throw new Error('[mealPlanRepo.insertMeal] No row returned')

  const mealRow = meal as MealRow

  if (input.ingredients.length === 0) return { ...mealRow, ingredients: [] }

  const rows = input.ingredients
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ meal_id: mealRow.id, name }))

  const { data: ings, error: ingErr } = await supabase
    .from('meal_ingredients')
    .insert(rows)
    .select('id, meal_id, name')

  if (ingErr) throw new Error(`[mealPlanRepo.insertMeal] ingredients: ${ingErr.message}`)

  return { ...mealRow, ingredients: (ings ?? []) as MealIngredientRow[] }
}

/**
 * Updates meal name and/or replaces its ingredients (full replace).
 */
export async function updateMeal(id: string, input: UpdateMealInput): Promise<MealWithIngredients> {
  const supabase = getSupabase()

  // Update name if provided
  if (input.name !== undefined) {
    const { error } = await supabase
      .from('meals')
      .update({ name: input.name.trim() })
      .eq('id', id)

    if (error) throw new Error(`[mealPlanRepo.updateMeal] ${error.message}`)
  }

  // Replace ingredients if provided
  if (input.ingredients !== undefined) {
    const { error: delErr } = await supabase
      .from('meal_ingredients')
      .delete()
      .eq('meal_id', id)

    if (delErr) throw new Error(`[mealPlanRepo.updateMeal] delete ingredients: ${delErr.message}`)

    if (input.ingredients.length > 0) {
      const rows = input.ingredients
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ meal_id: id, name }))

      const { error: insErr } = await supabase
        .from('meal_ingredients')
        .insert(rows)

      if (insErr) throw new Error(`[mealPlanRepo.updateMeal] insert ingredients: ${insErr.message}`)
    }
  }

  // Re-fetch full meal with ingredients
  const { data, error } = await supabase
    .from('meals')
    .select('id, account_id, name, created_at, meal_ingredients(id, meal_id, name)')
    .eq('id', id)
    .single()

  if (error) throw new Error(`[mealPlanRepo.updateMeal] refetch: ${error.message}`)

  const m = data as unknown as MealRow & { meal_ingredients: MealIngredientRow[] }
  return { ...m, ingredients: m.meal_ingredients }
}

/**
 * Deletes a meal (admin only — enforced by RLS).
 * Cascades to meal_ingredients. Slots referencing this meal are SET NULL.
 */
export async function deleteMeal(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('meals')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`[mealPlanRepo.deleteMeal] ${error.message}`)
}

// ── Weekly plan slots ─────────────────────────────────────────────────────── //

/**
 * Returns all assigned slots for the given week, enriched with meal names.
 * week_start must be a Monday (YYYY-MM-DD).
 */
export async function listSlotsForWeek(weekStart: string): Promise<MealPlanSlotWithMeal[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('meal_plan_slots')
    .select('id, account_id, week_start, day_of_week, slot, meal_id, meals(name)')
    .eq('account_id', accountId)
    .eq('week_start', weekStart)

  if (error) throw new Error(`[mealPlanRepo.listSlotsForWeek] ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string; account_id: string; week_start: string
    day_of_week: number; slot: string; meal_id: string | null
    meals: { name: string } | null
  }>).map((r) => ({
    id:          r.id,
    account_id:  r.account_id,
    week_start:  r.week_start,
    day_of_week: r.day_of_week,
    slot:        r.slot as 'breakfast' | 'lunch' | 'dinner',
    meal_id:     r.meal_id,
    meal_name:   r.meals?.name ?? null,
  }))
}

/**
 * Assigns (or clears) a meal to a slot.
 * - meal_id = string → upsert the slot
 * - meal_id = null   → delete the slot row (clearing it)
 */
export async function upsertSlot(input: UpsertSlotInput): Promise<void> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  if (input.meal_id === null) {
    // Clear: delete the row if it exists
    const { error } = await supabase
      .from('meal_plan_slots')
      .delete()
      .eq('account_id',   accountId)
      .eq('week_start',   input.week_start)
      .eq('day_of_week',  input.day_of_week)
      .eq('slot',         input.slot)

    if (error) throw new Error(`[mealPlanRepo.upsertSlot] delete: ${error.message}`)
    return
  }

  const { error } = await supabase
    .from('meal_plan_slots')
    .upsert(
      {
        account_id:  accountId,
        week_start:  input.week_start,
        day_of_week: input.day_of_week,
        slot:        input.slot,
        meal_id:     input.meal_id,
      },
      { onConflict: 'account_id,week_start,day_of_week,slot' }
    )

  if (error) throw new Error(`[mealPlanRepo.upsertSlot] upsert: ${error.message}`)
}

// ── Shopping list integration ─────────────────────────────────────────────── //

/**
 * Collects all unique ingredient names from meals assigned to the given week,
 * diffs against existing shopping_items (case-insensitive), and inserts the
 * missing ones. Returns counts for the toast message.
 */
export async function addWeekIngredientsToShoppingList(weekStart: string): Promise<{
  added:    number
  skipped:  number
}> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  // 1. Get all meal_ids for this week
  const { data: slots, error: slotsErr } = await supabase
    .from('meal_plan_slots')
    .select('meal_id')
    .eq('account_id', accountId)
    .eq('week_start', weekStart)
    .not('meal_id', 'is', null)

  if (slotsErr) throw new Error(`[mealPlanRepo.addWeekIngredients] slots: ${slotsErr.message}`)

  const mealIds = [...new Set((slots ?? []).map((s: { meal_id: string | null }) => s.meal_id as string))]

  if (mealIds.length === 0) return { added: 0, skipped: 0 }

  // 2. Get all ingredient names for those meals
  const { data: ings, error: ingsErr } = await supabase
    .from('meal_ingredients')
    .select('name')
    .in('meal_id', mealIds)

  if (ingsErr) throw new Error(`[mealPlanRepo.addWeekIngredients] ingredients: ${ingsErr.message}`)

  // 3. Unique ingredient names (normalised)
  const normalise = (s: string) => s.trim().toLowerCase()
  const allIngredients = [...new Set((ings ?? []).map((i: { name: string }) => i.name))]

  if (allIngredients.length === 0) return { added: 0, skipped: 0 }

  // 4. Existing shopping list items
  const { data: existing, error: existErr } = await supabase
    .from('shopping_items')
    .select('name')
    .eq('account_id', accountId)

  if (existErr) throw new Error(`[mealPlanRepo.addWeekIngredients] shopping: ${existErr.message}`)

  const existingSet = new Set((existing ?? []).map((e: { name: string }) => normalise(e.name)))

  // 5. Diff
  const toAdd = allIngredients.filter((name) => !existingSet.has(normalise(name)))
  const skipped = allIngredients.length - toAdd.length

  if (toAdd.length === 0) return { added: 0, skipped }

  // 6. Batch insert
  const { error: insErr } = await supabase
    .from('shopping_items')
    .insert(toAdd.map((name) => ({ account_id: accountId, name, added_by: userId })))

  if (insErr) throw new Error(`[mealPlanRepo.addWeekIngredients] insert: ${insErr.message}`)

  return { added: toAdd.length, skipped }
}
