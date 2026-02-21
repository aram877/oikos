import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type {
  TransactionRow,
  InsertTransactionInput,
  UpdateTransactionInput,
  MonthlySummary,
  MonthlySummaryRow,
} from '../types'
import { execRead, execWrite, now, uuid } from '../queryUtils'

/** Returns all columns for a transaction row. */
const TX_COLS = `
  id, account_id, category_id, amount_cents, currency, date,
  description, notes, import_hash, created_at, updated_at, deleted_at
`

/**
 * Lists active transactions for a calendar month.
 *
 * @param yearMonth  e.g. "2025-03" — used to derive the date range [start, end).
 * @param accountId  Optional: filter to a single account.
 */
export function listByMonth(
  db: OpfsSAHPoolDatabase,
  yearMonth: string,
  accountId?: string,
): TransactionRow[] {
  const start = `${yearMonth}-01`
  // End is the first day of the next month (exclusive upper bound).
  const [year, month] = yearMonth.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`

  if (accountId) {
    return execRead(
      db,
      `SELECT ${TX_COLS}
       FROM transactions
       WHERE date >= ? AND date < ?
         AND account_id = ?
         AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`,
      [start, end, accountId],
    ) as unknown as TransactionRow[]
  }

  return execRead(
    db,
    `SELECT ${TX_COLS}
     FROM transactions
     WHERE date >= ? AND date < ?
       AND deleted_at IS NULL
     ORDER BY date DESC, created_at DESC`,
    [start, end],
  ) as unknown as TransactionRow[]
}

/**
 * Returns a single active transaction by ID, or null if not found / soft-deleted.
 */
export function getTransaction(
  db: OpfsSAHPoolDatabase,
  id: string,
): TransactionRow | null {
  const rows = execRead(
    db,
    `SELECT ${TX_COLS}
     FROM transactions
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  ) as unknown as TransactionRow[]
  return rows[0] ?? null
}

/**
 * Inserts a new transaction and returns the created row.
 */
export function insertTransaction(
  db: OpfsSAHPoolDatabase,
  input: InsertTransactionInput,
): TransactionRow {
  const id = uuid()
  const ts = now()
  const rows = execWrite(
    db,
    `INSERT INTO transactions
       (id, account_id, category_id, amount_cents, currency, date,
        description, notes, import_hash, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, NULL)
     RETURNING ${TX_COLS}`,
    [
      id,
      input.account_id,
      input.category_id ?? null,
      input.amount_cents,
      input.date,
      input.description,
      input.notes ?? null,
      input.import_hash ?? null,
      ts,
      ts,
    ],
  ) as unknown as TransactionRow[]
  if (!rows[0]) throw new Error(`[transactionRepo] Insert failed for id ${id}`)
  return rows[0]
}

/**
 * Updates mutable fields on a transaction. Always updates updated_at.
 * Returns the updated row, or null if not found.
 */
export function updateTransaction(
  db: OpfsSAHPoolDatabase,
  id: string,
  input: UpdateTransactionInput,
): TransactionRow | null {
  const sets: string[] = ['updated_at = ?']
  const bind: (string | number | null)[] = [now()]

  if (input.category_id !== undefined) {
    sets.push('category_id = ?')
    bind.push(input.category_id ?? null)
  }
  if (input.amount_cents !== undefined) {
    sets.push('amount_cents = ?')
    bind.push(input.amount_cents)
  }
  if (input.date !== undefined) {
    sets.push('date = ?')
    bind.push(input.date)
  }
  if (input.description !== undefined) {
    sets.push('description = ?')
    bind.push(input.description)
  }
  if (input.notes !== undefined) {
    sets.push('notes = ?')
    bind.push(input.notes ?? null)
  }

  bind.push(id)
  const rows = execWrite(
    db,
    `UPDATE transactions
     SET ${sets.join(', ')}
     WHERE id = ? AND deleted_at IS NULL
     RETURNING ${TX_COLS}`,
    bind,
  ) as unknown as TransactionRow[]
  return rows[0] ?? null
}

/**
 * Soft-deletes a transaction.
 * Returns true if the row was found and deleted.
 */
export function softDeleteTransaction(
  db: OpfsSAHPoolDatabase,
  id: string,
): boolean {
  const rows = execWrite(
    db,
    `UPDATE transactions
     SET deleted_at = ?
     WHERE id = ? AND deleted_at IS NULL
     RETURNING id`,
    [now(), id],
  )
  return rows.length > 0
}

/**
 * Returns an income/expense summary for a calendar month, broken down by category.
 *
 * Uses the covering index idx_tx_summary — no full table scan needed.
 *
 * @param yearMonth  e.g. "2025-03"
 * @param accountId  Optional: limit to one account.
 */
export function getMonthlySummary(
  db: OpfsSAHPoolDatabase,
  yearMonth: string,
  accountId?: string,
): MonthlySummary {
  const start = `${yearMonth}-01`
  const [year, month] = yearMonth.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`

  const accountFilter = accountId ? 'AND t.account_id = ?' : ''
  const bind: (string | number | null)[] = accountId
    ? [start, end, accountId]
    : [start, end]

  const rows = execRead(
    db,
    `SELECT
       t.category_id,
       c.name           AS category_name,
       c.parent_id,
       SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END) AS income_cents,
       SUM(CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END) AS expense_cents
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
     WHERE t.date >= ? AND t.date < ?
       AND t.deleted_at IS NULL
       ${accountFilter}
     GROUP BY t.category_id, c.name, c.parent_id
     ORDER BY expense_cents ASC`,
    bind,
  ) as unknown as MonthlySummaryRow[]

  let total_income_cents  = 0
  let total_expense_cents = 0
  for (const row of rows) {
    total_income_cents  += row.income_cents
    total_expense_cents += row.expense_cents
  }

  return {
    total_income_cents,
    total_expense_cents,
    net_cents: total_income_cents + total_expense_cents,
    by_category: rows,
  }
}
