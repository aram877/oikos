import type { ShoppingItemRow, InsertShoppingItemInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = 'id, account_id, name, quantity, added_by, done_at, done_by, created_at'

/**
 * Lists all shopping items for the active account, oldest first.
 */
export async function listItems(accountId?: string): Promise<ShoppingItemRow[]> {
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('shopping_items')
    .select(SELECT)
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
    .select(SELECT)
    .single()

  if (error) throw new Error(`[shoppingRepo.insertItem] ${error.message}`)
  if (!data) throw new Error('[shoppingRepo.insertItem] No row returned')
  return data as ShoppingItemRow
}

/**
 * Toggles the shared "done" state on a shopping item.
 *
 * `done = true`  → stamps the current time + caller's user id.
 * `done = false` → clears both fields back to NULL.
 *
 * Realtime UPDATE events on shopping_items propagate the change to every
 * other household member's open page.
 */
export async function setItemDone(id: string, done: boolean): Promise<ShoppingItemRow | null> {
  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const { data, error } = await supabase
    .from('shopping_items')
    .update({
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? userId                   : null,
    })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle()

  if (error) throw new Error(`[shoppingRepo.setItemDone] ${error.message}`)
  return (data as ShoppingItemRow | null) ?? null
}

/**
 * Hard-deletes a shopping item (the trash button — separate intent from
 * checking off, which only flips `done_at`).
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
