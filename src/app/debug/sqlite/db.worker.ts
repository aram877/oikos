/**
 * ⚠️  SPIKE — DELETE BEFORE PRODUCTION
 *
 * SQLite WASM + OPFS SAHPool proof-of-concept worker.
 *
 * What this proves:
 *   - @sqlite.org/sqlite-wasm loads its WASM binary inside a Next.js Web Worker
 *   - installOpfsSAHPoolVfs() mounts an OPFS-backed VFS (requires Worker context)
 *   - Data written to /spike.db survives full page reloads
 *
 * If the spike passes: promote the db module, repository layer, and
 * migration runner from the design in /claude/prompts/03-local-first-storage.md
 */

import init, {
  type Sqlite3Static,
  type SAHPoolUtil,
  type OpfsSAHPoolDatabase,
  type SqlValue,
} from '@sqlite.org/sqlite-wasm'

// ── Message protocol ────────────────────────────────────────────────────── //

type Method = 'init' | 'insert' | 'list'

type InMsg = {
  id:      string
  method:  Method
  args?:   string[]
}

type OutMsg = {
  id:      string
  result?: unknown
  error?:  string
}

type SpikeRow = { id: number; label: string; ts: string }

// Minimal worker-global interface.
// DedicatedWorkerGlobalScope lives in lib.webworker, which conflicts with
// lib.dom in the main tsconfig. Defining only what we use avoids the clash.
interface WorkerGlobal {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
  postMessage(data: unknown): void
}

// ── State ───────────────────────────────────────────────────────────────── //

let db: OpfsSAHPoolDatabase | null = null

// ── Message handler ─────────────────────────────────────────────────────── //

const ctx = self as unknown as WorkerGlobal

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, method, args = [] } = e.data

  try {
    let result: unknown

    if      (method === 'init')   result = await initDb()
    else if (method === 'insert') result = insertRow(args[0] ?? 'unnamed')
    else if (method === 'list')   result = listRows()
    else throw new Error(`Unknown method: ${method}`)

    ctx.postMessage({ id, result } satisfies OutMsg)
  } catch (err) {
    ctx.postMessage({ id, error: String(err) } satisfies OutMsg)
  }
}

// ── DB initialisation ───────────────────────────────────────────────────── //

async function initDb(): Promise<string> {
  if (db) return 'already-open'

  // webpack (asyncWebAssembly: true) resolves the .wasm binary automatically.
  // If this line throws "WASM load failed", run: node scripts/copy-wasm.mjs
  const sqlite3: Sqlite3Static = await init()

  // SAHPool VFS: uses OPFS FileSystemSyncAccessHandle (Worker-only API).
  // clearOnInit: false  ← MUST be false; true would wipe data on every open.
  // initialCapacity: 6 ← SQLite needs extra handles for WAL + journal files.
  const sahPool: SAHPoolUtil = await sqlite3.installOpfsSAHPoolVfs({
    clearOnInit:     false,
    initialCapacity: 6,
  })

  db = new sahPool.OpfsSAHPoolDb('/spike.db')

  // Schema — idempotent, safe to run on every open.
  db.exec(`
    CREATE TABLE IF NOT EXISTS spike_rows (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT    NOT NULL,
      ts    TEXT    NOT NULL
    )
  `)

  return 'ok'
}

// ── Queries ─────────────────────────────────────────────────────────────── //

function insertRow(label: string): { id: number } {
  if (!db) throw new Error('DB not initialised — call init first')

  const resultRows: Record<string, SqlValue>[] = []

  db.exec({
    sql:        'INSERT INTO spike_rows (label, ts) VALUES (?, ?) RETURNING id',
    bind:       [label, new Date().toISOString()],
    rowMode:    'object',
    resultRows,
  })

  const row = resultRows[0]
  if (!row) throw new Error('INSERT returned no row')

  return { id: row['id'] as number }
}

function listRows(): SpikeRow[] {
  if (!db) throw new Error('DB not initialised — call init first')

  const resultRows: Record<string, SqlValue>[] = []

  db.exec({
    sql:        'SELECT id, label, ts FROM spike_rows ORDER BY id DESC',
    rowMode:    'object',
    resultRows,
  })

  return resultRows.map((r) => ({
    id:    r['id']    as number,
    label: r['label'] as string,
    ts:    r['ts']    as string,
  }))
}
