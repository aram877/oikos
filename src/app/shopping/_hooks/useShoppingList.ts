'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { ShoppingItemRow } from '@/db/types'
import { getSupabase } from '@/db/supabase'

export type RealtimeStatus = 'connecting' | 'connected' | 'error'

export function useShoppingList() {
  const [items,        setItems]        = useState<ShoppingItemRow[]>([])
  const [status,       setStatus]       = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,        setError]        = useState<string | null>(null)
  const [rtStatus,     setRtStatus]     = useState<RealtimeStatus>('connecting')
  const [reconnectKey, setReconnectKey] = useState(0)
  const accountIdRef                   = useRef<string | null>(null)

  // ── Initial load ────────────────────────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const rows = await dbClient.shopping.list()
        if (!cancelled) {
          setItems(rows)
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

  // ── Realtime subscription ────────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()

    supabase.from('account_members')
      .select('account_id')
      .order('joined_at', { ascending: true })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) accountIdRef.current = data.account_id as string
      })

    // Timeout: if still connecting after 10 s, mark as error
    const timeoutId = setTimeout(() => {
      setRtStatus((prev) => prev === 'connecting' ? 'error' : prev)
    }, 10_000)

    const channel = supabase
      .channel(`shopping_items_rt_${reconnectKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_items' },
        (payload) => {
          const newItem = payload.new as ShoppingItemRow
          setItems((prev) => {
            if (prev.some((i) => i.id === newItem.id)) return prev
            return [...prev, newItem]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_items' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setItems((prev) => prev.filter((i) => i.id !== deletedId))
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

  // ── Mutations ────────────────────────────────────────────────────────────── //

  const addItem = useCallback(async (name: string, quantity?: string) => {
    const optimistic: ShoppingItemRow = {
      id:         `optimistic-${Date.now()}`,
      account_id: accountIdRef.current ?? '',
      name,
      quantity:   quantity ?? null,
      added_by:   null,
      created_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])

    try {
      const created = await dbClient.shopping.insert({ name, quantity: quantity || null })
      setItems((prev) => prev.map((i) => i.id === optimistic.id ? created : i))
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id))
      throw err
    }
  }, [])

  const removeItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    try {
      await dbClient.shopping.delete(id)
    } catch {
      // Realtime will handle reconciliation
    }
  }, [])

  const reconnect = useCallback(() => {
    setRtStatus('connecting')
    setReconnectKey((k) => k + 1)
  }, [])

  return { items, status, error, rtStatus, addItem, removeItem, reconnect }
}
