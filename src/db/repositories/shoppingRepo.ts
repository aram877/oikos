import type { ShoppingItemRow, InsertShoppingItemInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

/**
 * Lists all shopping items for the active account, oldest first.
 */
export async function listItems(accountId?: string): Promise<ShoppingItemRow[]> {
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('shopping_items')
    .select('id, account_id, name, quantity, added_by, created_at')
    .eq('account_id', resolvedAccountId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[shoppingRepo.listItems] ${error.message}`)
  return (data ?? []) as ShoppingItemRow[]
}

/**
 * Inserts a new shopping item and returns the created row.
 */
export async function insertItem(input: InsertShoppingItemInput): Promise<ShoppingItemRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      account_id: accountId,
      name:       input.name,
      quantity:   input.quantity ?? null,
      added_by:   userId,
    })
    .select('id, account_id, name, quantity, added_by, created_at')
    .single()

  if (error) throw new Error(`[shoppingRepo.insertItem] ${error.message}`)
  if (!data) throw new Error('[shoppingRepo.insertItem] No row returned')
  return data as ShoppingItemRow
}

/**
 * Hard-deletes a shopping item (used for both "check off" and "remove").
 */
export async function deleteItem(id: string): Promise<boolean> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('shopping_items')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`[shoppingRepo.deleteItem] ${error.message}`)
  return (data?.length ?? 0) > 0
}
