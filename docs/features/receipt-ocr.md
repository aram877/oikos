# Receipt OCR (AI auto-fill)

Snap a photo of a receipt — or drop a PDF — and Claude vision extracts the
merchant, amount, and date, then opens a pre-filled new-transaction form.
On save, the transaction is created **and** the original file is attached
as a [receipt](./receipts.md), so the row lands fully tagged with no typing.

> Provider: Claude only in MVP. Groq doesn't yet expose vision for the
> models we use, and Ollama vision models aren't reliable enough for cents-
> level extraction. The "Scan" button is hidden when the active provider
> isn't Claude or no API key is set.

## Routes / API

| Method | Path                        | File |
|--------|-----------------------------|------|
| client | `/transactions`             | "Scan" button next to "+ Add" launches the modal. |
| POST   | `/api/ai/scan-receipt`      | `src/app/api/ai/scan-receipt/route.ts` — multipart upload, forwards to Claude vision. |

## Server endpoint

`src/app/api/ai/scan-receipt/route.ts`

- Accepts `multipart/form-data` with a `file` field. Image (JPEG / PNG /
  WEBP / GIF) or PDF, ≤ 10 MB.
- Reads the user's Claude API key from the `Authorization: Bearer …`
  header (same pattern as `/api/ai/categorize` and `/api/ai/analyze`).
- Builds a single Anthropic `messages` request with two content blocks:
  the file (as `image` for images, `document` for PDFs, both inline
  base64) and the strict-JSON prompt.
- Parses the model reply: regex-extracts the first `{…}` block and runs
  `JSON.parse`. Each field is type-checked and shape-validated before
  being returned. Unconfident fields → `null`.
- Returns `{ result: { merchant, amount_cents, date, currency }, model }`
  or `{ error: "…" }` on failure.

The prompt locks the schema to four fields, instructs the model to use
the **grand total** (after tax / discounts), and requires `null` for
unsure values rather than a guess.

## Client lib — `src/lib/scanReceipt.ts`

`scanReceipt(file: File): Promise<ScanReceiptResult>`

- Reads `aiConfig` from localStorage.
- Throws a `ScanReceiptError` if the provider isn't Claude or the API
  key is missing — message is user-readable and routed to Settings.
- Otherwise sends the file via `FormData` to the proxy and returns the
  parsed extraction.

## React layer

### `src/app/transactions/_components/ScanReceiptModal.tsx`

A four-phase modal:

1. **`pick`** — drag-and-drop / file picker with file-type chip.
2. **`scanning`** — spinner + "Reading receipt…" status; the file is
   forwarded to the server proxy. Esc / outside-click is disabled
   here so the user can't half-cancel the upload.
3. **`review`** — pre-filled form: merchant → description, amount,
   date, category, account. A small thumbnail preview of the image is
   shown alongside (no preview for PDFs). A checkbox toggles "Attach
   the original file as a receipt" (default on).
4. **`saving`** — inserts the transaction; if "attach" is on, calls
   `dbClient.receipts.insert(tx.id, file)` so the original PDF / photo
   is filed with the transaction. Non-fatal if the receipt upload fails
   (the transaction is already saved).

On success, the parent's `onSaved` callback is invoked (so the list
reloads), the modal closes, and the page navigates to the month the
transaction belongs to.

### `/transactions` button

A small primary-tinted "Scan" pill appears next to "+ Add" only when:
- AI provider is Claude AND a Claude API key is configured.
- User has `ai_access` write AND `finance_access` write.

This keeps the button out of the way for read-only members and for
anyone who hasn't set up Claude.

## Permissions / gating

| Action | Required |
|--------|----------|
| See "Scan" button | `ai_access = 'write'` AND `finance_access = 'write'` AND provider = Claude |
| POST to `/api/ai/scan-receipt` | the user's own Claude key (no server-side auth gate beyond that) |
| Insert the resulting transaction | RLS: `finance_access = 'write'` |
| Attach the file as a receipt | RLS: `finance_access = 'write'` |

## Limits

- **10 MB per file** (matches the receipts bucket cap).
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`,
  `image/gif`, `application/pdf`.
- **Vision models**: any of `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`,
  `claude-opus-4-6`. Defaults to Haiku for cost. The configured model in
  Settings is used as-is.

## Notable details

- **Inline base64, not signed URLs.** The `receipts` Storage bucket is
  private; Anthropic can't fetch from it directly. The file is sent
  inline and the server doesn't keep a copy — only the resulting
  transaction + the user's own subsequent attach call store anything.
- **Strict-JSON prompt + defensive parse.** The model occasionally
  wraps JSON in code fences or adds prose; the regex grabs the first
  `{…}` block and per-field type guards drop anything malformed.
- **Currency is parsed but unused.** EUR is hard-coded throughout the
  app today; the field is captured for future multi-currency support.
- **No automatic categorization** in MVP. Once the transaction is
  saved you can run [auto-categorize](./auto-categorize.md) on it
  (single-row or via [bulk actions](./transactions.md#bulk-actions-multi-select)),
  or rely on a [categorization rule](./categorization-rules.md) that
  matches the merchant.
- **No automatic subscription linking** in MVP. Same story — the
  [subscription matcher](./subscriptions.md) will tag it on the next
  "Apply patterns" pass, or you can link it manually from the
  transaction edit page.
- **Server doesn't persist the file.** It's read into a `Uint8Array`,
  base64-encoded, sent to Anthropic, then GC'd. The only persistence
  happens client-side after the user reviews and saves.
