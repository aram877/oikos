# Backup / Restore

JSON export of every account, category, and transaction in the household —
including soft-deleted rows — plus a validating restore that swaps your
current data for the file's contents. The format is versioned so future
schema changes can detect old backups.

## Files

| File | Purpose |
|------|---------|
| `src/db/backup/exportBackup.ts`    | `exportAllForBackup`, `buildBackupFile`, `downloadBackupJson`. |
| `src/db/backup/restoreBackup.ts`   | `restoreBackup(raw)` — validates, soft-deletes existing rows, upserts the new ones in batches. |
| `src/db/backup/validateBackup.ts`  | `validateBackup(raw)` — structural + invariant checks. |
| `src/db/types.ts`                  | `BackupFile`, `BackupContents`, `BackupMetadata`, `ValidationResult`, the `BACKUP_VERSION` constant. |
| `src/app/settings/page.tsx`        | UI: download button + file picker. |
| `src/app/settings/_hooks/useMigration.ts` | Drives the import flow with progress tracking. |

## File shape

```json
{
  "version": 1,
  "exported_at": "2026-05-04T10:33:00Z",
  "app_version": "0.1.0",
  "schema_version": 1,
  "contents": {
    "accounts":     [{ "id": "...", "name": "Smith household", "currency": "EUR", "created_at": "...", "deleted_at": null }],
    "categories":   [{ "id": "...", "account_id": "...", "name": "Groceries", "parent_id": null, "created_at": "...", "deleted_at": null }],
    "transactions": [{ "id": "...", "account_id": "...", "category_id": "...", "amount_cents": -1290, "currency": "EUR", "date": "2026-04-30", "description": "REWE", "notes": null, "import_hash": "...", "is_transfer": false, "created_at": "...", "updated_at": "...", "deleted_at": null }]
  },
  "metadata": {
    "account_count":     1,
    "category_count":    12,
    "transaction_count": 480,
    "date_range": { "earliest": "2025-01-02", "latest": "2026-04-30" }
  }
}
```

`BACKUP_VERSION` is a constant in `types.ts` — bump when the shape changes
incompatibly. The validator rejects files whose version doesn't match.

## Export

`buildBackupFile()`:
1. Resolves the active account.
2. Loads all rows (**including soft-deleted**) via repository helpers
   scoped to that account.
3. Builds the metadata block (counts, earliest / latest non-deleted
   transaction date).
4. Returns a `BackupFile`.

`downloadBackupJson()` wraps the above in a `Blob` and triggers a browser
download as `oikos-backup-<timestamp>.json`.

## Validate

`validateBackup(raw)` checks:
- `version === BACKUP_VERSION`.
- Required keys exist and are arrays.
- Each row has the right shape (uuid, integer cents, valid YYYY-MM-DD date,
  …).
- Returns `{ valid, errors }` — first failure stops the walk; the UI prints
  every error.

The validator does **not** check referential integrity (e.g.
`category_id` exists). That's enforced by Supabase at upsert time.

## Restore

`restoreBackup(raw)`:
1. Validate.
2. Soft-delete every existing row in the active account (accounts,
   categories, transactions) so ids from the backup don't collide.
3. Upsert in batches of 500 per table — accounts first, categories next,
   transactions last (FK order).
4. Surface progress via the `useMigration` hook.
5. On success, set a flag in `auth.user.user_metadata` so the UI knows the
   one-time "import your data" banner shouldn't show again.

## Notable details

- **Soft-deleted rows are included** in the export — the format is
  *complete*, not just current. Importing brings them back as
  soft-deleted.
- **Restore is destructive.** No merge or conflict resolution; everything
  in the active account gets soft-deleted before the new rows land. The UI
  asks for confirmation.
- **Batch size 500** keeps each request comfortably under Supabase's
  request size limit.
- **Partial failures aren't rolled back.** If a chunk fails midway, the
  account is in a half-restored state. The migration hook surfaces the
  error so the user can re-run.
- **`is_transfer` is preserved.** The flag is part of the transaction row
  and round-trips intact.
- **Version bump procedure.** When the shape changes incompatibly:
  1. Bump `BACKUP_VERSION` in `types.ts`.
  2. Update `validateBackup` to accept the new shape (and reject older
     ones, or write a migration step).
  3. Update `buildBackupFile` to emit the new shape.
