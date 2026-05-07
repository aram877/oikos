# Yearly Overview

A 12-month income / expenses / net table for one calendar year, with click-
through to that month in `/transactions`.

## Routes

| Path      | File                          | Purpose |
|-----------|-------------------------------|---------|
| `/yearly` | `src/app/yearly/page.tsx`     | Year view with prev / next navigation, totals card, "Auto-categorize all" button. |

## Database

No dedicated schema. Reads `transactions` for the year via
`listByDateRange(YYYY-01-01, YYYY+1-01-01)`.

## Repository — `src/db/repositories/transactionRepo.ts`

Reuses `listByDateRange(startDate, endDate, accountId?)`.

## React layer

- `src/app/yearly/_hooks/useYearly.ts` — loads the full year, calls the
  pure-TS `buildYearlySummary()`, returns `{ months, totals, status }`.
  Maintains the selected year and exposes `prev` / `next`.
- `src/app/yearly/page.tsx` — net-worth flow card on top, 12-row table
  below, year navigation buttons, an "Auto-categorize all" button that
  reuses the auto-categorize hook scoped to the year's transactions.

## How it works

1. The hook loads all transactions in `[YYYY-01-01, YYYY+1-01-01)` in a
   single `listByDateRange` call.
2. `buildYearlySummary()` iterates the rows once:
   - Skips `is_transfer = true` rows entirely.
   - Buckets by month (`tx.date.slice(0, 7)`) — pure string slice, no
     timezone math.
   - Sums positive amounts as income, negative as expense, computes net per
     month.
3. The result is an array of 12 rows (Jan–Dec), regardless of whether each
   month has data; empty months render with reduced opacity.
4. Clicking a month navigates to `/transactions?month=YYYY-MM`.
5. **Year navigation** — `next` is disabled once you reach the current year.
6. **Auto-categorize all** — invokes the same AI batch as the transactions
   page, scoped to the year's uncategorized rows. See
   [auto-categorize](./auto-categorize.md).

## Notable details

- **Transfers excluded** — same convention as monthly summary and budgets.
- **Month labels are hard-coded English** (`Jan`, `Feb`, …). No i18n yet.
- **Date parsing is `tx.date.slice(0, 7)`** — works because `date` is a
  YYYY-MM-DD string, not a JS Date. Avoids the all-timezones-are-pain
  question.
- **Cheap.** One round-trip per year change; results held in component
  state (no module-level cache).
