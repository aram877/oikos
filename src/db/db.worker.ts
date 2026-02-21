/**
 * Production database Worker.
 *
 * Runs SQLite WASM + OPFS SAHPool VFS. MUST execute in a Web Worker —
 * OPFS FileSystemSyncAccessHandle is a Worker-only API.
 *
 * Message protocol: WorkerRequest → WorkerResponse (see types.ts).
 * All methods are dispatched via the `method` string (dot-notation namespacing).
 */

import type { WorkerRequest, WorkerResponse } from './types'
import { openDb, getDb } from './openDb'
import { runMigrations } from './migrate'
import { buildBackupFile } from './backup/exportBackup'
import { restoreBackup } from './backup/restoreBackup'
import {
  listAccounts,
  getAccount,
  insertAccount,
  updateAccount,
  softDeleteAccount,
} from './repositories/accountRepo'
import {
  listCategories,
  getCategory,
  insertCategory,
  updateCategory,
  softDeleteCategory,
} from './repositories/categoryRepo'
import {
  listByMonth,
  getTransaction,
  insertTransaction,
  updateTransaction,
  softDeleteTransaction,
  getMonthlySummary,
} from './repositories/transactionRepo'

// Minimal worker-global interface.
// DedicatedWorkerGlobalScope lives in lib.webworker, which conflicts with
// lib.dom in the main tsconfig. Defining only what we use avoids the clash.
interface WorkerGlobal {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
  postMessage(data: unknown): void
}

const ctx = self as unknown as WorkerGlobal

// ── Initialisation ───────────────────────────────────────────────────────── //

async function handleInit(): Promise<'ok'> {
  const db = await openDb()
  await runMigrations(db)
  return 'ok'
}

// ── Schema version (for backup metadata) ────────────────────────────────── //

function readSchemaVersion(): number {
  const db = getDb()
  const rows = db.exec('PRAGMA user_version', {
    returnValue: 'resultRows',
    rowMode:     'array',
  }) as number[][]
  return rows[0]?.[0] ?? 0
}

// ── Dispatch ─────────────────────────────────────────────────────────────── //

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, method, args } = e.data

  try {
    const result = await dispatch(method, args)
    ctx.postMessage({ id, result } satisfies WorkerResponse)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    ctx.postMessage({ id, error } satisfies WorkerResponse)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(method: string, args: unknown): Promise<unknown> {
  // Convenience cast — each branch knows the exact shape of args.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = args as any

  switch (method) {
    // ── Lifecycle ────────────────────────────────────────────────────────── //
    case 'init':
      return handleInit()

    // ── Accounts ─────────────────────────────────────────────────────────── //
    case 'accounts.list':
      return listAccounts(getDb())

    case 'accounts.get':
      return getAccount(getDb(), a.id)

    case 'accounts.insert':
      return insertAccount(getDb(), a)

    case 'accounts.update':
      return updateAccount(getDb(), a.id, a.input)

    case 'accounts.softDelete':
      return softDeleteAccount(getDb(), a.id)

    // ── Categories ───────────────────────────────────────────────────────── //
    case 'categories.list':
      return listCategories(getDb())

    case 'categories.get':
      return getCategory(getDb(), a.id)

    case 'categories.insert':
      return insertCategory(getDb(), a)

    case 'categories.update':
      return updateCategory(getDb(), a.id, a.input)

    case 'categories.softDelete':
      return softDeleteCategory(getDb(), a.id)

    // ── Transactions ─────────────────────────────────────────────────────── //
    case 'transactions.listByMonth':
      return listByMonth(getDb(), a.yearMonth, a.accountId)

    case 'transactions.get':
      return getTransaction(getDb(), a.id)

    case 'transactions.insert':
      return insertTransaction(getDb(), a)

    case 'transactions.update':
      return updateTransaction(getDb(), a.id, a.input)

    case 'transactions.softDelete':
      return softDeleteTransaction(getDb(), a.id)

    case 'transactions.getMonthlySummary':
      return getMonthlySummary(getDb(), a.yearMonth, a.accountId)

    // ── Backup ───────────────────────────────────────────────────────────── //
    case 'backup.export':
      return buildBackupFile(getDb(), readSchemaVersion())

    case 'backup.restore':
      // `a` is the already-parsed BackupFile object (serialized over postMessage).
      // restoreBackup validates it internally before touching any data.
      restoreBackup(getDb(), a)
      return null

    default:
      throw new Error(`[db.worker] Unknown method: ${method}`)
  }
}
