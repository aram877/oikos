import type { CategorizationRuleRow, InsertCategorizationRuleInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

export async function listRules(): Promise<CategorizationRuleRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('categorization_rules')
    .select('id, account_id, description_contains, amount_min_cents, amount_max_cents, category_id, note, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[categorizationRulesRepo.listRules] ${error.message}`)
  return (data ?? []) as CategorizationRuleRow[]
}

export async function insertRule(
  input: InsertCategorizationRuleInput,
): Promise<CategorizationRuleRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('categorization_rules')
    .insert({
      account_id:           accountId,
      description_contains: input.description_contains,
      amount_min_cents:     input.amount_min_cents ?? null,
      amount_max_cents:     input.amount_max_cents ?? null,
      category_id:          input.category_id,
      note:                 input.note ?? null,
    })
    .select('id, account_id, description_contains, amount_min_cents, amount_max_cents, category_id, note, created_at')
    .single()

  if (error) throw new Error(`[categorizationRulesRepo.insertRule] ${error.message}`)
  if (!data) throw new Error('[categorizationRulesRepo.insertRule] No row returned')
  return data as CategorizationRuleRow
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('categorization_rules')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`[categorizationRulesRepo.deleteRule] ${error.message}`)
}
