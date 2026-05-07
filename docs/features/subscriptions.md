# Subscriptions

Track recurring services (Netflix, Spotify, gym, insurance) with adjustable
matching for the awkward real-world cases — most notably **aggregator
descriptions** like `APPLE.COM/BILL` or `GOOGLE *NETFLIX` that hide what
service is actually being charged.

The feature has three pieces:

1. **Subscriptions** — the service itself (name, cadence, expected amount, …).
2. **Match patterns** (n per subscription) — `description_contains` plus
   optional amount bounds. Multiple patterns let you cover both "direct"
   bills and aggregator bills. Narrowing by amount disambiguates an
   aggregator that bills for many subscriptions.
3. **Manual override** — `transactions.subscription_id` is settable from the
   transaction edit page regardless of patterns.

## Routes

| Path                        | File                                            | Purpose |
|-----------------------------|-------------------------------------------------|---------|
| `/subscriptions`            | `src/app/subscriptions/page.tsx`                | List with monthly-spend rollup, an active section, a collapsible cancelled section, and an inline "+ Add" dialog. |
| `/subscriptions/[id]`       | `src/app/subscriptions/[id]/page.tsx`           | Detail / edit form, match-pattern editor, "apply patterns to past 12 months" backfill, linked-transactions history, soft-delete confirm. |

A picker (`SubscriptionPicker`) is also mounted on the transaction edit
page, with a one-click shortcut to save a match pattern from the picked
transaction.

## Database

### `public.subscriptions`
Defined in `supabase/add_subscriptions.sql`.

| Column                  | Type        | Notes |
|-------------------------|-------------|-------|
| `id`                    | uuid PK     | |
| `account_id`            | uuid FK     | → `accounts.id` (cascade) |
| `name`                  | text        | 1..120 chars |
| `vendor`                | text?       | optional ("Netflix Inc") |
| `category_id`           | uuid FK?    | → `categories.id` (set null on category delete) |
| `expected_amount_cents` | int?        | typical bill (signed; usually negative) |
| `cadence`               | enum        | `weekly | biweekly | monthly | quarterly | yearly` |
| `notes`                 | text?       | |
| `started_on`            | date?       | |
| `cancelled_on`          | date?       | NULL = active |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**RLS**
- SELECT: members with `finance_access ∈ {read, write}`.
- INSERT / UPDATE: members with `finance_access = 'write'`.

### `public.subscription_match_patterns`

| Column                 | Type        | Notes |
|------------------------|-------------|-------|
| `id`                   | uuid PK     | |
| `subscription_id`      | uuid FK     | → `subscriptions.id` (cascade) |
| `description_contains` | text        | substring match, case-insensitive |
| `amount_min_cents`     | int?        | NULL = no lower bound |
| `amount_max_cents`     | int?        | NULL = no upper bound |
| `created_at`           | timestamptz | |

**RLS** — same gating as the parent subscription.

### `public.transactions.subscription_id` (new column)

Nullable FK on the existing `transactions` table. The matcher / user
populates this. Index `transactions_subscription_idx` covers the lookup
used by the spend RPC and the linked-transactions list.

### RPC

```
get_subscription_spend(p_account_id, p_start_date, p_end_date)
  → { subscription_id, total_cents, charge_count, last_charged_on }[]
```

One round-trip rollup of charges in a window. Used by the list page's
30-day spend column.

## Matcher — `src/lib/subscriptionMatcher.ts`

Pure-TS, deterministic.

- `matchSubscription(patterns, { description, amount_cents }) → string | null`
- Specificity ranking (most → least): both bounds set → narrower range →
  longer `description_contains` → older `created_at` (stable tiebreak).
- This **first-match-wins-by-specificity** ordering is what makes the
  Apple/Google aggregator case work. A pattern of
  `(description_contains: "APPLE.COM/BILL", amount_min: 1599, amount_max: 1599)`
  beats a generic `(description_contains: "APPLE.COM/BILL")` matched against
  the same row because it has both bounds set with a narrower range.

`suggestedAmountRange(amountCents)` returns `± 50¢` around the absolute
amount. Used by the picker's "save a pattern from this row" shortcut.

## Repository — `src/db/repositories/subscriptionsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listSubscriptions()` | Active rows, active-first. |
| `getSubscription(id)` | Single row. |
| `insertSubscription(input)` / `updateSubscription` / `softDeleteSubscription` | CRUD. |
| `listPatterns(subscriptionId)` | Patterns for one subscription. |
| `listAllPatternsForAccount()` | All patterns across the account (used for whole-account matching passes). |
| `insertPattern` / `deletePattern` | Pattern CRUD. |
| `linkTransaction(txId, subId | null)` | Manual link or unlink. |
| `linkTransactionsBulk(txIds, subId)` | Used by "apply to past 12 months". |
| `listTransactionsForSubscription(id)` | History of linked rows for the detail page. |
| `getSpendRollup(start, end)` | Calls the spend RPC for the list page. |

