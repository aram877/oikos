import type { BudgetRow, UpsertBudgetInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = 'id, account_id, category_id, amount_cents, created_at, updated_at'

export async function listBudgets(): Promise<BudgetRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('budgets')
    .select(SELECT)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[budgetsRepo.listBudgets] ${error.message}`)
  return (data ?? []) as BudgetRow[]
}

export async function upsertBudget(input: UpsertBudgetInput): Promise<BudgetRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        account_id:   accountId,
        category_id:  input.category_id,
        amount_cents: input.amount_cents,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'account_id,category_id' },
    )
    .select(SELECT)
    .single()

  if (error) throw new Error(`[budgetsRepo.upsertBudget] ${error.message}`)
  if (!data) throw new Error('[budgetsRepo.upsertBudget] No row returned')
  return data as BudgetRow
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`[budgetsRepo.deleteBudget] ${error.message}`)
}
