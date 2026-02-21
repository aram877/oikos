import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type { CategoryRow, InsertCategoryInput, UpdateCategoryInput } from '../types'
import { execRead, execWrite, now, uuid } from '../queryUtils'

/**
 * Lists all active categories.
 * Top-level categories (parent_id IS NULL) come first, then children,
 * both sorted by name within their group.
 */
export function listCategories(db: OpfsSAHPoolDatabase): CategoryRow[] {
  return execRead(
    db,
    `SELECT id, name, parent_id, created_at, deleted_at
     FROM categories
     WHERE deleted_at IS NULL
     ORDER BY parent_id IS NOT NULL, name`,
  ) as unknown as CategoryRow[]
}

/**
 * Returns a single category by ID, or null if not found / soft-deleted.
 */
export function getCategory(
  db: OpfsSAHPoolDatabase,
  id: string,
): CategoryRow | null {
  const rows = execRead(
    db,
    `SELECT id, name, parent_id, created_at, deleted_at
     FROM categories
     WHERE id = ? AND deleted_at IS NULL`,
    [id],
  ) as unknown as CategoryRow[]
  return rows[0] ?? null
}

/**
 * Inserts a new category and returns the created row.
 * Pass parent_id = null for a top-level category.
 */
export function insertCategory(
  db: OpfsSAHPoolDatabase,
  input: InsertCategoryInput,
): CategoryRow {
  const id = uuid()
  const ts = now()
  const rows = execWrite(
    db,
    `INSERT INTO categories (id, name, parent_id, created_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     RETURNING id, name, parent_id, created_at, deleted_at`,
    [id, input.name, input.parent_id ?? null, ts],
  ) as unknown as CategoryRow[]
  if (!rows[0]) throw new Error(`[categoryRepo] Insert failed for id ${id}`)
  return rows[0]
}

/**
 * Updates mutable fields on a category.
 * Returns the updated row, or null if not found.
 */
export function updateCategory(
  db: OpfsSAHPoolDatabase,
  id: string,
  input: UpdateCategoryInput,
): CategoryRow | null {
  const sets: string[] = []
  const bind: (string | null)[] = []

  if (input.name !== undefined) {
    sets.push('name = ?')
    bind.push(input.name)
  }
  if (input.parent_id !== undefined) {
    sets.push('parent_id = ?')
    bind.push(input.parent_id ?? null)
  }

  if (sets.length === 0) return getCategory(db, id)

  bind.push(id)
  const rows = execWrite(
    db,
    `UPDATE categories
     SET ${sets.join(', ')}
     WHERE id = ? AND deleted_at IS NULL
     RETURNING id, name, parent_id, created_at, deleted_at`,
    bind,
  ) as unknown as CategoryRow[]
  return rows[0] ?? null
}

/**
 * Soft-deletes a category.
 *
 * Note: does NOT cascade to transactions — orphaned transactions remain
 * with their category_id pointing to the now-deleted category.
 * The UI should treat missing categories gracefully.
 *
 * Returns true if the row was found and deleted.
 */
export function softDeleteCategory(
  db: OpfsSAHPoolDatabase,
  id: string,
): boolean {
  const rows = execWrite(
    db,
    `UPDATE categories
     SET deleted_at = ?
     WHERE id = ? AND deleted_at IS NULL
     RETURNING id`,
    [now(), id],
  )
  return rows.length > 0
}