Exposed on `dbClient.subscriptions`.

## React layer

### Hooks

- `_hooks/useSubscriptions.ts` — list page driver. Loads subscriptions +
  30-day spend rollup in parallel.
- `_hooks/useSubscriptionDetail.ts` — detail page driver. Loads the row,
  patterns, and linked-transaction history. Exposes `update`, `addPattern`,
  `removePattern`, `softDelete`.

### Components

- `subscriptions/page.tsx` — list. Estimated total monthly spend banner,
  active section, collapsible cancelled section, "+ Add" dialog.
- `subscriptions/[id]/page.tsx` — detail. Sections: Details (name, vendor,
  amount, cadence, category, cancelled-on, notes), Match patterns,
  Linked transactions history, Danger zone.
- `transactions/_components/SubscriptionPicker.tsx` — dropdown on the
  transaction edit page; picking a subscription stores the link and offers
  a one-click "save match pattern from this transaction" prompt
  (description prefix + ±50¢ amount range).

## How it works

1. **Create a subscription.** From `/subscriptions`, "+ Add" → name +
   amount + cadence. Saved immediately.
2. **Add match patterns.** From the detail page, add one or more patterns.
   Example for Netflix:
   - `description_contains: "NETFLIX"` (any amount).
   - `description_contains: "APPLE.COM/BILL"`, `amount_min: 1599`,
     `amount_max: 1599` — narrows the aggregator to a specific amount.
3. **Apply to past 12 months.** "Apply patterns…" button on the detail
   page pulls the year of transactions, filters out transfers and rows
   already linked, runs the matcher against this subscription's
   patterns only, and bulk-links the matches.
4. **Manual link from a transaction.** Open `/transactions/[id]`,
   pick a subscription from the dropdown. The link is set immediately.
   The picker offers a checkbox to save a match pattern from that
   transaction (description prefix + ±50¢ amount range) so future
   similar rows auto-link.
5. **Display.** The list page shows estimated monthly spend (cadence
   normalized to per-month: `weekly = 52/12`, `quarterly = 1/3`, etc.)
   plus per-subscription 30-day charge count and last-charged date from
   the spend RPC.

## Adjustability — what the user can change

- **Multiple match patterns per subscription.** Add or remove patterns at
  any time; deleted patterns don't unlink existing transactions.
- **Manual link/unlink.** Set `transactions.subscription_id` from the
  edit page, regardless of patterns. Manual links survive pattern changes.
- **Variable amounts.** Patterns support amount ranges, not just exact.
- **Cadence change.** Edit the cadence anytime — display recomputes.
- **Cancelled-on.** Set the cancelled date to push a subscription into
  the collapsible "Cancelled" section without deleting it. Linked
  transactions are kept.
- **Soft delete.** Removes from the list but keeps the row (so historical
  transactions retain their `subscription_id`). The FK on
  `transactions.subscription_id` uses `ON DELETE SET NULL`, so even a
  hard delete (account cascade) doesn't break transactions.

## Notable details

- **Aggregator handling.** This is the key reason for multiple patterns.
  Apple Pay aggregates many subscriptions under one description; the only
  way to disambiguate them is amount. The matcher's specificity ranking
  ensures narrower-amount patterns win.
- **First-match-wins-by-specificity** — different from categorization
  rules (which are first-match-wins-by-creation-order). Required because
  multiple patterns *will* match the aggregator row; we need the most
  specific one.
- **Manual override is not stored separately.** A user-set link looks
  identical to a matcher-set link in the DB. If the user wants to *un*link,
  they pick "Not a subscription" from the dropdown.
- **No realtime.** Subscriptions and patterns aren't published to
  realtime — low-frequency edits, the list reloads on mount and after
  mutations.
- **No automatic re-scan on import.** CSV / bank imports don't auto-link
  to subscriptions in MVP. The user runs "Apply patterns to past 12
  months" after an import, or links rows manually.
- **Cadence normalisation.**
  ```
  weekly    → 52/12 ≈ 4.33 charges/month
  biweekly  → 26/12 ≈ 2.17
  monthly   → 1
  quarterly → 1/3   ≈ 0.33
  yearly    → 1/12  ≈ 0.083
  ```

## Permissions

| Action | Required |
|--------|----------|
| View subscriptions / patterns | `finance_access ∈ {read, write}` |
| Create / edit / delete | `finance_access = 'write'` |
| Link a transaction | `finance_access = 'write'` (the field is on the `transactions` table) |

## Bootstrap (fresh project)

Apply `supabase/add_subscriptions.sql` (or the regenerated
`supabase/full_schema.sql`).
