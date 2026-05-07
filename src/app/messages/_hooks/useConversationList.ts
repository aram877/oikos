'use client'

import { useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { MessageRow } from '@/db/types'
import { useMemberProfiles } from '@/hooks/useMemberNames'
import { listTime } from '@/lib/messageTime'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

export interface ConversationItem {
  id:          string                // 'group' | userId
  kind:        'group' | 'dm'
  label:       string
  avatarUrl:   string | null
  lastMessage: MessageRow | null
  lastTime:    string | null         // formatted for the right-side
  unreadCount: number                // 0 = read
  isOwnLast:   boolean               // last message was sent by me
  partnerId:   string | null         // dm partner id (for avatar lookup)
}

export function useConversationList() {
  const { profiles, currentUserId } = useMemberProfiles()
  const [items,   setItems]   = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // ── Realtime: refresh on any message or read change ──────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()
    const channel = supabase
      .channel('conversation_list_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },      () => setReloadKey((k) => k + 1))
      .on('postgres_changes', { event: '*',      schema: 'public', table: 'message_reads' }, () => setReloadKey((k) => k + 1))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    if (Object.keys(profiles).length === 0) return

    let cancelled = false

    async function load() {
      try {
        const partnerIds = Object.keys(profiles).filter((id) => id !== currentUserId)
        const [previews, reads] = await Promise.all([
          dbClient.messages.previews(partnerIds),
          dbClient.messages.listReads(),
        ])
        if (cancelled) return

        // My read map: conversationId → last_read_at
        const myReads = new Map<string, string>()
        for (const r of reads) {
          if (r.user_id === currentUserId) myReads.set(r.conversation_id, r.last_read_at)
        }

        const result: ConversationItem[] = []

        for (const preview of previews) {
          const isGroup = preview.conversationId === 'group'
          const label = isGroup
            ? 'Group Chat'
            : (profiles[preview.conversationId]?.name ?? 'Unknown')
          const avatarUrl = isGroup
            ? null
            : (profiles[preview.conversationId]?.avatar_url ?? null)

          const lastMsg     = preview.lastMessage
          const lastTime    = lastMsg ? listTime(lastMsg.created_at) : null
          const lastReadAt  = myReads.get(preview.conversationId) ?? null

          let unreadCount = 0
          if (lastMsg && lastMsg.user_id !== currentUserId) {
            // Count messages newer than last_read_at and not from current user.
            // We only have the last message in `preview` — but for the badge,
            // a precise count needs another query.  We compute lazily below.
            unreadCount = (lastReadAt === null || lastMsg.created_at > lastReadAt) ? 1 : 0
          }

          result.push({
            id:          preview.conversationId,
            kind:        isGroup ? 'group' : 'dm',
            label,
            avatarUrl,
            lastMessage: lastMsg,
            lastTime,
            unreadCount,
            isOwnLast:   lastMsg?.user_id === currentUserId,
            partnerId:   isGroup ? null : preview.conversationId,
          })
        }

        // Refine unread counts for conversations with at least one unread.
        const stale = result.filter((r) => r.unreadCount > 0)
        if (stale.length > 0) {
          const supabase  = getSupabase()
          const accountId = await getActiveAccountId()
          for (const item of stale) {
            const lastReadAt = myReads.get(item.id) ?? new Date(0).toISOString()
            let q = supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', accountId)
              .neq('user_id', currentUserId)
              .gt('created_at', lastReadAt)
            q = item.kind === 'group'
              ? q.is('recipient_id', null)
              : q.eq('user_id', item.id).eq('recipient_id', currentUserId)
            const { count } = await q
            item.unreadCount = count ?? 0
          }
        }

        result.sort((a, b) => {
          if (a.lastMessage && b.lastMessage) {
            return b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
          }
          if (a.lastMessage) return -1
          if (b.lastMessage) return 1
          if (a.kind === 'group') return -1
          if (b.kind === 'group') return 1
          return 0
        })

        setItems(result)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [profiles, currentUserId, reloadKey])

  return { items, loading }
}
