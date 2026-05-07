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

export interface MessageReadRow {
  user_id:         string
  account_id:      string
  conversation_id: string   // 'group' | partner userId
  last_read_at:    string   // ISO-8601
}

const EPOCH = new Date(0).toISOString()

// ── Helpers ─────────────────────────────────────────────────────────────── //

async function requireUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('[messagesRepo] Not authenticated')
  return id
}

// ── Queries ─────────────────────────────────────────────────────────────── //

/**
 * Lists messages for a specific conversation (group or DM), oldest first.
 */
export async function listMessages(options: ListMessagesOptions): Promise<MessageRow[]> {
  const { recipientId, limit = 200 } = options
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const userId    = await requireUserId()

  let query = supabase
    .from('messages')
    .select('id, account_id, user_id, recipient_id, body, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (recipientId === null) {
    query = query.is('recipient_id', null)
  } else {
    query = query.or(
      `and(user_id.eq.${userId},recipient_id.eq.${recipientId}),and(user_id.eq.${recipientId},recipient_id.eq.${userId})`,
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
  const userId    = await requireUserId()

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
  const userId    = await requireUserId()

  const previews: ConversationPreview[] = []

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

  for (const partnerId of partnerIds) {
    const { data: dmData } = await supabase
      .from('messages')
      .select('id, account_id, user_id, recipient_id, body, created_at')
      .eq('account_id', accountId)
      .or(
        `and(user_id.eq.${userId},recipient_id.eq.${partnerId}),and(user_id.eq.${partnerId},recipient_id.eq.${userId})`,
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

// ── Read tracking (server-side replacement for localStorage) ─────────────── //

/**
 * Upserts the current user's last_read_at for a conversation to now().
 * Triggers also delete any unread `message`-type notifications for that
 * conversation, so the bell auto-clears when the user opens the chat.
 */
export async function markConversationRead(conversationId: 'group' | string): Promise<void> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const userId    = await requireUserId()

  const { error } = await supabase
    .from('message_reads')
    .upsert(
      {
        user_id:         userId,
        account_id:      accountId,
        conversation_id: conversationId,
        last_read_at:    new Date().toISOString(),
      },
      { onConflict: 'user_id,account_id,conversation_id' },
    )

  if (error) throw new Error(`[messagesRepo.markConversationRead] ${error.message}`)
}

/**
 * Returns every read row for the active account that the current user is
 * allowed to see (own + other members, for read receipts).
 */
export async function listAccountReads(): Promise<MessageReadRow[]> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase
    .from('message_reads')
    .select('user_id, account_id, conversation_id, last_read_at')
    .eq('account_id', accountId)

  if (error) throw new Error(`[messagesRepo.listAccountReads] ${error.message}`)
  return (data ?? []) as MessageReadRow[]
}

/**
 * Returns the current user's last_read_at for one conversation, or epoch if
 * never read.
 */
export async function getMyLastRead(conversationId: 'group' | string): Promise<string> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()
  const userId    = await requireUserId()

  const { data, error } = await supabase
    .from('message_reads')
    .select('last_read_at')
    .eq('user_id',         userId)
    .eq('account_id',      accountId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (error) throw new Error(`[messagesRepo.getMyLastRead] ${error.message}`)
  return (data?.last_read_at as string | undefined) ?? EPOCH
}

/**
 * Returns the total unread-message count for the current user across all
 * conversations in the active account.  Powers the nav-bar badge.
 */
export async function getUnreadMessageCount(): Promise<number> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data, error } = await supabase.rpc('get_unread_message_count', {
    p_account_id: accountId,
  })

  if (error) throw new Error(`[messagesRepo.getUnreadMessageCount] ${error.message}`)
  return Number(data ?? 0)
}
