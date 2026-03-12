import type { MessageRow, InsertMessageInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

/**
 * Lists the most recent messages for the active account, oldest first.
 */
export async function listMessages(limit = 200): Promise<MessageRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('messages')
    .select('id, account_id, user_id, body, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`[messagesRepo.listMessages] ${error.message}`)
  return (data ?? []) as MessageRow[]
}

/**
 * Inserts a new message and returns the created row.
 */
export async function insertMessage(input: InsertMessageInput): Promise<MessageRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('[messagesRepo.insertMessage] Not authenticated')

  const { data, error } = await supabase
    .from('messages')
    .insert({
      account_id: accountId,
      user_id:    userId,
      body:       input.body,
    })
    .select('id, account_id, user_id, body, created_at')
    .single()

  if (error) throw new Error(`[messagesRepo.insertMessage] ${error.message}`)
  if (!data) throw new Error('[messagesRepo.insertMessage] No row returned')
  return data as MessageRow
}
