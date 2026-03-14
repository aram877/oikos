'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { MessageRow } from '@/db/types'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

export type RealtimeStatus = 'connecting' | 'connected' | 'error'

function lastSeenKey(conversationId: 'group' | string): string {
  return conversationId === 'group'
    ? 'msgs_last_seen_group'
    : `msgs_last_seen_dm_${conversationId}`
}

function belongsToConversation(
  msg: MessageRow,
  conversationId: 'group' | string,
  currentUserId: string | null,
): boolean {
  if (conversationId === 'group') {
    return msg.recipient_id === null
  }
  // DM: either direction between current user and partner
  return (
    (msg.user_id === currentUserId && msg.recipient_id === conversationId) ||
    (msg.user_id === conversationId && msg.recipient_id === currentUserId)
  )
}

export function useMessages(conversationId: 'group' | string) {
  const [messages,     setMessages]     = useState<MessageRow[]>([])
  const [status,       setStatus]       = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,        setError]        = useState<string | null>(null)
  const [rtStatus,     setRtStatus]     = useState<RealtimeStatus>('connecting')
  const [reconnectKey, setReconnectKey] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const accountIdRef                    = useRef<string | null>(null)
  const currentUserIdRef                = useRef<string | null>(null)

  // ── Resolve current user on mount ────────────────────────────────────────── //

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
      currentUserIdRef.current = data.user?.id ?? null
    })
  }, [])

  // ── Mark last-seen on mount ───────────────────────────────────────────────── //

  useEffect(() => {
    localStorage.setItem(lastSeenKey(conversationId), new Date().toISOString())
  }, [conversationId])

  // ── Initial load ─────────────────────────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMessages([])

    async function load() {
      try {
        const recipientId = conversationId === 'group' ? null : conversationId
        const rows = await dbClient.messages.list({ recipientId })
        if (!cancelled) {
          setMessages(rows)
          setStatus('loaded')
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

  // ── Realtime subscription ─────────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()

    // Resolve account ID for the filter
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
          // Only append if it belongs to this conversation
          if (!belongsToConversation(newMsg, conversationId, currentUserIdRef.current)) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
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
  }, [reconnectKey, conversationId])

  // ── Mutations ─────────────────────────────────────────────────────────────── //

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
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      throw err
    }
  }, [conversationId])

  const reconnect = useCallback(() => {
    setRtStatus('connecting')
    setReconnectKey((k) => k + 1)
  }, [])

  return { messages, status, error, rtStatus, reconnectKey, currentUserId, send, reconnect }
}
