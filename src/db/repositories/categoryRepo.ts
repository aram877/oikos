import type { CategoryRow, InsertCategoryInput, UpdateCategoryInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

/**
 * Lists all active categories for the current account.
 * Top-level (parent_id IS NULL) first, then children, both sorted by name.
 */
export async function listCategories(): Promise<CategoryRow[]> {
  const [supabase, accountId] = await Promise.all([
    Promise.resolve(getSupabase()),
    getActiveAccountId(),
  ])

  const { data, error } = await supabase
    .from('categories')
    .select('id, account_id, name, parent_id, created_at, deleted_at')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('name')

  if (error) throw new Error(`[categoryRepo.listCategories] ${error.message}`)

  // Sort: top-level first, then children
  const rows = (data ?? []) as CategoryRow[]
  return rows.sort((a, b) => {
    const aTop = a.parent_id === null ? 0 : 1
    const bTop = b.parent_id === null ? 0 : 1
    if (aTop !== bTop) return aTop - bTop
    return a.name.localeCompare(b.name)
  })
}

/**
 * Returns a single category by ID, or null if not found / soft-deleted.
 */
export async function getCategory(id: string): Promise<CategoryRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .select('id, account_id, name, parent_id, created_at, deleted_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[categoryRepo.getCategory] ${error.message}`)
  return data as CategoryRow | null
}

/**
 * Inserts a new category and returns the created row.
 */
export async function insertCategory(input: InsertCategoryInput): Promise<CategoryRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('categories')
    .insert({
      account_id: accountId,
      name:       input.name,
      parent_id:  input.parent_id ?? null,
    })
    .select('id, account_id, name, parent_id, created_at, deleted_at')
    .single()

  if (error) throw new Error(`[categoryRepo.insertCategory] ${error.message}`)
  if (!data) throw new Error('[categoryRepo.insertCategory] No row returned')
  return data as CategoryRow
}

/**
 * Updates mutable fields on a category.
 * Returns the updated row, or null if not found.
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow | null> {
  if (input.name === undefined && input.parent_id === undefined) {
    return getCategory(id)
  }

  const updates: Record<string, unknown> = {}
  if (input.name      !== undefined) updates['name']      = input.name
  if (input.parent_id !== undefined) updates['parent_id'] = input.parent_id ?? null

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, account_id, name, parent_id, created_at, deleted_at')
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[categoryRepo.updateCategory] ${error.message}`)
  return data as CategoryRow | null
}

/**
 * Soft-deletes a category.
 * Returns true if the row was found and deleted.
 */
export async function softDeleteCategory(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`[categoryRepo.softDeleteCategory] ${error.message}`)
  return (data?.length ?? 0) > 0
}
