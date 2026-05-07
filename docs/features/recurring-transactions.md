# Recurring Transactions

Templates that auto-generate transactions on a weekly / biweekly / monthly /
yearly schedule. The generator is **client-side** and runs once per session
per day when you visit `/transactions`.

## Routes

| Path         | File                              | Purpose |
|--------------|-----------------------------------|---------|
| `/recurring` | `src/app/recurring/page.tsx`      | Manage templates: create, pause / resume, delete. |

## Database

### `public.recurring_transactions`
Defined in `supabase/add_recurring_transactions.sql`.

| Column           | Type        | Notes |
|------------------|-------------|-------|
| `id`             | uuid PK     | |
| `account_id`     | uuid FK     | → `accounts.id` |
| `category_id`    | uuid FK?    | optional |
| `description`    | text        | non-empty |
| `notes`          | text?       | |
| `amount_cents`   | int         | signed |
| `is_transfer`    | bool        | propagated to generated rows |
| `frequency`      | enum        | `'weekly' | 'biweekly' | 'monthly' | 'yearly'` |
| `start_date`     | date        | first run |
| `next_run_date`  | date        | the next date the generator should fire |
| `end_date`       | date?       | optional last run; generator stops past this |
| `paused`         | bool        | true = skipped by the generator |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**Indexes**
- Partial `(account_id, next_run_date)` where `deleted_at IS NULL AND paused = false`.

**RLS** — Account members manage their account's templates.

## Repository — `src/db/repositories/recurringTransactionsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listRecurring()` | All active templates, ordered by `next_run_date`. |
| `listDue(today)` | Unpaused, non-deleted templates with `next_run_date <= today`. |
| `insertRecurring(input)` | Create; sets `next_run_date = start_date`. |
| `updateRecurring(id, partial)` | Update fields; supports toggling `paused` and bumping `next_run_date`. |
| `softDeleteRecurring(id)` | Set `deleted_at`. |

Exposed on `dbClient.recurringTransactions` as `list`, `listDue`, `insert`,
`update`, `softDelete`.

## Generator — `src/lib/recurring.ts`

`generateDueRecurringTransactions()`:
1. Reads `today` (YYYY-MM-DD, local).
2. Queries `listDue(today)`.
3. For each template, loops from `next_run_date` to `today` in `frequency`
   increments using a small `advanceDate(date, frequency)` helper. Monthly /
   yearly respect calendar boundaries (e.g. Jan 31 → Feb 28/29).
4. Skips iterations past `end_date`.
5. For each iteration, inserts a transaction (description, amount_cents,
   notes, category_id, is_transfer copied from the template) with `date = runDate`.
6. After the loop, calls `updateRecurring(id, { next_run_date: <future> })`
   so the next session starts from the correct spot.

The generator is invoked from `useTransactionList`'s mount effect, gated by a
`sessionStorage` flag (`recurring_generated_<YYYY-MM-DD>`) so it runs at most
once per session per day.

## React layer

- `src/app/recurring/page.tsx` — list of templates with pause / resume / delete
  controls. Inline form to create a template (description, sign selector for
  amount, frequency, optional category, optional start date).

## How it works

1. **Create a template.** "Netflix", expense, monthly, starts 2026-01-01,
   category Entertainment. `next_run_date` is set to `start_date`.
2. **First visit to `/transactions` after that date** → the generator wakes
   up, sees `next_run_date <= today`, and inserts one transaction for each
   missed iteration (so even if the user didn't open the app for two months,
   it backfills).
3. **`next_run_date` is bumped** past `today`. The next session re-runs the
   generator only after the date rolls over.
4. **Pause / resume** — toggling `paused` simply makes the template invisible
   to `listDue`. Resuming does *not* backfill missed dates while paused; it
   resumes from the last `next_run_date`.
5. **Delete** — soft-delete; templates disappear but generated rows stay.

## Notable details

- **Once-per-session-per-day** guard prevents thrashing. The flag in
  sessionStorage isn't bulletproof across many tabs, but in practice it
  dedups well.
- **Calendar math** — `advanceDate` uses the JS `Date` API, so
  monthly + day-31 → end-of-shorter-month is the standard browser behaviour.
- **No server-side scheduler.** Pure client-side generation works for an MVP
  and avoids cron infrastructure. If users go offline for months, the next
  visit catches up.
- **End date** — generator strictly compares `runDate <= endDate`.
- **Generated rows are normal transactions** — they carry no link back to the
  template, so editing one doesn't affect the schedule.

## Permissions

`abilities.finance` (write to manage templates). Generated rows inherit the
same RLS as any other transaction.
