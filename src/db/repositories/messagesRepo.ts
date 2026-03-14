import type { MessageRow, InsertMessageInput } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

export interface ListMessagesOptions {
  /** null = group chat; string = DM thread with that userId */
  recipientId: string | null
  limit?: number
}

export interface ConversationPreview {
  conversationId: string   // 'group' | userId
  lastMessage:    MessageRow | null
}

/**
 * Lists messages for a specific conversation (group or DM), oldest first.
 */
export async function listMessages(options: ListMessagesOptions): Promise<MessageRow[]> {
  const { recipientId, limit = 200 } = options
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id

  let query = supabase
    .from('messages')
    .select('id, account_id, user_id, recipient_id, body, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (recipientId === null) {
    // Group chat: only null recipient
    query = query.is('recipient_id', null)
  } else {
    // DM: messages between current user and partner (in either direction)
    if (!userId) throw new Error('[messagesRepo.listMessages] Not authenticated')
    query = query.or(
      `and(user_id.eq.${userId},recipient_id.eq.${recipientId}),and(user_id.eq.${recipientId},recipient_id.eq.${userId})`
    )
  }

  const { data, error } = await query
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
      account_id:   accountId,
      user_id:      userId,
      recipient_id: input.recipient_id,
      body:         input.body,
    })
    .select('id, account_id, user_id, recipient_id, body, created_at')
    .single()

  if (error) throw new Error(`[messagesRepo.insertMessage] ${error.message}`)
  if (!data) throw new Error('[messagesRepo.insertMessage] No row returned')
  return data as MessageRow
}

/**
 * Returns the last message for the group chat and each DM partner.
 */
export async function listConversationPreviews(partnerIds: string[]): Promise<ConversationPreview[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('[messagesRepo.listConversationPreviews] Not authenticated')

  const previews: ConversationPreview[] = []

  // Group chat preview
  const { data: groupData } = await supabase
    .from('messages')
    .select('id, account_id, user_id, recipient_id, body, created_at')
    .eq('account_id', accountId)
    .is('recipient_id', null)
    .order('created_at', { ascending: false })
    .limit(1)

  previews.push({
    conversationId: 'group',
    lastMessage: groupData?.[0] as MessageRow | null ?? null,
  })

  // DM previews for each partner
  for (const partnerId of partnerIds) {
    const { data: dmData } = await supabase
      .from('messages')
      .select('id, account_id, user_id, recipient_id, body, created_at')
      .eq('account_id', accountId)
      .or(
        `and(user_id.eq.${userId},recipient_id.eq.${partnerId}),and(user_id.eq.${partnerId},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: false })
      .limit(1)

    previews.push({
      conversationId: partnerId,
      lastMessage: dmData?.[0] as MessageRow | null ?? null,
    })
  }

  return previews
}
