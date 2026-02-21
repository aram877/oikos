import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type { BackupFile, BackupContents, BackupMetadata, AccountRow, CategoryRow, TransactionRow } from '../types'
import { BACKUP_VERSION } from '../types'
import { execRead, now } from '../queryUtils'

/**
 * Reads all rows from all tables (including soft-deleted) for backup.
 * Returns only the `contents` portion — caller wraps it in BackupFile.
 *
 * Synchronous: called from the Worker context where SQLite runs.
 */
export function exportAllForBackup(db: OpfsSAHPoolDatabase): BackupContents {
  const accounts = execRead(
    db,
    'SELECT id, name, currency, created_at, deleted_at FROM accounts ORDER BY created_at',
  ) as unknown as AccountRow[]

  const categories = execRead(
    db,
    'SELECT id, name, parent_id, created_at, deleted_at FROM categories ORDER BY created_at',
  ) as unknown as CategoryRow[]

  const transactions = execRead(
    db,
    `SELECT id, account_id, category_id, amount_cents, currency, date,
            description, notes, import_hash, created_at, updated_at, deleted_at
     FROM transactions
     ORDER BY date, created_at`,
  ) as unknown as TransactionRow[]

  return { accounts, categories, transactions }
}

function buildMetadata(contents: BackupContents): BackupMetadata {
  const dates = contents.transactions
    .filter((t) => t.deleted_at === null)
    .map((t) => t.date)
    .sort()
  return {
    account_count:     contents.accounts.filter((a) => a.deleted_at === null).length,
    category_count:    contents.categories.filter((c) => c.deleted_at === null).length,
    transaction_count: dates.length,
    date_range: dates.length > 0
      ? { earliest: dates[0], latest: dates[dates.length - 1] }
      : null,
  }
}

/**
 * Builds a complete BackupFile with metadata.
 * Synchronous: call from within the Worker.
 */
export function buildBackupFile(
  db: OpfsSAHPoolDatabase,
  schemaVersion: number,
): BackupFile {
  const contents = exportAllForBackup(db)
  return {
    version:        BACKUP_VERSION,
    exported_at:    now(),
    app_version:    '0.1.0',
    schema_version: schemaVersion,
    contents,
    metadata:       buildMetadata(contents),
  }
}

/**
 * Triggers a JSON file download in the browser (main-thread only).
 *
 * Usage: call this on the main thread after receiving the serialised backup
 * from the Worker via postMessage.
 *
 * @param json  The JSON string from buildBackupFile()
 * @param filename  Optional filename override
 */
export function downloadBackupJson(
  json: string,
  filename = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`,
): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
