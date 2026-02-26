import type {
  TransactionRow,
  TransactionListRow,
  InsertTransactionInput,
  UpdateTransactionInput,
  MonthlySummary,
  MonthlySummaryRow,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

// ── Nested select for list queries ────────────────────────────────────────── //

const TX_SELECT = `
  id, account_id, category_id, amount_cents, currency, date,
  description, notes, import_hash, is_transfer, created_at, updated_at, deleted_at,
  category:categories!category_id (
    name, parent_id,
    parent:categories!parent_id ( name )
  )
`

type SupabaseTxRow = TransactionRow & {
  category?: {
    name:      string
    parent_id: string | null
    parent?:   { name: string } | null
  } | null
}

function flattenTransactionListRow(row: SupabaseTxRow): TransactionListRow {
  return {
    id:           row.id,
    account_id:   row.account_id,
    category_id:  row.category_id,
    amount_cents: row.amount_cents,
    currency:     row.currency,
    date:         row.date,
    description:  row.description,
    notes:        row.notes,
    import_hash:  row.import_hash,
    is_transfer:  row.is_transfer,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
    deleted_at:   row.deleted_at,
    category_name:        row.category?.name        ?? null,
    category_parent_id:   row.category?.parent_id   ?? null,
    parent_category_name: row.category?.parent?.name ?? null,
  }
}

// ── Month helpers ─────────────────────────────────────────────────────────── //

function monthRange(yearMonth: string): { start: string; end: string } {
  const start = `${yearMonth}-01`
  const [year, month] = yearMonth.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

// ── Read operations ───────────────────────────────────────────────────────── //

/**
 * Lists active transactions for a calendar month, with category labels.
 */
export async function listByMonth(
  yearMonth: string,
  accountId?: string,
): Promise<TransactionListRow[]> {
  const { start, end } = monthRange(yearMonth)
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .select(TX_SELECT)
    .eq('account_id', resolvedAccountId)
    .gte('date', start)
    .lt('date', end)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`[transactionRepo.listByMonth] ${error.message}`)
  return ((data ?? []) as unknown as SupabaseTxRow[]).map(flattenTransactionListRow)
}

/**
 * Lists active transactions within an explicit date range.
 */
export async function listByDateRange(
  startDate: string,
  endDate: string,
  accountId?: string,
): Promise<TransactionListRow[]> {
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .select(TX_SELECT)
    .eq('account_id', resolvedAccountId)
    .gte('date', startDate)
    .lt('date', endDate)
    .is('deleted_at', null)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[transactionRepo.listByDateRange] ${error.message}`)
  return ((data ?? []) as unknown as SupabaseTxRow[]).map(flattenTransactionListRow)
}

/**
 * Returns a single active transaction by ID, or null.
 */
export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id, category_id, amount_cents, currency, date, description, notes, import_hash, is_transfer, created_at, updated_at, deleted_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[transactionRepo.getTransaction] ${error.message}`)
  return data as TransactionRow | null
}

// ── Write operations ──────────────────────────────────────────────────────── //

/**
 * Inserts a new transaction and returns the created row.
 */
export async function insertTransaction(
  input: InsertTransactionInput,
): Promise<TransactionRow> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      account_id:   input.account_id,
      category_id:  input.category_id  ?? null,
      amount_cents: input.amount_cents,
      currency:     'EUR',
      date:         input.date,
      description:  input.description,
      notes:        input.notes        ?? null,
      import_hash:  input.import_hash  ?? null,
      is_transfer:  input.is_transfer  ?? false,
    })
    .select('id, account_id, category_id, amount_cents, currency, date, description, notes, import_hash, is_transfer, created_at, updated_at, deleted_at')
    .single()

  if (error) throw new Error(`[transactionRepo.insertTransaction] ${error.message}`)
  if (!data) throw new Error('[transactionRepo.insertTransaction] No row returned')
  return data as TransactionRow
}

/**
 * Updates mutable fields on a transaction.
 */
