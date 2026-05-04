import type {
  SavingsGoalRow,
  InsertSavingsGoalInput,
  UpdateSavingsGoalInput,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = 'id, account_id, name, target_cents, current_cents, target_date, created_at, updated_at, deleted_at'

export async function listGoals(): Promise<SavingsGoalRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('savings_goals')
    .select(SELECT)
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[savingsGoalsRepo.listGoals] ${error.message}`)
  return (data ?? []) as SavingsGoalRow[]
}

export async function insertGoal(input: InsertSavingsGoalInput): Promise<SavingsGoalRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('savings_goals')
    .insert({
      account_id:    accountId,
      name:          input.name,
      target_cents:  input.target_cents,
      current_cents: input.current_cents ?? 0,
      target_date:   input.target_date ?? null,
    })
    .select(SELECT)
    .single()

  if (error) throw new Error(`[savingsGoalsRepo.insertGoal] ${error.message}`)
  if (!data) throw new Error('[savingsGoalsRepo.insertGoal] No row returned')
  return data as SavingsGoalRow
}

export async function updateGoal(id: string, input: UpdateSavingsGoalInput): Promise<SavingsGoalRow | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('savings_goals')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT)
    .maybeSingle()

  if (error) throw new Error(`[savingsGoalsRepo.updateGoal] ${error.message}`)
  return (data ?? null) as SavingsGoalRow | null
}

export async function softDeleteGoal(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('savings_goals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`[savingsGoalsRepo.softDeleteGoal] ${error.message}`)
}
