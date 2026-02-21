import type { OpfsSAHPoolDatabase, SqlValue } from '@sqlite.org/sqlite-wasm'

/**
 * Execute a read query and return all rows as plain objects.
 * All repos use this instead of repeating the resultRows pattern.
 */
export function execRead(
  db:   OpfsSAHPoolDatabase,
  sql:  string,
  bind: ReadonlyArray<string | number | null> = [],
): Record<string, SqlValue>[] {
  const resultRows: Record<string, SqlValue>[] = []
  db.exec({ sql, bind, rowMode: 'object', resultRows })
  return resultRows
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE).
 * Returns rows only when the statement has a RETURNING clause.
 */
export function execWrite(
  db:   OpfsSAHPoolDatabase,
  sql:  string,
  bind: ReadonlyArray<string | number | null> = [],
): Record<string, SqlValue>[] {
  const resultRows: Record<string, SqlValue>[] = []
  db.exec({ sql, bind, rowMode: 'object', resultRows })
  return resultRows
}

/** ISO-8601 datetime string for "right now". */
export function now(): string {
  return new Date().toISOString()
}

/** Generate a UUID. Available in all browsers that support OPFS. */
export function uuid(): string {
  return crypto.randomUUID()
}
