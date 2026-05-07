# Receipts on Transactions

Attach photos or PDFs to a transaction. Useful for tax records, warranty
proof, or just remembering what something was. Files are stored in a
**private** Supabase Storage bucket; the app issues short-lived signed URLs
to render thumbnails and full-size previews.

## Routes

UI lives inside the transaction edit page —
`src/app/transactions/[id]/page.tsx` — as a `ReceiptsSection` block. The
list page (`/transactions`) shows a small paperclip indicator on rows that
have at least one receipt.

## Database

### `public.transaction_receipts`
Defined in `supabase/add_transaction_receipts.sql`.

| Column           | Type        | Notes |
|------------------|-------------|-------|
| `id`             | uuid PK     | |
| `transaction_id` | uuid FK     | → `transactions.id` (cascade) |
| `account_id`     | uuid FK     | → `accounts.id` (cascade) |
| `storage_path`   | text        | path inside the `receipts` bucket |
| `mime_type`      | text        | e.g. `image/jpeg`, `application/pdf` |
| `size_bytes`     | int         | CHECK: `> 0 AND <= 10 MB` |
| `original_name`  | text?       | original filename for display |
| `uploaded_by`    | uuid FK?    | → `auth.users.id` (set null on user delete) |
| `created_at`     | timestamptz | |

**Indexes**
- `(transaction_id)` — primary access pattern.
- `(account_id)` — for cleanup when an account is removed.

**RLS**
- SELECT: members with `finance_access ∈ {read, write}`.
- INSERT / DELETE: members with `finance_access = 'write'`.

### Storage bucket

`receipts` — **private** (not public like `avatars`). Path convention:

```
{accountId}/{transactionId}/{uuid}.{ext}
```

Storage RLS uses the first folder segment to enforce account membership:

- **SELECT** — any member with `finance_access ∈ {read, write}`.
- **INSERT / DELETE** — any member with `finance_access = 'write'`.

### RPC

`get_receipt_counts(p_transaction_ids uuid[]) → table (transaction_id uuid, count bigint)`
returns receipt counts for a batch of transaction ids in one round-trip.
Powers the list-page paperclip badge without N+1 queries.

## Repository — `src/db/repositories/transactionReceiptsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listReceipts(transactionId)` | Loads receipt rows + a fresh signed URL for each (5-minute TTL). |
| `insertReceipt(transactionId, file)` | Validates size + MIME, uploads to storage, inserts the row. Rolls back the storage upload if the row insert fails. |
| `deleteReceipt(id)` | Deletes the storage object first, then the row. |
| `getReceiptCounts(transactionIds)` | Calls the RPC; returns `{ [txId]: count }`. |

**Constants**
- `MAX_SIZE_BYTES = 10 MB`
- `ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']`
- `SIGNED_URL_TTL_SECONDS = 300` (5 min — comfortably outlasts a render)

Exposed on `dbClient.receipts` as `list`, `insert`, `delete`, `counts`.

## React layer

### Hook — `src/app/transactions/_hooks/useReceipts.ts`

`useReceipts(transactionId)` → `{ items, status, error, upload, remove, reload }`.

- Loads on mount; reloads on transaction id change.
- `upload(file)` — single-file insert; appends to local state.
- `remove(id)` — optimistic delete with rollback if it fails.

### Components — `src/app/transactions/_components/ReceiptsSection.tsx`

One file with three exports kept private:

- **`ReceiptsSection`** — the labelled container. Renders the thumbnail
  grid (3–4 cols) plus the upload zone. Drop or click to upload; multiple
  files per drop are uploaded sequentially.
- **`Thumbnail`** — square card showing either the image (object-cover) or
  a PDF placeholder. Hover to reveal the trash button; the trash button
  has a two-step confirm (first click pulses red, second click deletes).
- **`Lightbox`** — full-screen overlay. Arrow keys / arrow buttons to
  step through, Esc to close, "Open original" link opens the signed URL
  in a new tab. Renders images inline; renders PDFs in an `<iframe>`.

