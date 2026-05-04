import type {
  RecurringTransactionRow,
  InsertRecurringTransactionInput,
  UpdateRecurringTransactionInput,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = `
  id, account_id, category_id, description, notes, amount_cents, is_transfer,
  frequency, start_date, next_run_date, end_date, paused,
  created_at, updated_at, deleted_at
`

export async function listRecurring(): Promise<RecurringTransactionRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(SELECT)
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('next_run_date', { ascending: true })

  if (error) throw new Error(`[recurringTransactionsRepo.listRecurring] ${error.message}`)
  return (data ?? []) as RecurringTransactionRow[]
}

export async function listDue(today: string): Promise<RecurringTransactionRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(SELECT)
    .eq('account_id', accountId)
    .eq('paused', false)
    .is('deleted_at', null)
    .lte('next_run_date', today)

  if (error) throw new Error(`[recurringTransactionsRepo.listDue] ${error.message}`)
  return (data ?? []) as RecurringTransactionRow[]
}

export async function insertRecurring(input: InsertRecurringTransactionInput): Promise<RecurringTransactionRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      account_id:    accountId,
      category_id:   input.category_id,
      description:   input.description,
      notes:         input.notes ?? null,
      amount_cents:  input.amount_cents,
      is_transfer:   input.is_transfer ?? false,
      frequency:     input.frequency,
      start_date:    input.start_date,
      next_run_date: input.start_date,
      end_date:      input.end_date ?? null,
    })
    .select(SELECT)
    .single()

  if (error) throw new Error(`[recurringTransactionsRepo.insertRecurring] ${error.message}`)
  if (!data) throw new Error('[recurringTransactionsRepo.insertRecurring] No row returned')
  return data as RecurringTransactionRow
}

export async function updateRecurring(
  id: string,
  input: UpdateRecurringTransactionInput,
): Promise<RecurringTransactionRow | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('recurring_transactions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT)
    .maybeSingle()

  if (error) throw new Error(`[recurringTransactionsRepo.updateRecurring] ${error.message}`)
  return (data ?? null) as RecurringTransactionRow | null
}

export async function softDeleteRecurring(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('recurring_transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`[recurringTransactionsRepo.softDeleteRecurring] ${error.message}`)
}
