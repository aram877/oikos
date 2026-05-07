# Meal Plan

This-week / next-week 7×3 grid (days × breakfast/lunch/dinner). Each slot
holds either a meal from the [meal library](./meal-library.md) or nothing.
"Add to shopping list" diffs the week's ingredients against the
[shopping list](./shopping-list.md) and inserts only what's missing.

## Routes

| Path         | File                               | Purpose |
|--------------|------------------------------------|---------|
| `/meal-plan` | `src/app/meal-plan/page.tsx`       | Tabs (this/next week) + the 7×3 grid + "Add ingredients to shopping list". |

## Database

### `public.meal_plan_slots`
Defined in `supabase/add_meal_plan.sql`.

| Column         | Type     | Notes |
|----------------|----------|-------|
| `id`           | uuid PK  | |
| `account_id`   | uuid FK  | → `accounts.id` |
| `week_start`   | date     | always a Monday (YYYY-MM-DD) |
| `day_of_week`  | int 0–6  | 0 = Mon, 6 = Sun |
| `slot`         | enum     | `'breakfast' | 'lunch' | 'dinner'` |
| `meal_id`      | uuid FK? | → `meals.id`; ON DELETE SET NULL |

**Constraints**
- Unique `(account_id, week_start, day_of_week, slot)` — one meal per slot.

**RLS** — Members with `shopping_access` can read; `write` can edit.

(Related tables: `meals` and `meal_ingredients`, documented in
[meal-library](./meal-library.md).)

## Repository — `src/db/repositories/mealPlanRepo.ts` (slot half)

| Function | Purpose |
|----------|---------|
| `listSlotsForWeek(weekStart)` | All assigned slots for a Monday, joined with the meal name. |
| `upsertSlot({ week_start, day_of_week, slot, meal_id })` | Insert or update; passing `meal_id = null` clears (deletes) the slot. |
| `addWeekIngredientsToShoppingList(weekStart)` | Collect unique ingredients from this week's meals, diff against the existing shopping list, insert the missing ones; returns `{ added, skipped }`. |

Exposed on `dbClient.mealPlan` (along with the meal-library half).

## React layer

- `src/app/meal-plan/_hooks/useMealPlan.ts` — loads meals once, slots when
  the week tab changes; helper `getWeekStart(offsetWeeks)` returns the
  Monday for the requested week.
- `src/app/meal-plan/_components/WeekGrid.tsx` — the 7×3 table; clicking a
  cell opens a meal picker modal or clears the slot. The "Add to shopping
  list" button calls the repo function and shows a toast with `{added, skipped}`.

## How it works

1. **Pick a week.** This / next tab. The hook converts the offset to the
   Monday-of-week ISO string (Sunday = day 0 in JS gets shifted -6, others
   shift -(day-1)).
2. **Render the grid.** 7 columns (Mon–Sun) × 3 rows (breakfast / lunch /
   dinner). Each cell renders the assigned `meal_name` or an empty plus
   button.
3. **Assign a meal.** Click a cell → modal lists meals from the library →
   `upsertSlot` writes the row. Optimistic state update.
4. **Clear a slot.** From the picker, "Clear" → `upsertSlot({ meal_id: null })`,
   which deletes the row.
5. **Add ingredients.** Button collects all non-empty slots' meal ids,
   reads `meal_ingredients`, dedupes case-insensitively, fetches the
   current shopping list, inserts only the missing names. The toast says
   "3 added, 1 already there."

## Notable details

- **Monday-first weeks.** Every week_start is a Monday — non-negotiable
  internally, even if the UI displays Sun-first locales.
- **No realtime.** Polling only. Meal planning is low-frequency.
- **Unique slot constraint** stops accidental double-assigns.
- **Cascade.** Deleting a meal in the library sets all referencing slots'
  `meal_id` to NULL — the slot rows are kept; their UI just goes back to
  the empty plus button.
- **Diff is case-insensitive** when matching ingredients to existing
  shopping items, but the inserted name preserves the meal's original
  casing.

## Permissions

`abilities.shopping`. Same access flag as the shopping list because the
two are integrated.
