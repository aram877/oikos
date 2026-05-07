# Savings Goals

Named savings targets ("Vacation", "Emergency fund") with optional deadlines.
Progress is **manual** — no automatic deduction from transactions.

## Routes

| Path     | File                          | Purpose |
|----------|-------------------------------|---------|
| `/goals` | `src/app/goals/page.tsx`      | Create, edit, "+ Progress", delete. |

The dashboard surfaces the top three goals.

## Database

### `public.savings_goals`
Defined in `supabase/add_savings_goals.sql`.

| Column          | Type        | Notes |
|-----------------|-------------|-------|
| `id`            | uuid PK     | |
| `account_id`    | uuid FK     | → `accounts.id` |
| `name`          | text        | non-empty |
| `target_cents`  | int         | `> 0` |
| `current_cents` | int         | `>= 0`, default `0` |
| `target_date`   | date?       | optional deadline |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**Indexes**
- Partial index on `(account_id)` where `deleted_at IS NULL`.

**RLS** — Account members manage their account's goals.

## Repository — `src/db/repositories/savingsGoalsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listGoals()` | Active goals (not soft-deleted). |
| `insertGoal({ name, target_cents, current_cents?, target_date? })` | Create. |
| `updateGoal(id, partial)` | Update name / target / current / date. |
| `softDeleteGoal(id)` | Set `deleted_at`. |

Exposed on `dbClient.savingsGoals` as `list`, `insert`, `update`, `softDelete`.

## React layer

- `src/app/goals/page.tsx` — loads goals, renders cards with progress bars,
  countdown badges, and an inline "+ Progress" prompt that adds an amount to
  `current_cents`.

## How it works

1. **Create a goal** — name, target amount (euros → cents), optional deadline.
   `current_cents` defaults to `0`.
2. **Progress visual** — a progress bar of `current_cents / target_cents`,
   percentage label, and remaining amount.
3. **Countdown** — if `target_date` is set, the card shows "X days left" or
   "X days overdue". Calculation treats `target_date` as midnight local time.
4. **+ Progress** — opens a small prompt for an amount; on submit it bumps
   `current_cents` via `updateGoal`. There's no auto-link to a transaction.
5. **Edit** — full form with delete confirm. Soft-delete sets `deleted_at`;
   the goal is hidden but recoverable in the DB.
6. **Dashboard** — top three goals (by `created_at`) render compact cards
   with progress bars under the budgets section.

## Notable details

- **No transaction integration.** Progress is purely manual — by design, so
  goals don't depend on tagging conventions.
- **Soft-delete only.** Recover by clearing `deleted_at` in the DB; no UI
  recovery flow yet.
- **Optional deadline.** Goals without `target_date` show no countdown.
- **Currency** — display uses the active account's currency formatter
  (always EUR in MVP).

## Permissions

`abilities.finance` (read = view, write = mutate). Children typically don't
see this; admins/parents can manage goals for the household.
