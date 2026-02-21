import init, {
  type Sqlite3Static,
  type SAHPoolUtil,
  type OpfsSAHPoolDatabase,
} from '@sqlite.org/sqlite-wasm'

/**
 * The production database filename in OPFS.
 * Changing this abandons any existing data (use migrations to rename).
 */
const DB_FILENAME = '/finance-tracker.db'

let _db: OpfsSAHPoolDatabase | null = null

/**
 * Opens the persistent SQLite database via WASM + OPFS SAHPool VFS.
 *
 * MUST be called from inside a Web Worker — OPFS FileSystemSyncAccessHandle
 * is a Worker-only API. Calling this on the main thread will throw.
 *
 * Safe to call multiple times: subsequent calls return the cached connection.
 */
export async function openDb(): Promise<OpfsSAHPoolDatabase> {
  if (_db) return _db

  const sqlite3: Sqlite3Static = await init()

  const sahPool: SAHPoolUtil = await sqlite3.installOpfsSAHPoolVfs({
    // CRITICAL: false = preserve data across reloads.
    // true would wipe the database on every Worker spawn.
    clearOnInit:     false,
    // SQLite needs extra handles for WAL + journal files alongside the main DB.
    initialCapacity: 6,
  })

  _db = new sahPool.OpfsSAHPoolDb(DB_FILENAME)
  return _db
}

/**
 * Returns the open DB connection.
 * Throws if openDb() has not been called and awaited yet.
 * Repos call this to get the DB handle synchronously.
 */
export function getDb(): OpfsSAHPoolDatabase {
  if (!_db) {
    throw new Error(
      'Database is not open. Ensure openDb() has been awaited before calling getDb().',
    )
  }
  return _db
}
