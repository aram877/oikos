# Meal Library

CRUD for meals + their ingredient lists. The library is the source for
[meal-plan](./meal-plan.md) slot assignment.

## Routes

| Path            | File                                    | Purpose |
|-----------------|-----------------------------------------|---------|
| `/meal-library` | `src/app/meal-library/page.tsx`         | Add / edit / delete meals; expand each to manage ingredients. |

## Database

Both tables defined in `supabase/add_meal_plan.sql`.

### `public.meals`

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `account_id` | uuid FK     | → `accounts.id` |
| `name`       | text        | non-empty |
| `created_at` | timestamptz | |

### `public.meal_ingredients`

| Column     | Type    | Notes |
|------------|---------|-------|
| `id`       | uuid PK | |
| `meal_id`  | uuid FK | → `meals.id` (cascade) |
| `name`     | text    | free-text; no unit / qty fields |

**RLS** — Members with `shopping_access` can read; `write` can mutate.
Delete on `meals` is admin-only by the standard rule.

## Repository — `src/db/repositories/mealPlanRepo.ts` (library half)

| Function | Purpose |
|----------|---------|
| `listMeals()` | All meals with their ingredient arrays nested in. Sorted by name. |
| `insertMeal({ name, ingredients })` | Create the meal, then batch-insert ingredient rows. |
| `updateMeal(id, { name?, ingredients? })` | Update name and/or **replace all** ingredients (delete old, insert new). |
| `deleteMeal(id)` | Hard delete. Cascade removes ingredients; meal-plan slots get `meal_id = NULL`. |

Exposed on `dbClient.mealPlan` as `listMeals`, `insertMeal`, `updateMeal`,
`deleteMeal`.

## React layer

- `src/app/meal-library/page.tsx` — wrapper page, holds the meals state,
  wires the add / update / delete callbacks.
- `src/app/meal-plan/_components/MealLibrary.tsx` — the actual library UI,
  reused inside the meal-plan area too. Each row expands to a textarea with
  one ingredient per line; admins see a delete button.

## How it works

1. **List.** `listMeals()` returns each meal with its ingredients pre-joined
   so the UI doesn't N+1.
2. **Add.** Form → `insertMeal({ name, ingredients: ['Eggs', 'Milk', …] })`.
   The repo creates the meal row and then batch-inserts the ingredients.
3. **Edit.** Inline form. The repo updates the name (if changed) and, if
   ingredients were edited, **replaces** them (delete all, insert all). This
   keeps the logic predictable and idempotent.
4. **Delete.** Hard delete the meal. Cascade removes ingredient rows.
   Meal-plan slots referencing this meal don't fail — their `meal_id` is set
   to NULL by the slot table's `ON DELETE SET NULL`.

## Notable details

- **Ingredients are names only.** No quantities, units, or allergens.
  Intentionally minimal.
- **Replace-all on update.** Simpler than diffing; failure mid-replace
  could leave a meal without ingredients (no transaction wrapper).
- **No soft delete on meals.** Hard delete; admins only by RLS.
- **Drives [meal-plan](./meal-plan.md).** The slot picker is a list of the
  library's meals.
- **Case insensitivity is the meal-plan's problem** — when adding a week's
  ingredients to the shopping list the diff is case-insensitive but the
  inserted name preserves the library casing.
