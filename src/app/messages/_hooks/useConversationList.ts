'use client'

import { useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { MessageRow } from '@/db/types'
import { useMemberProfiles } from '@/hooks/useMemberNames'
import { relativeTime } from '@/lib/relativeTime'

export interface ConversationItem {
  id:          string          // 'group' | userId
  kind:        'group' | 'dm'
  label:       string
  avatarUrl:   string | null
  lastMessage: MessageRow | null
  lastTime:    string | null   // formatted relative time
  unread:      boolean
}

function lastSeenKey(conversationId: string): string {
  return conversationId === 'group'
    ? 'msgs_last_seen_group'
    : `msgs_last_seen_dm_${conversationId}`
}

export function useConversationList() {
  const { profiles, currentUserId } = useMemberProfiles()
  const [items, setItems] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUserId) return
    if (Object.keys(profiles).length === 0) return

    let cancelled = false

    async function load() {
      try {
        const partnerIds = Object.keys(profiles).filter((id) => id !== currentUserId)
        const previews = await dbClient.messages.previews(partnerIds)

        if (cancelled) return

        const result: ConversationItem[] = []

        for (const preview of previews) {
          const isGroup = preview.conversationId === 'group'
          const label = isGroup
            ? 'Group Chat'
            : (profiles[preview.conversationId]?.name ?? 'Unknown')
          const avatarUrl = isGroup
            ? null
            : (profiles[preview.conversationId]?.avatar_url ?? null)

          const lastMsg = preview.lastMessage
          const lastTime = lastMsg ? relativeTime(lastMsg.created_at) : null

          const lastSeen = localStorage.getItem(lastSeenKey(preview.conversationId))
          const unread = lastMsg !== null && (
            lastSeen === null || lastMsg.created_at > lastSeen
          ) && lastMsg.user_id !== currentUserId

          result.push({
            id:          preview.conversationId,
            kind:        isGroup ? 'group' : 'dm',
            label,
            avatarUrl,
            lastMessage: lastMsg,
            lastTime,
            unread,
          })
        }

        // Sort: conversations with messages first (most recent), then no-message ones
        result.sort((a, b) => {
          if (a.lastMessage && b.lastMessage) {
            return b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
          }
          if (a.lastMessage) return -1
          if (b.lastMessage) return 1
          // Group chat always first among empty
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
  }, [profiles, currentUserId])

  return { items, loading }
}
