'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type {
  SubscriptionRow,
  SubscriptionMatchPatternRow,
  TransactionListRow,
  UpdateSubscriptionInput,
  InsertSubscriptionMatchPatternInput,
} from '@/db/types'

export function useSubscriptionDetail(id: string) {
  const [sub,      setSub]      = useState<SubscriptionRow | null>(null)
  const [patterns, setPatterns] = useState<SubscriptionMatchPatternRow[]>([])
  const [history,  setHistory]  = useState<TransactionListRow[]>([])
  const [status,   setStatus]   = useState<'loading' | 'loaded' | 'not-found' | 'error'>('loading')
  const [error,    setError]    = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setStatus('loading')
      setError(null)
      const row = await dbClient.subscriptions.get(id)
      if (!row) { setStatus('not-found'); return }
      const [pats, txs] = await Promise.all([
        dbClient.subscriptions.listPatterns(id),
        dbClient.subscriptions.transactions(id),
      ])
      setSub(row)
      setPatterns(pats)
      setHistory(txs)
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [reload])

  const update = useCallback(async (input: UpdateSubscriptionInput) => {
    const next = await dbClient.subscriptions.update(id, input)
    if (next) setSub(next)
  }, [id])

  const addPattern = useCallback(async (input: Omit<InsertSubscriptionMatchPatternInput, 'subscription_id'>) => {
    const created = await dbClient.subscriptions.insertPattern({ ...input, subscription_id: id })
    setPatterns((prev) => [...prev, created])
  }, [id])

  const removePattern = useCallback(async (patternId: string) => {
    await dbClient.subscriptions.deletePattern(patternId)
    setPatterns((prev) => prev.filter((p) => p.id !== patternId))
  }, [])

  const softDelete = useCallback(async () => {
    await dbClient.subscriptions.softDelete(id)
  }, [id])

  return { sub, patterns, history, status, error, reload, update, addPattern, removePattern, softDelete }
}
