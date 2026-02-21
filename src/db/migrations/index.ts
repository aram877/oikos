import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import { migration_000_init } from './000_init'

/**
 * A migration transforms the database schema from version (N-1) to version N.
 *
 * Rules:
 * - `version` must be a positive integer, unique across all migrations.
 * - `run` is called inside a SQLite transaction. Do NOT begin/commit manually.
 * - After `run` completes, PRAGMA user_version is set to `version`.
 * - New migrations are appended here; the runner applies only pending ones.
 */
export interface Migration {
  version: number
  run(db: OpfsSAHPoolDatabase): void
}

/**
 * Ordered list of all schema migrations.
 * APPEND ONLY — never reorder or remove entries once shipped.
 */
export const MIGRATIONS: Migration[] = [migration_000_init]
