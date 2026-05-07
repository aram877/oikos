# Budgets

A monthly spending cap per category. The page shows live progress against
this month's spend and is also surfaced on the dashboard.

## Routes

| Path        | File                            | Purpose |
|-------------|---------------------------------|---------|
| `/budgets`  | `src/app/budgets/page.tsx`      | List, add, edit, delete budgets; live progress bars. |

## Database

### `public.budgets`
Defined in `supabase/add_budgets.sql`.

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `id`           | uuid PK     | |
| `account_id`   | uuid FK     | → `accounts.id` (cascade) |
| `category_id`  | uuid FK     | → `categories.id` |
| `amount_cents` | int         | `> 0`; positive cap on `|spend|` |
| `created_at`, `updated_at` | timestamptz | |

**Constraints**
- Unique `(account_id, category_id)` — one budget per category.

**Indexes**
- `(account_id)` for the list query.

**RLS** — Account members can SELECT / INSERT / UPDATE / DELETE.

## Repository — `src/db/repositories/budgetsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listBudgets()` | Active account's budgets, ordered by `created_at`. |
| `upsertBudget({ category_id, amount_cents })` | Insert or update; `onConflict: 'account_id,category_id'`. |
| `deleteBudget(id)` | Hard delete. |

Exposed on `dbClient.budgets` as `list`, `upsert`, `delete`.

## React layer

- `src/app/budgets/page.tsx` — loads `budgets`, `categories`, and this month's
  transactions in parallel; computes spend per category in JS; renders cards
  with progress bars. Inline form to add or edit a budget.

## How it works

1. The page loads three things in parallel: `budgets`, `categories`, and the
   current month's `transactions`.
2. For each budget, it computes the **absolute** spend for that category in
   this month from the in-memory transactions, **excluding transfers**
   (`is_transfer = false`).
3. The progress bar is `spend / cap`. Colour rules:
   - `< 80%` — green / muted.
   - `80%–100%` — amber.
   - `> 100%` — red, with the overage amount surfaced.
4. The form lets you pick an unbudgeted category and enter a cap in euros
   (converted to cents on submit). Editing an existing budget is the same
   form — `upsertBudget` handles both.
5. Deleting a budget is a hard delete; transactions are untouched.
6. Dashboard surfacing: the dashboard fetches budgets + this-month
   transactions and renders the same progress bars in compact form.

## Notable details

- **Current-month only.** No historical budget tracking; a budget is a
  prospective cap, not an audit log.
- **Spend is computed client-side.** No DB view or pre-aggregated table —
  cheap because we already have this month's rows in memory for the page.
- **Transfers are excluded** from spend, matching the rule used by the
  monthly summary.
- **Categories without budgets** are not shown unless you add one. The form
  filters out already-budgeted categories from the picker.
- **No alerts yet** — over-budget surfaces only inside the app.

## Permissions

`abilities.finance` controls access. Children with `finance_access = 'none'`
don't see budgets. Read access shows progress; write access enables the form.
