# Transactions

The financial heart of the app. Income / expense / transfer rows scoped to one
shared account, browsed month by month, with soft-delete and optional category
attribution.

## Routes

| Path                       | File                                                          | Purpose |
|----------------------------|---------------------------------------------------------------|---------|
| `/transactions`            | `src/app/transactions/page.tsx`                               | Month list with sign + category filters and a per-month summary. Triggers the recurring generator on first session-mount. |
| `/transactions/new`        | `src/app/transactions/new/page.tsx`                           | Create-transaction form with sign selector and optional transfer flag. |
| `/transactions/[id]`       | `src/app/transactions/[id]/page.tsx`                          | Edit + soft-delete (two-step confirm). Optional "apply category to all matching descriptions in this month". |

## Database

### `public.transactions`
Defined in `supabase/schema.sql` and modified by `supabase/add_transfer_flag.sql`,
`supabase/add_user_attribution.sql`, `supabase/fix_import_hash_constraint.sql`,
`supabase/add_get_account_balance_fn.sql`.

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `id`           | uuid PK     | `gen_random_uuid()` |
| `account_id`   | uuid FK     | → `accounts.id` (cascade) |
| `category_id`  | uuid FK?    | NULL = uncategorized |
| `amount_cents` | int         | **signed**: negative = expense, positive = income |
| `currency`     | text        | always `'EUR'` in MVP |
| `date`         | date        | YYYY-MM-DD |
| `description`  | text        | |
| `notes`        | text?       | |
| `import_hash`  | text?       | dedup key set by CSV importer; NULL for manual entries |
| `is_transfer`  | boolean     | `true` excludes the row from income/expense summaries |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft-delete via `deleted_at IS NULL` |

**Indexes**
- `(account_id, date)` for month queries.

**Constraints**
- Unique `(account_id, import_hash)` — see `fix_import_hash_constraint.sql`.
  NULL hashes never collide; manual entries are safe.

**RLS**
- Members with `finance_access` ∈ {`read`, `write`} can SELECT.
- Members with `finance_access = 'write'` can INSERT / UPDATE / DELETE.

### RPCs

- `get_monthly_summary(account_id, yearMonth)` — income / expense / net by
  category. **Excludes** rows where `is_transfer = true`. Defined originally
  in `schema.sql` and updated in `add_transfer_flag.sql`.
- `get_account_balance(account_id)` — splits totals into:
  - `cashflow_cents` — income − expenses (transfers excluded) ≈ net worth flow
  - `transfers_cents` — net of transfer rows (negative if you moved money to
    savings)
  - `balance_cents` — sum of every transaction, the checking-account balance.

## Repository — `src/db/repositories/transactionRepo.ts`

| Function | Purpose |
|----------|---------|
| `listByMonth(yearMonth, accountId?)` | Rows in a YYYY-MM window, joined with category names. |
| `listByDateRange(startDate, endDate, accountId?)` | Range query (used by analyst). |
| `listAllActive(accountId?)` | All non-deleted rows; used by `Re-categorize`. |
| `listUncategorized(accountId?)` | `category_id IS NULL`; used by AI auto-categorize. |
| `getTransaction(id)` | Single row or `null`. |
| `insertTransaction(input)` | Create. Defaults `currency='EUR'`. |
| `updateTransaction(id, input)` | Partial update; bumps `updated_at`. |
| `softDeleteTransaction(id)` | Sets `deleted_at`. |
| `getMonthlySummary(yearMonth, accountId?)` | Calls the `get_monthly_summary` RPC. |
| `getAccountBalance(accountId?)` | Calls the `get_account_balance` RPC. |
| `checkImportHashes(hashes)` | Returns the subset of `hashes` that already exist. |
| `insertTransactionsBulk(inputs)` | Upsert with `onConflict: 'account_id,import_hash'`. |
| `findCategoryByDescription(description)` | Most-recent category for a description (case-insensitive). |
| `countSameDescriptionInMonth(description, yearMonth, excludeId)` | For the bulk-categorize prompt. |
| `updateCategoryByDescriptionInMonth(description, yearMonth, categoryId, excludeId)` | Bulk reassign. |

Exposed on `dbClient.transactions` in `src/db/db.client.ts`.

## React layer

### `_hooks/`
- `useTransactionList.ts` — load month, cache past months in a module-level
  `Map`, run `generateDueRecurringTransactions()` once per session per day, hold
  the filter / sort / month state, persist UI state to `sessionStorage`.
