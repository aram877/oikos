import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import { MIGRATIONS } from './migrations/index'
import { exportAllForBackup } from './backup/exportBackup'
import { BACKUP_VERSION } from './types'
import { now } from './queryUtils'

const BACKUP_DIR = 'finance-tracker-backups'

/**
 * Writes a pre-migration backup to a separate OPFS subdirectory.
 *
 * Uses navigator.storage.getDirectory() (async OPFS API) rather than
 * the SAHPool VFS so the backup lands outside the pool's managed files.
 *
 * Throws if the write fails — callers must block the migration in that case.
 */
async function writePreMigrationBackup(
  db: OpfsSAHPoolDatabase,
  fromVersion: number,
  toVersion: number,
): Promise<void> {
  const payload = exportAllForBackup(db)
  const backup = {
    version: BACKUP_VERSION,
    exported_at: now(),
    app_version: '0.1.0',
    schema_version: fromVersion,
    contents: payload,
    metadata: {
      pre_migration: true,
      migrating_to: toVersion,
    },
  }
  const json = JSON.stringify(backup)

  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(BACKUP_DIR, { create: true })
  const filename = `pre-migration-v${fromVersion}-to-v${toVersion}-${Date.now()}.json`
  const fh = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(json)
  await writable.close()
}

/**
 * Reads the current schema version from SQLite's PRAGMA user_version.
 * Returns 0 on a brand-new (empty) database.
 */
function getSchemaVersion(db: OpfsSAHPoolDatabase): number {
  const rows = db.exec('PRAGMA user_version', {
    returnValue: 'resultRows',
    rowMode: 'array',
  }) as number[][]
  return rows[0]?.[0] ?? 0
}

/**
 * Sets PRAGMA user_version inside an already-open transaction.
 * SQLite requires the version to be a literal integer in the statement.
 */
function setSchemaVersion(db: OpfsSAHPoolDatabase, version: number): void {
  // PRAGMA user_version = ? does not accept bind parameters — interpolate directly.
  // `version` is always a number from our MIGRATIONS array, never user input.
  db.exec(`PRAGMA user_version = ${version}`)
}

/**
 * Runs all pending migrations against an open database connection.
 *
 * Behaviour:
 * 1. Reads current schema version via PRAGMA user_version.
 * 2. Filters MIGRATIONS to those with version > current.
 * 3. If any migrations are pending AND the database is non-empty (version > 0),
 *    writes a pre-migration backup. Throws if the backup fails — this blocks
 *    the migration to protect existing data.
 * 4. Applies each pending migration inside its own SQLite transaction.
 *    Updates PRAGMA user_version inside the same transaction.
 * 5. Enables PRAGMA foreign_keys = ON after all migrations complete.
 *
 * Must be called from a Web Worker (OPFS + SAHPool are Worker-only).
 * Must be awaited before any repository calls.
 */
export async function runMigrations(db: OpfsSAHPoolDatabase): Promise<void> {
  // Enable foreign-key enforcement for this connection.
  db.exec('PRAGMA foreign_keys = ON')

  const currentVersion = getSchemaVersion(db)
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  )

  if (pending.length === 0) return

  const targetVersion = pending[pending.length - 1].version

  // Write a pre-migration backup before touching the schema.
  // Skip on a fresh database (version 0) — there is nothing to lose yet.
  if (currentVersion > 0) {
    try {
      await writePreMigrationBackup(db, currentVersion, targetVersion)
    } catch (err) {
      throw new Error(
        `[migrate] Pre-migration backup failed — migration BLOCKED to protect your data.\n` +
          `  Current schema version : ${currentVersion}\n` +
          `  Target schema version  : ${targetVersion}\n` +
          `  Backup error           : ${err instanceof Error ? err.message : String(err)}\n` +
          `\n` +
          `Remediation options:\n` +
          `  1. Check available storage (Settings > Privacy > Site data).\n` +
          `  2. Export your data manually via the backup button, then reload.\n` +
          `  3. If storage is full, clear other site data and retry.\n`,
      )
    }
  }

  // Apply each pending migration in its own transaction.
  for (const migration of pending) {
    db.exec('BEGIN')
    try {
      migration.run(db)
      setSchemaVersion(db, migration.version)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(
        `[migrate] Migration to version ${migration.version} failed and was rolled back.\n` +
          `  Error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
