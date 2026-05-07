'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { MessageRow } from '@/db/types'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

export type RealtimeStatus = 'connecting' | 'connected' | 'error'

function belongsToConversation(
  msg: MessageRow,
  conversationId: 'group' | string,
  currentUserId: string | null,
): boolean {
  if (conversationId === 'group') return msg.recipient_id === null
  return (
    (msg.user_id === currentUserId && msg.recipient_id === conversationId) ||
    (msg.user_id === conversationId && msg.recipient_id === currentUserId)
  )
}

export interface UseMessagesResult {
  messages:       MessageRow[]
  status:         'loading' | 'loaded' | 'error'
  error:          string | null
  rtStatus:       RealtimeStatus
  reconnectKey:   number
  currentUserId:  string | null
  /** Partner's last_read_at for this conversation (DM only). null for group / unknown. */
  partnerReadAt:  string | null
  /** Map of user_id → last_read_at for the group convo (excludes current user). */
  groupReads:     Record<string, string>
  send:           (body: string) => Promise<void>
  reconnect:      () => void
}

/**
 * Drives a single conversation: load history, subscribe to realtime inserts,
 * mark the conversation read on mount + on every new message, and surface
 * the partner's read timestamp for read receipts.
 */
export function useMessages(conversationId: 'group' | string): UseMessagesResult {
  const [messages,       setMessages]       = useState<MessageRow[]>([])
  const [status,         setStatus]         = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,          setError]          = useState<string | null>(null)
  const [rtStatus,       setRtStatus]       = useState<RealtimeStatus>('connecting')
  const [reconnectKey,   setReconnectKey]   = useState(0)
  const [currentUserId,  setCurrentUserId]  = useState<string | null>(null)
  const [partnerReadAt,  setPartnerReadAt]  = useState<string | null>(null)
  const [groupReads,     setGroupReads]     = useState<Record<string, string>>({})

  const accountIdRef     = useRef<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  // ── Resolve current user ────────────────────────────────────────────────── //

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null
      setCurrentUserId(id)
      currentUserIdRef.current = id
    })
  }, [])

  // ── Mark read on mount + when conversation changes ──────────────────────── //

  const markRead = useCallback(() => {
    dbClient.messages.markRead(conversationId).catch((err) => {
      console.error('[useMessages] markRead failed:', err)
    })
  }, [conversationId])

  useEffect(() => {
    markRead()
  }, [markRead])

  // Re-mark read whenever the page returns to focus, so the bell stays clean.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') markRead()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markRead])

  // ── Initial load + read state ───────────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Reset previous-conversation state on the microtask after mount,
      // so React lint doesn't flag synchronous setState in an effect body.
      setStatus('loading')
      setMessages([])
      setPartnerReadAt(null)
      setGroupReads({})

      try {
        const recipientId = conversationId === 'group' ? null : conversationId
        const [rows, reads] = await Promise.all([
          dbClient.messages.list({ recipientId }),
          dbClient.messages.listReads(),
        ])
        if (cancelled) return
        setMessages(rows)
        setStatus('loaded')

        const me = currentUserIdRef.current
        if (conversationId === 'group') {
          const map: Record<string, string> = {}
          for (const r of reads) {
            if (r.conversation_id === 'group' && r.user_id !== me) {
              map[r.user_id] = r.last_read_at
            }
          }
          setGroupReads(map)
        } else if (me) {
          // Partner stores their read row keyed by *my* user id.
          const partnerRead = reads.find(
            (r) => r.user_id === conversationId && r.conversation_id === me,
          )
          setPartnerReadAt(partnerRead?.last_read_at ?? null)
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [conversationId])

  // ── Realtime: messages ───────────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()
    getActiveAccountId().then((id) => { accountIdRef.current = id })

    const timeoutId = setTimeout(() => {
      setRtStatus((prev) => prev === 'connecting' ? 'error' : prev)
    }, 10_000)

    const channel = supabase
      .channel(`messages_rt_${conversationId}_${reconnectKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as MessageRow
          if (!belongsToConversation(newMsg, conversationId, currentUserIdRef.current)) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // New incoming message → mark read so the bell never piles up.
          if (newMsg.user_id !== currentUserIdRef.current && document.visibilityState === 'visible') {
            markRead()
          }
        },
      )
      .subscribe((s) => {
        clearTimeout(timeoutId)
        if (s === 'SUBSCRIBED') setRtStatus('connected')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setRtStatus('error')
      })

    return () => {
      clearTimeout(timeoutId)
      supabase.removeChannel(channel)
    }
  }, [reconnectKey, conversationId, markRead])

  // ── Realtime: read-receipts ──────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()

    const channel = supabase
      .channel(`message_reads_rt_${conversationId}_${reconnectKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reads' },
        (payload) => {
          const me = currentUserIdRef.current
          const row = (payload.new ?? payload.old) as {
            user_id:         string
            conversation_id: string
            last_read_at:    string
          }
          if (!row) return

          if (conversationId === 'group') {
            if (row.conversation_id !== 'group' || row.user_id === me) return
            setGroupReads((prev) => ({ ...prev, [row.user_id]: row.last_read_at }))
          } else {
            if (row.user_id === conversationId && row.conversation_id === me) {
              setPartnerReadAt(row.last_read_at)
            }
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [reconnectKey, conversationId])

  // ── Send ─────────────────────────────────────────────────────────────────── //

  const send = useCallback(async (body: string) => {
    const recipientId = conversationId === 'group' ? null : conversationId

    const optimistic: MessageRow = {
      id:           `optimistic-${Date.now()}`,
      account_id:   accountIdRef.current ?? '',
      user_id:      currentUserIdRef.current ?? '',
      recipient_id: recipientId,
      body,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimistic])

    try {
      const created = await dbClient.messages.insert({ body, recipient_id: recipientId })
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? created : m))
      // Sending counts as reading — refresh own read row.
      markRead()
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      throw err
    }
  }, [conversationId, markRead])

  const reconnect = useCallback(() => {
    setRtStatus('connecting')
    setReconnectKey((k) => k + 1)
  }, [])

  return {
    messages, status, error, rtStatus, reconnectKey, currentUserId,
    partnerReadAt, groupReads, send, reconnect,
  }
}
