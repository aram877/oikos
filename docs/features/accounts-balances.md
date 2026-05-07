# Accounts / Balances

Three-card overview: **Checking**, **Savings (estimated)**, and **Net worth**.
All three are *derived* from the single `transactions` table by partitioning
on the `is_transfer` flag — there are no separate "savings" or "checking"
account rows.

## Routes

| Path        | File                            | Purpose |
|-------------|---------------------------------|---------|
| `/accounts` | `src/app/accounts/page.tsx`     | Read-only summary with an explainer block. |

The dashboard embeds the same numbers in compact form.

## Database

### `public.accounts`
The shared household account. One row per household; defined in
`schema.sql`. Soft-deletable via `deleted_at`. Currency is always `EUR` in
MVP.

### Account balance RPC

`get_account_balance(p_account_id uuid) → table (cashflow_cents, transfers_cents, balance_cents)`,
defined in `supabase/add_get_account_balance_fn.sql`.

| Column            | Definition |
|-------------------|------------|
| `cashflow_cents`  | Sum of `amount_cents` where `is_transfer = false` and `deleted_at IS NULL`. The "earned − spent" net worth flow. |
| `transfers_cents` | Sum of `amount_cents` where `is_transfer = true`. Negative = money moved to savings. |
| `balance_cents`   | Sum of every non-deleted transaction. The bank-statement-equivalent checking balance. |

## Repository — `src/db/repositories/transactionRepo.ts`

`getAccountBalance(accountId?)` calls the RPC and returns
`AccountBalance` (`{ cashflow_cents, transfers_cents, balance_cents }`).

Exposed on `dbClient.transactions.getBalance()`.

## Hook — `src/hooks/useAccountBalance.ts`

`useAccountBalance()` — `{ balance, status, error }`. Loads via
`dbClient.transactions.getBalance()` on mount. Pure read.

## React layer

- `src/app/accounts/page.tsx` — three cards plus a small "how this is
  computed" block.

## How it works

1. The page mounts, `useAccountBalance` calls the RPC.
2. The three numbers map to:
   - **Net worth** = `cashflow_cents`. The most "honest" number — what
     you've actually earned minus what you've actually spent, ignoring
     internal moves.
   - **Savings (estimated)** = `-transfers_cents`. If you marked a transfer
     out of checking with a negative amount, transfers_cents is negative;
     negating it gives the savings estimate.
   - **Checking** = `balance_cents`. Includes every transaction; matches
     the bank.
3. Colour rules: net worth ≥ 0 → green / muted; < 0 → red.

## Notable details

- **No multi-bank ledger.** The MVP has a single account row per household.
  All "real" bank accounts collapse into one logical bookkeeping account,
  and savings/checking distinction is purely the `is_transfer` flag plus
  user discipline.
- **Convention.** When you move €100 from checking to a separate savings
  bank account, you record it as a single transaction with `is_transfer = true`
  and `amount_cents = -10000`. The savings card then reflects +€100.
- **Soft-delete correctness.** The RPC filters `deleted_at IS NULL`, so
  deleting / undeleting a row immediately re-derives all three balances.
- **Privacy-mode aware.** Numbers render through the `Money` component (see
  [privacy-mode](./privacy-mode.md)).
