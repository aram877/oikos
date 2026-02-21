/**
 * Main-thread typed proxy for the database Worker.
 *
 * Usage:
 *   import { dbClient } from '@/db/db.client'
 *
 *   // Must be called once at app startup (inside a useEffect / layout).
 *   await dbClient.init()
 *
 *   const accounts = await dbClient.accounts.list()
 *
 * Singleton: the Worker is spawned once and reused for the lifetime of the page.
 * All methods return Promises that resolve with the typed result.
 */

import type {
  WorkerRequest,
  WorkerResponse,
  AccountRow,
  CategoryRow,
  TransactionRow,
  InsertAccountInput,
  UpdateAccountInput,
  InsertCategoryInput,
  UpdateCategoryInput,
  InsertTransactionInput,
  UpdateTransactionInput,
  MonthlySummary,
  BackupFile,
} from './types'

// ── Worker singleton ─────────────────────────────────────────────────────── //

let _worker: Worker | null = null

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./db.worker.ts', import.meta.url))
  }
  return _worker
}

// ── Core postMessage wrapper ─────────────────────────────────────────────── //

function call<T>(method: string, args?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID()
    const worker = getWorker()

    const handler = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return
      worker.removeEventListener('message', handler)
      if (e.data.error !== undefined) {
        reject(new Error(e.data.error))
      } else {
        resolve(e.data.result as T)
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, method, args } satisfies WorkerRequest)
  })
}

// ── Typed client ─────────────────────────────────────────────────────────── //

export const dbClient = {
  /**
   * Opens the database and runs pending migrations.
   * Must be awaited before any other method is called.
   */
  init: (): Promise<void> =>
    call<void>('init'),

  accounts: {
    list:       ():                              Promise<AccountRow[]>    => call('accounts.list'),
    get:        (id: string):                   Promise<AccountRow | null> => call('accounts.get', { id }),
    insert:     (input: InsertAccountInput):    Promise<AccountRow>       => call('accounts.insert', input),
    update:     (id: string, input: UpdateAccountInput): Promise<AccountRow | null> =>
      call('accounts.update', { id, input }),
    softDelete: (id: string):                   Promise<boolean>          => call('accounts.softDelete', { id }),
  },

  categories: {
    list:       ():                               Promise<CategoryRow[]>     => call('categories.list'),
    get:        (id: string):                    Promise<CategoryRow | null> => call('categories.get', { id }),
    insert:     (input: InsertCategoryInput):    Promise<CategoryRow>        => call('categories.insert', input),
    update:     (id: string, input: UpdateCategoryInput): Promise<CategoryRow | null> =>
      call('categories.update', { id, input }),
    softDelete: (id: string):                    Promise<boolean>            => call('categories.softDelete', { id }),
  },

  transactions: {
    listByMonth: (yearMonth: string, accountId?: string): Promise<TransactionRow[]> =>
      call('transactions.listByMonth', { yearMonth, accountId }),
    get:        (id: string):                        Promise<TransactionRow | null> =>
      call('transactions.get', { id }),
    insert:     (input: InsertTransactionInput):     Promise<TransactionRow> =>
      call('transactions.insert', input),
    update:     (id: string, input: UpdateTransactionInput): Promise<TransactionRow | null> =>
      call('transactions.update', { id, input }),
    softDelete: (id: string):                        Promise<boolean> =>
      call('transactions.softDelete', { id }),
    getMonthlySummary: (yearMonth: string, accountId?: string): Promise<MonthlySummary> =>
      call('transactions.getMonthlySummary', { yearMonth, accountId }),
  },

  backup: {
    /**
     * Exports the full database as a BackupFile object.
     * The caller is responsible for JSON.stringify + download (main thread).
     */
    export: (): Promise<BackupFile> =>
      call('backup.export'),

    /**
     * Replaces all local data with the provided backup.
     * MUST be called only after explicit user confirmation in the UI.
     *
     * @param backup  The already-parsed BackupFile (not a JSON string).
     */
    restore: (backup: unknown): Promise<void> =>
      call('backup.restore', backup),
  },
}
