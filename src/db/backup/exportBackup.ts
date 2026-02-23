import type { BackupFile, BackupContents, BackupMetadata, AccountRow, CategoryRow, TransactionRow } from '../types'
import { BACKUP_VERSION } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

/**
 * Reads all rows from all tables (including soft-deleted) for backup.
 * Scoped to the current user's active account.
 */
export async function exportAllForBackup(): Promise<BackupContents> {
  const [supabase, accountId] = await Promise.all([
    Promise.resolve(getSupabase()),
    getActiveAccountId(),
  ])

  const [accountsRes, categoriesRes, transactionsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, currency, created_at, deleted_at')
      .eq('id', accountId)
      .order('created_at'),

    supabase
      .from('categories')
      .select('id, account_id, name, parent_id, created_at, deleted_at')
      .eq('account_id', accountId)
      .order('created_at'),

    supabase
      .from('transactions')
      .select('id, account_id, category_id, amount_cents, currency, date, description, notes, import_hash, created_at, updated_at, deleted_at')
      .eq('account_id', accountId)
      .order('date')
      .order('created_at'),
  ])

  if (accountsRes.error)     throw new Error(`[exportBackup] accounts: ${accountsRes.error.message}`)
  if (categoriesRes.error)   throw new Error(`[exportBackup] categories: ${categoriesRes.error.message}`)
  if (transactionsRes.error) throw new Error(`[exportBackup] transactions: ${transactionsRes.error.message}`)

  return {
    accounts:     (accountsRes.data     ?? []) as AccountRow[],
    categories:   (categoriesRes.data   ?? []) as CategoryRow[],
    transactions: (transactionsRes.data ?? []) as TransactionRow[],
  }
}

function buildMetadata(contents: BackupContents): BackupMetadata {
  const dates = contents.transactions
    .filter((t) => t.deleted_at === null)
    .map((t) => t.date)
    .sort()
  return {
    account_count:     contents.accounts.filter((a) => a.deleted_at === null).length,
    category_count:    contents.categories.filter((c) => c.deleted_at === null).length,
    transaction_count: dates.length,
    date_range: dates.length > 0
      ? { earliest: dates[0], latest: dates[dates.length - 1] }
      : null,
  }
}

/**
 * Builds a complete BackupFile with metadata.
 */
export async function buildBackupFile(): Promise<BackupFile> {
  const contents = await exportAllForBackup()
  return {
    version:        BACKUP_VERSION,
    exported_at:    new Date().toISOString(),
    app_version:    '0.1.0',
    schema_version: 1,
    contents,
    metadata:       buildMetadata(contents),
  }
}

/**
 * Triggers a JSON file download in the browser (main-thread only).
 */
export function downloadBackupJson(
  json: string,
  filename = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`,
): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
