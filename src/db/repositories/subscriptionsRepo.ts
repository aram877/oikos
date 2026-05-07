import type {
  SubscriptionRow,
  InsertSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionMatchPatternRow,
  InsertSubscriptionMatchPatternInput,
  SubscriptionSpendRow,
  TransactionListRow,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = `
  id, account_id, name, vendor, category_id, expected_amount_cents,
  cadence, notes, started_on, cancelled_on, created_at, updated_at, deleted_at
`

// ── Subscriptions ──────────────────────────────────────────────────────────── //

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('subscriptions')
    .select(SELECT)
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('cancelled_on', { ascending: false, nullsFirst: true })   // active first
    .order('name', { ascending: true })

  if (error) throw new Error(`[subscriptionsRepo.listSubscriptions] ${error.message}`)
  return (data ?? []) as SubscriptionRow[]
}

export async function getSubscription(id: string): Promise<SubscriptionRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`[subscriptionsRepo.getSubscription] ${error.message}`)
  return (data as SubscriptionRow | null) ?? null
}

export async function insertSubscription(input: InsertSubscriptionInput): Promise<SubscriptionRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      account_id:            accountId,
      name:                  input.name,
      vendor:                input.vendor ?? null,
      category_id:           input.category_id ?? null,
      expected_amount_cents: input.expected_amount_cents ?? null,
      cadence:               input.cadence,
      notes:                 input.notes ?? null,
      started_on:            input.started_on ?? null,
    })
    .select(SELECT)
    .single()

  if (error || !data) throw new Error(`[subscriptionsRepo.insertSubscription] ${error?.message ?? 'no row'}`)
  return data as SubscriptionRow
}

export async function updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<SubscriptionRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT)
    .maybeSingle()
  if (error) throw new Error(`[subscriptionsRepo.updateSubscription] ${error.message}`)
  return (data as SubscriptionRow | null) ?? null
}

export async function softDeleteSubscription(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('subscriptions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`[subscriptionsRepo.softDeleteSubscription] ${error.message}`)
}

// ── Match patterns ─────────────────────────────────────────────────────────── //

const PATTERN_SELECT = `id, subscription_id, description_contains, amount_min_cents, amount_max_cents, created_at`

export async function listPatterns(subscriptionId: string): Promise<SubscriptionMatchPatternRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscription_match_patterns')
    .select(PATTERN_SELECT)
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`[subscriptionsRepo.listPatterns] ${error.message}`)
  return (data ?? []) as SubscriptionMatchPatternRow[]
}

export async function listAllPatternsForAccount(): Promise<SubscriptionMatchPatternRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase
    .from('subscription_match_patterns')
    .select(`${PATTERN_SELECT}, subscriptions!inner(account_id, deleted_at, cancelled_on)`)
    .eq('subscriptions.account_id', accountId)
    .is('subscriptions.deleted_at', null)
  if (error) throw new Error(`[subscriptionsRepo.listAllPatternsForAccount] ${error.message}`)
  // Strip the joined subscriptions object before returning
  return (data ?? []).map((r: SubscriptionMatchPatternRow & { subscriptions?: unknown }) => {
    const { subscriptions: _drop, ...rest } = r
    void _drop
    return rest as SubscriptionMatchPatternRow
  })
}

export async function insertPattern(input: InsertSubscriptionMatchPatternInput): Promise<SubscriptionMatchPatternRow> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscription_match_patterns')
    .insert({
      subscription_id:      input.subscription_id,
      description_contains: input.description_contains,
      amount_min_cents:     input.amount_min_cents ?? null,
      amount_max_cents:     input.amount_max_cents ?? null,
    })
    .select(PATTERN_SELECT)
    .single()
  if (error || !data) throw new Error(`[subscriptionsRepo.insertPattern] ${error?.message ?? 'no row'}`)
  return data as SubscriptionMatchPatternRow
}

export async function deletePattern(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('subscription_match_patterns')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`[subscriptionsRepo.deletePattern] ${error.message}`)
}

// ── Linking transactions ───────────────────────────────────────────────────── //

export async function linkTransaction(transactionId: string, subscriptionId: string | null): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('transactions')
    .update({ subscription_id: subscriptionId, updated_at: new Date().toISOString() })
    .eq('id', transactionId)
  if (error) throw new Error(`[subscriptionsRepo.linkTransaction] ${error.message}`)
}

/**
 * Bulk-link a list of transactions to one subscription.  Used by the
 * "apply to past" backfill.
 */
export async function linkTransactionsBulk(transactionIds: string[], subscriptionId: string): Promise<number> {
  if (transactionIds.length === 0) return 0
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .update({ subscription_id: subscriptionId, updated_at: new Date().toISOString() })
    .in('id', transactionIds)
    .select('id')
  if (error) throw new Error(`[subscriptionsRepo.linkTransactionsBulk] ${error.message}`)
  return (data?.length ?? 0)
}

/**
 * Lists transactions linked to a subscription, newest first.
 */
export async function listTransactionsForSubscription(
  subscriptionId: string,
  limit = 100,
): Promise<TransactionListRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id, account_id, category_id, amount_cents, currency, date, description, notes,
      import_hash, is_transfer, subscription_id, created_at, updated_at, deleted_at,
      category:categories!category_id (
        name, parent_id,
        parent:categories!parent_id ( name )
      )
    `)
    .eq('account_id', accountId)
    .eq('subscription_id', subscriptionId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[subscriptionsRepo.listTransactionsForSubscription] ${error.message}`)

  type Joined = {
    id: string; account_id: string; category_id: string | null
    amount_cents: number; currency: string; date: string; description: string
    notes: string | null; import_hash: string | null; is_transfer: boolean
    subscription_id: string | null; created_at: string; updated_at: string
    deleted_at: string | null
    category: { name: string | null; parent_id: string | null; parent: { name: string | null } | null } | null
  }
  return ((data ?? []) as unknown as Joined[]).map((r): TransactionListRow => ({
    id:                   r.id,
    account_id:           r.account_id,
    category_id:          r.category_id,
    amount_cents:         r.amount_cents,
    currency:             r.currency,
    date:                 r.date,
    description:          r.description,
    notes:                r.notes,
    import_hash:          r.import_hash,
    is_transfer:          r.is_transfer,
    subscription_id:      r.subscription_id,
    created_at:           r.created_at,
    updated_at:           r.updated_at,
    deleted_at:           r.deleted_at,
    category_name:        r.category?.name ?? null,
    category_parent_id:   r.category?.parent_id ?? null,
    parent_category_name: r.category?.parent?.name ?? null,
  }))
}

// ── Spend rollup ───────────────────────────────────────────────────────────── //

export async function getSpendRollup(startDate: string, endDate: string): Promise<SubscriptionSpendRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase.rpc('get_subscription_spend', {
    p_account_id: accountId,
    p_start_date: startDate,
    p_end_date:   endDate,
  })
  if (error) throw new Error(`[subscriptionsRepo.getSpendRollup] ${error.message}`)
  return ((data ?? []) as { subscription_id: string; total_cents: number | string; charge_count: number | string; last_charged_on: string | null }[])
    .map((r) => ({
      subscription_id: r.subscription_id,
      total_cents:     Number(r.total_cents),
      charge_count:    Number(r.charge_count),
      last_charged_on: r.last_charged_on,
    }))
}