The section is mounted between the transaction form and the delete row,
gated by `useAbilities().can('finance', 'write')` so read-only members see
existing receipts but no upload affordance.

### List indicator — `src/app/transactions/_components/TxItem.tsx`

Each row receives `receiptCount` (default `0`). When `> 0`, a small
paperclip glyph renders next to the category badge — and shows the count
when it's `> 1`. The count map is fetched in
`useTransactionList` via a single `dbClient.receipts.counts(ids)` call
that runs in the background after the main list load (non-blocking — the
indicator pops in once it returns).

## How it works

1. **Open `/transactions/[id]`.** `useReceipts(id)` loads the receipt
   rows for this transaction and asks Supabase Storage to issue signed
   URLs for them. The thumbnails render inline.
2. **Add a receipt.** Drop a file (or click). The hook validates size +
   MIME, picks a random uuid filename, uploads to
   `{accountId}/{transactionId}/{uuid}.{ext}` and inserts the metadata
   row. If the row insert fails (e.g. RLS violation), the storage object
   is removed so we never leak orphans.
3. **Open at full size.** Click a thumbnail → lightbox modal. Arrow keys
   to navigate between attachments; "Open original" opens the underlying
   signed URL in a new tab for download.
4. **Delete.** Click the trash icon (hover-revealed); the second click
   confirms. `deleteReceipt(id)` removes the storage object first, then
   the row — order matters so a partial failure leaves a row with no
   blob (recoverable by deleting the row) rather than a blob with no row
   (orphaned forever).
5. **List indicator.** Once the transactions list mounts, a single
   batched RPC fetches counts for every visible row. `TxItem` shows a
   paperclip + numeric badge for any row with attachments.

## Notable details

- **Private bucket → signed URLs.** Unlike avatars (public bucket), the
  receipts bucket is private; the app never holds long-lived URLs.
  Signed URLs are issued at render time with a 5-minute TTL — long enough
  that even a slow user finishes their interaction without re-signing.
- **10 MB cap.** Enforced in two places: `assertAcceptable(file)` in the
  repo and a CHECK on `size_bytes` in the table.
- **MIME allow-list.** `image/*` and `application/pdf` only. Other types
  are rejected client-side with a friendly message; storage RLS doesn't
  enforce this — adversarial uploads that bypass the client would still
  hit the `size_bytes` CHECK and the per-account RLS.
- **HEIC.** iPhones default to HEIC, which most browsers can't render.
  We accept any `image/*` MIME so the file uploads, but the thumbnail
  may fail to display until the user opens the original. Future
  improvement: client-side conversion to JPEG.
- **Upload rollback.** If the row insert fails after the storage upload
  succeeded, the storage object is deleted. Prevents orphans.
- **Soft-deleted transactions.** When a transaction is soft-deleted (sets
  `deleted_at`), its receipts stay in storage and the table — the parent
  hides them via the `deleted_at IS NULL` filter. Restoring the parent
  surfaces them again. A future cleanup job could prune blobs whose
  parents have been soft-deleted for X days.
- **Cascade on hard-delete.** If a transaction is ever hard-deleted (only
  via account cascade today), the FK `ON DELETE CASCADE` removes the
  receipt rows. Storage objects would still need a cleanup pass — they
  don't cascade.
- **List indicator is non-blocking.** The receipt-count fetch runs after
  the main list renders so adding receipts doesn't slow the
  transactions page perceptibly. The paperclip pops in a beat later.

## Permissions

| Action | Required |
|--------|----------|
| View | `finance_access ∈ {read, write}` |
| Upload | `finance_access = 'write'` |
| Delete | `finance_access = 'write'` |

Children with `finance_access = 'none'` don't see receipts — both because
the parent transaction is hidden and because the table's RLS denies SELECT.

## Bootstrap (fresh project)

Apply `supabase/add_transaction_receipts.sql` (or paste
`supabase/full_schema.sql` into a blank Supabase SQL editor — the
migration is already concatenated in chronological order via
`supabase/build_full_schema.sh`).
