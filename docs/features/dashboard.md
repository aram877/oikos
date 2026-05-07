# Dashboard

The landing page after sign-in. A monthly summary (income / spending / net /
savings rate), a 6-month sparkline, the current-month budgets, the top three
goals, and a top-7 expense category breakdown.

## Routes

| Path        | File                                 | Purpose |
|-------------|--------------------------------------|---------|
| `/`         | redirects to `/dashboard`            | (top-level page or middleware redirect) |
| `/dashboard`| `src/app/dashboard/page.tsx`         | The composite page itself. |

## Database

No dedicated schema. Reads from:
- `transactions` (current month, previous month, last 6 months)
- `budgets`, `categories`, `savings_goals`

## Reads

| Repo call | Purpose |
|-----------|---------|
| `dbClient.transactions.listByMonth(YYYY-MM)` | Current month + previous month (delta calc). |
| `dbClient.transactions.listByDateRange(start, end)` | 6-month sparkline window. |
| `dbClient.budgets.list()` | This month's caps. |
| `dbClient.savingsGoals.list()` | Top three. |
| `dbClient.categories.list()` | For the breakdown labels. |

## React layer

- `src/app/dashboard/page.tsx` — single client page. State holds the current
  / previous month rows, a 6-month sparkline series, budgets, goals, and
  category list. A module-level `Map` (`dashboardCache`) memoises *past*
  months so prev/next navigation is instant; the current month is never
  cached.
- Inline subcomponents: `SummaryCard`, `RateCard`.

## How it works

1. **On mount** it loads in parallel:
   - This month's transactions (uncached) + previous month (cached if past).
   - Last 6 months in one ranged query for the sparkline.
   - Budgets, goals, categories.
2. **Summary cards** — income, spending, net, savings rate. Income / spending
   show deltas vs the previous month. Savings rate = `net / income` (`null`
   if income == 0).
3. **Sparkline** — 6 monthly bars of absolute expense totals. Bucketed in JS
   by `date.slice(0, 7)`. Empty months → 0-height bars.
4. **Budgets** — only when viewing the current month; reuses the same
   progress-bar UI as `/budgets`.
5. **Goals** — top three by `created_at`, compact cards with progress bars.
6. **Category breakdown** — top 7 expense categories, horizontal bars sized
   by share of total expense.
7. **Month navigation** — prev/next buttons. Past-month cache hit is
   immediate; the current month is always re-fetched. Forward is disabled
   once you reach `now`.

## Notable details

- **Module-level cache.** Past months are immutable in practice, so caching
  outside React state is fine. The cache lives for the page lifetime.
- **Transfers excluded** from every calc, matching budgets / monthly summary.
- **Hard-coded six months** (`now.getMonth() - 5` … `now.getMonth() + 1`).
- **Privacy mode aware** — `Money` component is used everywhere.
- **No realtime.** Dashboard re-fetches on month change but doesn't subscribe
  to inserts; switch to `/transactions` to see live new rows.
