import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type { AccountRow, InsertAccountInput, UpdateAccountInput } from '../types'
import { execRead, execWrite, now, uuid } from '../queryUtils'

/**
 * Lists all active (non-deleted) accounts, ordered by name.
 */
export function listAccounts(db: OpfsSAHPoolDatabase): AccountRow[] {
  return execRead(
    db,
    `SELECT id, name, currency, created_at, deleted_at
     FROM accounts
     WHERE deleted_at IS NULL
     ORDER BY name`,
  ) as unknown as AccountRow[]
}

/**
 * Returns a single account by ID, or null if not found / soft-deleted.
 */
export function getAccount(
  db: OpfsSAHPoolDatabase,
  id: string,
): AccountRow | null {
  const rows = execRead(
    db,
    `SELECT id, name, currency, created_at, deleted_at
     FROM accounts
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  ) as unknown as AccountRow[]
  return rows[0] ?? null
}

/**
 * Inserts a new account and returns the created row.
 */
export function insertAccount(
  db: OpfsSAHPoolDatabase,
  input: InsertAccountInput,
): AccountRow {
  const id = uuid()
  const ts = now()
  const rows = execWrite(
    db,
    `INSERT INTO accounts (id, name, currency, created_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     RETURNING id, name, currency, created_at, deleted_at`,
    [id, input.name, input.currency, ts],
  ) as unknown as AccountRow[]
  if (!rows[0]) throw new Error(`[accountRepo] Insert failed for id ${id}`)
  return rows[0]
}

/**
 * Updates mutable fields on an account. No-op if nothing changes.
 * Returns the updated row, or null if the account was not found.
 */
export function updateAccount(
  db: OpfsSAHPoolDatabase,
  id: string,
  input: UpdateAccountInput,
): AccountRow | null {
  if (input.name === undefined) {
    return getAccount(db, id)
  }
  const rows = execWrite(
    db,
    `UPDATE accounts
     SET name = ?
     WHERE id = ? AND deleted_at IS NULL
     RETURNING id, name, currency, created_at, deleted_at`,
    [input.name, id],
  ) as unknown as AccountRow[]
  return rows[0] ?? null
}

/**
 * Soft-deletes an account by setting deleted_at.
 *
 * Note: does NOT cascade to transactions — the caller is responsible for
 * deciding what to do with orphaned transactions (e.g. soft-delete them too).
 *
 * Returns true if the row was found and deleted, false otherwise.
 */
export function softDeleteAccount(
  db: OpfsSAHPoolDatabase,
  id: string,
): boolean {
  const rows = execWrite(
    db,
    `UPDATE accounts
     SET deleted_at = ?
     WHERE id = ? AND deleted_at IS NULL
     RETURNING id`,
    [now(), id],
  )
  return rows.length > 0
}
