# CSV Import

A 3-step wizard that takes a bank CSV export and turns it into transactions,
auto-detecting separator, header row, date format, and decimal locale. Dedup
is via a stable per-row hash.

## Routes

| Path      | File                          | Purpose |
|-----------|-------------------------------|---------|
| `/import` | `src/app/import/page.tsx`     | The 3-step wizard. The page also hosts a "Bank" tab — see [bank-connect](./bank-connect.md). |

## Database

Uses the standard `public.transactions` table — no dedicated schema for
import. The dedup mechanism is the existing `(account_id, import_hash)` unique
constraint set up by `supabase/fix_import_hash_constraint.sql`.

## Library — `src/lib/csv.ts`

Pure-TS, zero deps.

| Function | Purpose |
|----------|---------|
| `readFileText(file)` | UTF-8 read with ISO-8859-1 fallback for old German bank exports. |
| `detectSeparator(text)` | Picks `;`, `,`, or `\t` by frequency. |
| `detectHeaderRow(rows)` | Scores each row by hits on common keywords (Buchung, Betrag, Empfänger, …); picks the one with the most. |
| `parseCsvText(text, sep)` | RFC-4180 tokeniser (handles quoted fields with embedded commas / newlines). |
| `detectDateFormat(value)` | Returns `'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY'`. |
| `detectAmountLocale(values)` | `'de'` (comma decimal) or `'en'` (period decimal). |
| `parseDate(value, format)` | → `Date`. |
| `parseAmount(value, locale)` | → cents (signed integer). |
| `makeImportHash(date, description, amount)` | FNV-1a-32 hash, stable across runs. |
| `mapRows(rows, mapping)` | Applies a `ColumnMapping` to all rows; returns `ParsedRow[]` plus per-row errors. |

## React layer

- `src/app/import/page.tsx` — step machine. State: `step ∈ { upload, map, review }`,
  detected separator / header / formats, the `ColumnMapping`, parse errors,
  and the dedup decision per row.
- `_components/` — file picker, mapping table, review table, summary banner,
  and the bank-connect tab.

## How it works

1. **Upload step**
   - User drops or selects a `.csv` file.
   - The file is read as UTF-8 (with ISO-8859-1 fallback).
   - The page detects:
     - The most-likely separator.
     - The header row (≥ 2 keyword matches; defaults to row 0 if ambiguous).
     - Any preamble rows above the header (skipped).
   - A raw preview shows the first 10 rows so the user can sanity-check.

2. **Map step**
   - The page shows each detected column. The user picks one to be `date`,
     one `description`, one `amount`. Auto-mapping uses fuzzy keyword matches
     (`buchung` → date, `betrag` → amount, etc.).
   - Date format and amount locale are inferred from the first non-empty
     row of each column; the user can override.
   - A live "parsed preview" table shows the first 5 rows post-mapping.

3. **Review step**
   - The page calls `makeImportHash(date, description, amount)` for every
     row, then asks the DB which hashes already exist
     (`checkImportHashes`).
   - The summary banner shows: parsed N rows · M new · K duplicates · E errors.
   - The user picks the target account (single account in MVP) and
     confirms.
   - The page calls `transactionRepo.insertTransactionsBulk(inputs)` which
     upserts with `onConflict: 'account_id,import_hash'`. Existing rows are
     left untouched.

## Notable details

- **FNV-1a-32 hash.** Deterministic, no crypto overhead. Same date / desc /
  amount always produces the same hash, so re-importing the same CSV is a
  no-op.
- **Zero amounts** (running-balance lines) are silently skipped at parse
  time.
- **Empty descriptions** are flagged as errors — they reach Review with a
  red badge but don't import.
- **Encoding fallback** — UTF-8 strict first, ISO-8859-1 second. Most
  German bank exports decode correctly with the second pass.
- **Row error transparency** — the review step lists each error with its
  row number and reason; the user sees what's being skipped.
- **No background work.** Everything runs in the browser; the only network
  call is the bulk insert at the end.
- **Auto-categorize** is **not** automatically applied during import. The
  user can run [auto-categorize](./auto-categorize.md) afterwards or set up
  [categorization rules](./categorization-rules.md) and re-categorize.

## Permissions

`abilities.finance` (write). The bulk insert is RLS-checked per row.