export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow | null> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.category_id  !== undefined) updates['category_id']  = input.category_id  ?? null
  if (input.amount_cents !== undefined) updates['amount_cents'] = input.amount_cents
  if (input.date         !== undefined) updates['date']         = input.date
  if (input.description  !== undefined) updates['description']  = input.description
  if (input.notes        !== undefined) updates['notes']        = input.notes ?? null
  if (input.is_transfer  !== undefined) updates['is_transfer']  = input.is_transfer

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, account_id, category_id, amount_cents, currency, date, description, notes, import_hash, is_transfer, created_at, updated_at, deleted_at')
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[transactionRepo.updateTransaction] ${error.message}`)
  return data as TransactionRow | null
}

/**
 * Soft-deletes a transaction.
 */
export async function softDeleteTransaction(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`[transactionRepo.softDeleteTransaction] ${error.message}`)
  return (data?.length ?? 0) > 0
}

// ── Monthly summary ───────────────────────────────────────────────────────── //

/**
 * Returns an income/expense summary for a calendar month via Supabase RPC.
 */
export async function getMonthlySummary(
  yearMonth: string,
  accountId?: string,
): Promise<MonthlySummary> {
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('get_monthly_summary', {
    p_account_id:  resolvedAccountId,
    p_year_month:  yearMonth,
  })

  if (error) throw new Error(`[transactionRepo.getMonthlySummary] ${error.message}`)

  const rows = (data ?? []) as MonthlySummaryRow[]

  let total_income_cents  = 0
  let total_expense_cents = 0
  for (const row of rows) {
    total_income_cents  += Number(row.income_cents)
    total_expense_cents += Number(row.expense_cents)
  }

  return {
    total_income_cents,
    total_expense_cents,
    net_cents: total_income_cents + total_expense_cents,
    by_category: rows.map((r) => ({
      category_id:   r.category_id,
      category_name: r.category_name,
      parent_id:     r.parent_id,
      income_cents:  Number(r.income_cents),
      expense_cents: Number(r.expense_cents),
    })),
  }
}

// ── Import helpers ────────────────────────────────────────────────────────── //

/**
 * Returns the subset of the provided import_hash values that already exist.
 */
export async function checkImportHashes(hashes: string[]): Promise<string[]> {
  if (hashes.length === 0) return []

  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .select('import_hash')
    .eq('account_id', accountId)
    .in('import_hash', hashes)
    .is('deleted_at', null)

  if (error) throw new Error(`[transactionRepo.checkImportHashes] ${error.message}`)
  return (data ?? []).map((r) => r['import_hash'] as string).filter(Boolean)
}

/**
 * Bulk-inserts transactions, silently skipping duplicates via upsert.
 * Returns the number of rows actually written.
 */
export async function insertTransactionsBulk(
  inputs: InsertTransactionInput[],
): Promise<number> {
  if (inputs.length === 0) return 0

  const supabase = getSupabase()
  const rows = inputs.map((input) => ({
    account_id:   input.account_id,
    category_id:  input.category_id  ?? null,
    amount_cents: input.amount_cents,
    currency:     'EUR',
    date:         input.date,
    description:  input.description,
    notes:        input.notes        ?? null,
    import_hash:  input.import_hash  ?? null,
    is_transfer:  input.is_transfer  ?? false,
  }))

  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'account_id,import_hash', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(`[transactionRepo.insertTransactionsBulk] ${error.message}`)
  return data?.length ?? 0
}

/**
 * Counts other active transactions in the same calendar month with the exact
 * same description (case-insensitive), excluding the given transaction ID.
 */
export async function countSameDescriptionInMonth(
  description: string,
  yearMonth: string,
  excludeId: string,
  accountId?: string,
): Promise<number> {
  const { start, end } = monthRange(yearMonth)
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', resolvedAccountId)
    .ilike('description', description)
    .gte('date', start)
    .lt('date', end)
    .neq('id', excludeId)
    .is('deleted_at', null)

  if (error) throw new Error(`[transactionRepo.countSameDescriptionInMonth] ${error.message}`)
  return count ?? 0
}

/**
 * Bulk-updates category_id for all active transactions in the same calendar
 * month with the exact same description (case-insensitive), excluding the
 * given transaction ID (which is updated separately by updateTransaction).
 * Returns the number of rows updated.
 */
export async function updateCategoryByDescriptionInMonth(
  description: string,
  yearMonth: string,
  categoryId: string | null,
  excludeId: string,
  accountId?: string,
): Promise<number> {
  const { start, end } = monthRange(yearMonth)
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .eq('account_id', resolvedAccountId)
    .ilike('description', description)
    .gte('date', start)
    .lt('date', end)
    .neq('id', excludeId)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`[transactionRepo.updateCategoryByDescriptionInMonth] ${error.message}`)
  return data?.length ?? 0
}

/**
 * Returns the most recently applied category name for a given description
 * (case-insensitive). Returns null if no match found.
 */
export async function findCategoryByDescription(description: string): Promise<string | null> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('transactions')
    .select('categories!category_id ( name )')
    .eq('account_id', accountId)
    .ilike('description', description)
    .not('category_id', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`[transactionRepo.findCategoryByDescription] ${error.message}`)

  const row = data?.[0] as unknown as { categories?: { name: string } | { name: string }[] | null } | undefined
  const cat = row?.categories
  if (!cat) return null
  if (Array.isArray(cat)) return cat[0]?.name ?? null
  return cat.name ?? null
}
