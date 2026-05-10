import { createClient as createAdminClient } from '@supabase/supabase-js'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function recordRequisition(requisitionId: string, userId: string): Promise<void> {
  const { error } = await admin()
    .from('gocardless_requisitions')
    .insert({ requisition_id: requisitionId, user_id: userId })
  if (error) throw error
}

export async function isRequisitionOwner(requisitionId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('gocardless_requisitions')
    .select('user_id')
    .eq('requisition_id', requisitionId)
    .single()
  if (error || !data) return false
  return data.user_id === userId
}

export async function setGcAccountIds(requisitionId: string, gcAccountIds: string[]): Promise<void> {
  const { error } = await admin()
    .from('gocardless_requisitions')
    .update({ gc_account_ids: gcAccountIds })
    .eq('requisition_id', requisitionId)
  if (error) throw error
}

export async function isGcAccountOwner(gcAccountId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('gocardless_requisitions')
    .select('user_id')
    .contains('gc_account_ids', [gcAccountId])
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error || !data) return false
  return true
}
