import type {
  WikiPageRow,
  InsertWikiPageInput,
  UpdateWikiPageInput,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const SELECT = `id, account_id, title, body, created_by, updated_by, created_at, updated_at, deleted_at`

export async function listPages(): Promise<WikiPageRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data, error } = await supabase
    .from('wiki_pages')
    .select(SELECT)
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`[wikiRepo.listPages] ${error.message}`)
  return (data ?? []) as WikiPageRow[]
}

export async function getPage(id: string): Promise<WikiPageRow | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('wiki_pages')
    .select(SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`[wikiRepo.getPage] ${error.message}`)
  return (data as WikiPageRow | null) ?? null
}

export async function insertPage(input: InsertWikiPageInput): Promise<WikiPageRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id ?? null

  const { data, error } = await supabase
    .from('wiki_pages')
    .insert({
      account_id: accountId,
      title:      input.title.trim(),
      body:       input.body,
      created_by: uid,
      updated_by: uid,
    })
    .select(SELECT)
    .single()
  if (error || !data) throw new Error(`[wikiRepo.insertPage] ${error?.message ?? 'no row'}`)
  return data as WikiPageRow
}

export async function updatePage(id: string, input: UpdateWikiPageInput): Promise<WikiPageRow | null> {
  const supabase = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id ?? null

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: uid }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.body  !== undefined) patch.body  = input.body

  const { data, error } = await supabase
    .from('wiki_pages')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT)
    .maybeSingle()
  if (error) throw new Error(`[wikiRepo.updatePage] ${error.message}`)
  return (data as WikiPageRow | null) ?? null
}

/** Hard-deletes a page.  Admin-only via RLS. */
export async function deletePage(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('wiki_pages')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`[wikiRepo.deletePage] ${error.message}`)
}
