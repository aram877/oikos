import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type { BackupFile } from '../types'
import { validateBackup } from './validateBackup'

/**
 * Restores a backup into the database.
 *
 * Strategy: destructive replace within a single transaction.
 * - Deletes all rows from all tables (hard delete — this is a restore operation).
 * - Re-inserts all rows from the backup in dependency order:
 *   accounts → categories → transactions.
 * - Rolls back if anything fails, leaving the existing data intact.
 *
 * IMPORTANT: This is an irreversible operation that replaces all local data.
 * The caller (Worker handler) must prompt the user for explicit confirmation
 * before calling this function.
 *
 * Must be called from within a Web Worker (SQLite is Worker-only).
 *
 * @throws If validation fails or any SQL statement errors.
 */
export function restoreBackup(db: OpfsSAHPoolDatabase, raw: unknown): void {
  const validation = validateBackup(raw)
  if (!validation.valid) {
    throw new Error(
      `[restore] Backup validation failed:\n  - ${validation.errors.join('\n  - ')}`,
    )
  }

  const backup = raw as BackupFile
  const { accounts, categories, transactions } = backup.contents

  db.exec('BEGIN')
  try {
    // Clear in reverse dependency order to avoid FK constraint violations.
    db.exec('DELETE FROM transactions')
    db.exec('DELETE FROM categories')
    db.exec('DELETE FROM accounts')

    // Restore accounts.
    for (const a of accounts) {
      db.exec({
        sql: `INSERT INTO accounts (id, name, currency, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?)`,
        bind: [a.id, a.name, a.currency, a.created_at, a.deleted_at ?? null],
      })
    }

    // Restore categories (parent_id may reference other categories — same-table FK).
    // All rows are inserted in created_at order (exported that way), so parents
    // arrive before children assuming they were created first — which is always true.
    for (const c of categories) {
      db.exec({
        sql: `INSERT INTO categories (id, name, parent_id, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?)`,
        bind: [c.id, c.name, c.parent_id ?? null, c.created_at, c.deleted_at ?? null],
      })
    }

    // Restore transactions.
    for (const t of transactions) {
      db.exec({
        sql: `INSERT INTO transactions
                (id, account_id, category_id, amount_cents, currency, date,
                 description, notes, import_hash, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          t.id,
          t.account_id,
          t.category_id ?? null,
          t.amount_cents,
          t.currency,
          t.date,
          t.description,
          t.notes ?? null,
          t.import_hash ?? null,
          t.created_at,
          t.updated_at,
          t.deleted_at ?? null,
        ],
      })
    }

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw new Error(
      `[restore] Restore failed and was rolled back. Your existing data is intact.\n` +
        `  Error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
