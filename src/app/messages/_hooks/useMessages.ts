'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { MessageRow } from '@/db/types'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'

export type RealtimeStatus = 'connecting' | 'connected' | 'error'

export function useMessages() {
  const [messages,     setMessages]     = useState<MessageRow[]>([])
  const [status,       setStatus]       = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,        setError]        = useState<string | null>(null)
  const [rtStatus,     setRtStatus]     = useState<RealtimeStatus>('connecting')
  const [reconnectKey, setReconnectKey] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const accountIdRef                    = useRef<string | null>(null)

  // ── Resolve current user on mount ────────────────────────────────────────── //

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  // ── Mark last-seen on mount ───────────────────────────────────────────────── //

  useEffect(() => {
    localStorage.setItem('msgs_last_seen', new Date().toISOString())
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const rows = await dbClient.messages.list()
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
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()

    // Resolve account ID for the filter
    getActiveAccountId().then((id) => { accountIdRef.current = id })

    const timeoutId = setTimeout(() => {
      setRtStatus((prev) => prev === 'connecting' ? 'error' : prev)
    }, 10_000)

    const channel = supabase
      .channel(`messages_rt_${reconnectKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as MessageRow
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
  }, [reconnectKey])

  // ── Mutations ─────────────────────────────────────────────────────────────── //

  const send = useCallback(async (body: string) => {
    const optimistic: MessageRow = {
      id:         `optimistic-${Date.now()}`,
      account_id: accountIdRef.current ?? '',
      user_id:    '', // filled after auth check
      body,
      created_at: new Date().toISOString(),
    }

    // Get current user id for optimistic render
    const { data: userData } = await getSupabase().auth.getUser()
    const userId = userData.user?.id ?? ''
    optimistic.user_id = userId

    setMessages((prev) => [...prev, optimistic])

    try {
      const created = await dbClient.messages.insert({ body })
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? created : m))
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      throw err
    }
  }, [])

  const reconnect = useCallback(() => {
    setRtStatus('connecting')
    setReconnectKey((k) => k + 1)
  }, [])

  return { messages, status, error, rtStatus, reconnectKey, currentUserId, send, reconnect }
}