- `useNewTransaction.ts` — form state + insert.
- `useEditTransaction.ts` — load row, edit form state, soft-delete, optional
  bulk-categorize on category change.
- `useAutoCategorize.ts` — call `/api/ai/categorize` for uncategorized rows;
  see [auto-categorize](./auto-categorize.md).

### `_components/`
- `TxItem.tsx` — list row.
- `TransactionForm.tsx` — shared add/edit form.
- `FilterBar.tsx` — sign filter + category multiselect.

## How it works

1. **Mount `/transactions`** → `useTransactionList` reads the YYYY-MM out of
   the URL (or defaults to "now"), then loads via `dbClient.transactions.listByMonth`.
   Past months are cached in a module-level `Map`; the current month is never
   cached so a freshly added row appears instantly.
2. **Recurring generator** — once per session per day, the hook calls
   `generateDueRecurringTransactions()` from `src/lib/recurring.ts`, which
   inserts any pending occurrences and bumps `next_run_date`.
3. **Summary** — the page calls the `get_monthly_summary` RPC. Transfers are
   excluded; income vs expense vs net are rendered above the list.
4. **Add a row** — `/transactions/new` writes via `dbClient.transactions.insert`;
   navigation back to the list re-hydrates the (uncached) current month.
5. **Edit** — `/transactions/[id]` lets you change category. If the new
   category came from the user's choice and other rows in the same month share
   the description, the page offers a checkbox to apply the change to all of
   them via `updateCategoryByDescriptionInMonth`.
6. **Soft-delete** — clicking "Delete" sets `deleted_at`. A two-step confirm
   guards against fat-finger taps. All queries filter `deleted_at IS NULL`.
7. **Filtering / sorting** — done in React after fetch (the dataset is one
   month at most). Sort: date / description / amount, asc/desc. Filter: sign
   and one or more categories.
8. **Transfers section** — rows where `is_transfer = true` render in a
   collapsible footer block; they're excluded from the totals.

## Bulk actions (multi-select)

Each row on `/transactions` renders a checkbox; the sort header has a
master "select all visible" checkbox (with a tri-state indicator when
some-but-not-all rows are selected). When ≥ 1 row is selected a
floating toolbar appears at the bottom with:

- **Categorize…** — opens a modal picker; assigns the chosen category
  (or clears it).
- **Auto-categorize** — runs the AI pipeline (rules → DB history →
  configured AI provider) on the selected uncategorized rows. Reuses
  the existing `useAutoCategorize` hook so the global progress UI
  ("Categorizing 3/8…") shows up under the page header. Hidden if the
  user has no `ai_access`.
- **Subscription…** — opens a modal picker of active subscriptions;
  links every selected transaction (or unlinks).
- **Mark / Unmark transfer** — flips `is_transfer`.
- **Delete** — two-click confirm; soft-deletes every selected row.

Backed by `dbClient.transactions.bulkUpdateCategory`,
`dbClient.transactions.bulkSetTransfer`, `dbClient.transactions.bulkSoftDelete`,
and `dbClient.subscriptions.linkTransactionsBulk`. Each fires a single
SQL `UPDATE … WHERE id IN (…)`. After the action the selection clears
and the month re-loads (cache busted).

Selection clears on month change (mixing months in one bulk action would
be confusing). It survives ordinary filter/sort tweaks. The
`/transactions/new` and individual `/transactions/[id]` pages still
work as before.

## Notable details

- **Money is integer cents.** Always pass signed `amount_cents`. Negative =
  expense, positive = income.
- **Transfer flag** is the *only* way to mark internal moves; budget /
  analyst / monthly summary all exclude them. Account balance still includes
  them (because the bank does).
- **Import hash** is a stable FNV-1a-32 of `date|description|amount` made by
  the CSV importer; manual rows leave it `NULL`, so the unique constraint
  never bites them.
- **Bulk categorize on edit** — the "apply to all matching descriptions in
  this month" checkbox runs `updateCategoryByDescriptionInMonth`, which is
  case-insensitive and excludes the current row from its own update.
- **Caching** — past months are immutable in practice, so the module-level
  `Map` cache is safe. Current month is intentionally not cached.

## Permissions

`abilities.finance` (from `useAbilities()`) controls visibility / edit
buttons. Server-side, RLS enforces the same rules.
