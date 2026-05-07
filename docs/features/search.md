# Search

Global text + amount + date + category filtering across every active
transaction. Filters apply client-side after a single fetch.

## Routes

| Path      | File                          | Purpose |
|-----------|-------------------------------|---------|
| `/search` | `src/app/search/page.tsx`     | Filter bar + result list (capped at 200). |

## Database

No dedicated schema. Reads `transactions` (all active rows for the account)
and `categories` once on mount.

## Repository — `src/db/repositories/transactionRepo.ts`

`listAllActive(accountId?)` — every non-deleted transaction. The page does
the rest in JS via `useMemo`.

## React layer

- `src/app/search/page.tsx` — single client component:
  - On mount: `Promise.all([listAllActive(), categories.list()])`.
  - State: `{ query, minAmount, maxAmount, startDate, endDate, categoryId }`.
  - `useMemo` recomputes the filtered + capped list whenever inputs change.
  - Renders a sticky filter bar (text input, two amount inputs, two date
    inputs, a category dropdown) and a list of result cards.

## How it works

1. The page loads every active transaction in one fetch and holds them in
   state.
2. Filters are typed live; a `useMemo` returns the filtered subset:
   - **Text** — case-insensitive `String#includes` against `description` and
     `notes`.
   - **Amount range** — uses `Math.abs(amount_cents)`. Both bounds optional.
   - **Date range** — string compare on YYYY-MM-DD. Both optional.
   - **Category** — exact id match (top-level only in the dropdown).
3. Results are capped at 200; a footer message suggests refining if more
   matches exist.
4. The result card shows description, category, date, amount; clicking
   navigates to `/transactions/[id]`.

## Notable details

- **Client-side filtering.** Cheap up to a few thousand transactions; the
  whole month-by-month list approach means most households fit comfortably.
  For very large datasets a server-side search would be needed.
- **Absolute amount** for ranges. Same UX as budgets / rules.
- **Soft-delete is invisible.** `listAllActive` filters server-side.
- **No fuzzy search.** Substring matches only — predictable and fast.
- **No persisted filter state.** Refresh resets the bar.
