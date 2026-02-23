import type { AccountRow, InsertAccountInput, UpdateAccountInput } from '../types'
import { getSupabase } from '../supabase'

/**
 * Lists all active (non-deleted) accounts the current user has access to,
 * ordered by name.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, currency, created_at, deleted_at')
    .is('deleted_at', null)
    .order('name')

  if (error) throw new Error(`[accountRepo.listAccounts] ${error.message}`)
  return (data ?? []) as AccountRow[]
}

/**
 * Returns a single account by ID, or null if not found / soft-deleted.
 */
export async function getAccount(id: string): Promise<AccountRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, currency, created_at, deleted_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error?.code === 'PGRST116') return null // not found
  if (error) throw new Error(`[accountRepo.getAccount] ${error.message}`)
  return data as AccountRow | null
}

/**
 * Inserts a new account and returns the created row.
 */
export async function insertAccount(input: InsertAccountInput): Promise<AccountRow> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ name: input.name, currency: input.currency })
    .select('id, name, currency, created_at, deleted_at')
    .single()

  if (error) throw new Error(`[accountRepo.insertAccount] ${error.message}`)
  if (!data) throw new Error('[accountRepo.insertAccount] No row returned')
  return data as AccountRow
}

/**
 * Updates mutable fields on an account.
 * Returns the updated row, or null if not found.
 */
export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<AccountRow | null> {
  if (input.name === undefined) return getAccount(id)

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('accounts')
    .update({ name: input.name })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name, currency, created_at, deleted_at')
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[accountRepo.updateAccount] ${error.message}`)
  return data as AccountRow | null
}

/**
 * Soft-deletes an account.
 * Returns true if the row was found and deleted.
 */
export async function softDeleteAccount(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`[accountRepo.softDeleteAccount] ${error.message}`)
  return (data?.length ?? 0) > 0
}
