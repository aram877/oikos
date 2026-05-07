# Bank Connect (GoCardless)

Live transaction import from EU banks via GoCardless's open-banking API. A
"Bank" tab on the `/import` page proxies through Next.js API routes so the
secret never reaches the browser.

> Status: working but marked as WIP in the README.

## Routes / API

| Method  | Path                                                  | Purpose |
|---------|-------------------------------------------------------|---------|
| client  | `/import?tab=bank` (`src/app/import/_components/BankConnect.tsx`) | 7-phase UI: country → institutions → connecting → accounts → transactions → review → done. |
| GET     | `/api/gocardless/institutions?country=DE`             | Lists banks in a country. |
| POST    | `/api/gocardless/connect`                             | Creates a requisition; returns the bank's auth link + `requisition_id`. |
| GET     | `/api/gocardless/accounts?requisition_id=…`           | After bank auth, fetches accounts (IBAN, name) and the requisition status. |
| GET     | `/api/gocardless/transactions?gc_account_id=…&date_from=YYYY-MM-DD&account_id=…` | Fetches booked transactions, normalised to `InsertTransactionInput`. |

## Database

Reuses `public.transactions` and the `(account_id, import_hash)` unique
constraint. No dedicated tables.

## Library — `src/app/api/gocardless/_lib/token.ts`

| Function | Purpose |
|----------|---------|
| `gcCredentials()` | Reads `GOCARDLESS_SECRET_ID` / `_KEY`. |
| `getGCToken()` | `POST /token/new/` — fetches a fresh access token (24h validity). |
| `gcFetch(path, init?)` | Authenticated fetch wrapper for the GoCardless API. |

Token base URL: `https://bankaccountdata.gocardless.com/api/v2`.

## React layer

- `src/app/import/_components/BankConnect.tsx` — 520-line phase machine.
  - State: `phase`, country, institutions, requisition_id (also kept in
    sessionStorage so it survives the redirect to the bank), account list,
    raw transactions, parsed rows, dedup result.
  - Calls each API route in turn, with a small UI for each phase.

## How it works

1. **Pick a country.** Drop-down of EU27 + UK + Norway. The UI calls
   `/api/gocardless/institutions?country=XX`.
2. **Pick a bank.** Search-as-you-type list of institutions. Selecting one
   posts to `/api/gocardless/connect` with the institution id.
3. **Server creates a requisition.** Returns `link` (the bank auth URL) +
   `requisition_id`. The client stashes the id in `sessionStorage` and
   `window.location.assign(link)`s to the bank.
4. **User authenticates** at the bank (SSO / 2FA). The bank redirects back to
   `/import?tab=bank` with the same requisition active.
5. **Fetch accounts.** `/api/gocardless/accounts?requisition_id=…` resolves
   the requisition (status `LN` = linked), then for each linked account
   fetches `/accounts/{id}/details/` to get IBAN + name.
6. **Pick account + date range** (default last 90 days).
7. **Fetch transactions.** `/api/gocardless/transactions` calls
   `/accounts/{id}/transactions/`, walks `booked` only (skips `pending`),
   and normalises each row into `InsertTransactionInput` with
   `import_hash` = the GoCardless `transactionId` *or* a fallback
   `gc-{date}-{amount}-{desc[:40]}` if missing.
8. **Review + dedup.** The client checks hashes against the DB
   (`checkImportHashes`), shows new vs duplicates, and on confirm calls
   `transactions.insertBulk` exactly like the CSV importer.

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `GOCARDLESS_SECRET_ID` | server only | API client id. |
| `GOCARDLESS_SECRET_KEY` | server only | API secret. |
| `NEXT_PUBLIC_SITE_URL` | client | Used to build the bank-redirect URL; falls back to the request origin. |

Get credentials at <https://bankaccountdata.gocardless.com/overview/>.

## Notable details

- **Server-side proxy.** The client never sees the GoCardless secrets; all
  authenticated calls go through `/api/gocardless/*` routes, which use
  `gcFetch` server-side.
- **Requisition statuses.** `CR` (created — user hasn't auth'd), `LN`
  (linked — accounts available), `EX` (expired). The `accounts` endpoint
  surfaces this.
- **Free tier limits.** GoCardless allows 90 days of history; longer ranges
  silently truncate. Requisitions soft-expire after roughly a year, requiring
  re-auth.
- **Pending transactions are ignored** — only `booked` are imported, to avoid
  duplicates when the bank later finalises the row.
- **Fallback hash** is needed because some banks don't return
  `transactionId`. The composite is good enough to dedup re-fetches but won't
  match a CSV import of the same bank — those use a different hash recipe.
- **Token caching is not implemented**; `gcFetch` requests a fresh token per
  request. Cheap and correct for an MVP.
- **CORS.** Direct browser → GoCardless is blocked. Always go through the
  proxy.
