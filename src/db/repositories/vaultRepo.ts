import type {
  PasswordVaultMetaRow,
  PasswordEntryRow,
  InsertPasswordEntryInput,
  UpdatePasswordEntryInput,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const META_SELECT  = `account_id, kdf, kdf_iters, salt_b64, verifier_ct, verifier_iv, setup_by, created_at, updated_at`
const ENTRY_SELECT = `id, account_id, name, url, ciphertext, iv, created_by, created_at, updated_at`

// ── Vault metadata ────────────────────────────────────────────────────────── //

/**
 * Returns the vault metadata row for the active account.  null if the vault
 * has not been set up yet.
 */
export async function getVaultMeta(): Promise<PasswordVaultMetaRow | null> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase
    .from('password_vaults')
    .select(META_SELECT)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw new Error(`[vaultRepo.getVaultMeta] ${error.message}`)
  return (data as PasswordVaultMetaRow | null) ?? null
}

export interface SetupVaultInput {
  kdf:         string
  kdf_iters:   number
  salt_b64:    string
  verifier_ct: string
  verifier_iv: string
}

/** Insert the vault row.  Caller must be admin (RLS-enforced). */
export async function setupVault(input: SetupVaultInput): Promise<PasswordVaultMetaRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data: u } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('password_vaults')
    .insert({
      account_id:  accountId,
      kdf:         input.kdf,
      kdf_iters:   input.kdf_iters,
      salt_b64:    input.salt_b64,
      verifier_ct: input.verifier_ct,
      verifier_iv: input.verifier_iv,
      setup_by:    u.user?.id ?? null,
    })
    .select(META_SELECT)
    .single()

  if (error || !data) throw new Error(`[vaultRepo.setupVault] ${error?.message ?? 'no row'}`)
  return data as PasswordVaultMetaRow
}

/**
 * Hard-deletes the vault metadata + every entry (cascades).  Admin only
 * (RLS-enforced).  Used by the "Reset vault" escape hatch — irreversible.
 */
export async function resetVault(): Promise<void> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  // Wipe entries first (FK doesn't cascade from password_vaults, only from
  // accounts).  Safe to no-op if there are zero entries.
  const { error: entriesErr } = await supabase
    .from('password_entries')
    .delete()
    .eq('account_id', accountId)
  if (entriesErr) throw new Error(`[vaultRepo.resetVault:entries] ${entriesErr.message}`)

  const { error: metaErr } = await supabase
    .from('password_vaults')
    .delete()
    .eq('account_id', accountId)
  if (metaErr) throw new Error(`[vaultRepo.resetVault:meta] ${metaErr.message}`)
}

// ── Entries ───────────────────────────────────────────────────────────────── //

export async function listEntries(): Promise<PasswordEntryRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase
    .from('password_entries')
    .select(ENTRY_SELECT)
    .eq('account_id', accountId)
    .order('name', { ascending: true })
  if (error) throw new Error(`[vaultRepo.listEntries] ${error.message}`)
  return (data ?? []) as PasswordEntryRow[]
}

export async function insertEntry(input: InsertPasswordEntryInput): Promise<PasswordEntryRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('password_entries')
    .insert({
      account_id: accountId,
      name:       input.name,
      url:        input.url,
      ciphertext: input.ciphertext,
      iv:         input.iv,
      created_by: u.user?.id ?? null,
    })
    .select(ENTRY_SELECT)
    .single()
  if (error || !data) throw new Error(`[vaultRepo.insertEntry] ${error?.message ?? 'no row'}`)
  return data as PasswordEntryRow
}

export async function updateEntry(id: string, input: UpdatePasswordEntryInput): Promise<PasswordEntryRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('password_entries')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ENTRY_SELECT)
    .maybeSingle()
  if (error) throw new Error(`[vaultRepo.updateEntry] ${error.message}`)
  return (data as PasswordEntryRow | null) ?? null
}

export async function deleteEntry(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('password_entries').delete().eq('id', id)
  if (error) throw new Error(`[vaultRepo.deleteEntry] ${error.message}`)
}
