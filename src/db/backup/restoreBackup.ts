import type { BackupFile } from '../types'
import { validateBackup } from './validateBackup'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

/**
 * Restores a backup into the current account.
 *
 * Strategy:
 * 1. Validate the backup structure.
 * 2. Soft-delete all current rows (set deleted_at) so existing IDs don't conflict.
 * 3. Upsert accounts, categories, and transactions from the backup.
 *
 * Note: Supabase does not support multi-table transactions from the client.
 * Each table is upserted independently.  On partial failure the data may be
 * inconsistent; the user should re-run the restore.
 *
 * IMPORTANT: This replaces all local data.  The caller must obtain explicit
 * user confirmation before calling this function.
 *
 * @throws If validation fails or any Supabase call errors.
 */
export async function restoreBackup(raw: unknown): Promise<void> {
  const validation = validateBackup(raw)
  if (!validation.valid) {
    throw new Error(
      `[restore] Backup validation failed:\n  - ${validation.errors.join('\n  - ')}`,
    )
  }

  const backup    = raw as BackupFile
  const supabase  = getSupabase()
  const accountId = await getActiveAccountId()
  const now       = new Date().toISOString()

  // ── 1. Soft-delete existing rows ────────────────────────────────────────── //

  await Promise.all([
    supabase
      .from('transactions')
      .update({ deleted_at: now })
      .eq('account_id', accountId)
      .is('deleted_at', null),

    supabase
      .from('categories')
      .update({ deleted_at: now })
      .eq('account_id', accountId)
      .is('deleted_at', null),
  ])

  // ── 2. Upsert accounts ──────────────────────────────────────────────────── //

  const { error: accErr } = await supabase
    .from('accounts')
    .upsert(backup.contents.accounts, { onConflict: 'id' })

  if (accErr) throw new Error(`[restore] accounts: ${accErr.message}`)

  // ── 3. Upsert categories ────────────────────────────────────────────────── //

  const { error: catErr } = await supabase
    .from('categories')
    .upsert(backup.contents.categories, { onConflict: 'id' })

  if (catErr) throw new Error(`[restore] categories: ${catErr.message}`)

  // ── 4. Upsert transactions ──────────────────────────────────────────────── //

  const CHUNK = 500
  const txs   = backup.contents.transactions
  for (let i = 0; i < txs.length; i += CHUNK) {
    const chunk = txs.slice(i, i + CHUNK)
    const { error: txErr } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'id' })

    if (txErr) throw new Error(`[restore] transactions chunk ${i}: ${txErr.message}`)
  }
}
