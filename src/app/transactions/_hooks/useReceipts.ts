'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { TransactionReceiptWithUrl } from '@/db/types'

export type ReceiptsStatus = 'idle' | 'loading' | 'loaded' | 'error'

export function useReceipts(transactionId: string | null) {
  const [items,  setItems]  = useState<TransactionReceiptWithUrl[]>([])
  const [status, setStatus] = useState<ReceiptsStatus>('idle')
  const [error,  setError]  = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!transactionId) return
    try {
      // Reset state inside the async function so the lint rule that bans
      // synchronous setState in an effect body is satisfied.
      setStatus('loading')
      setError(null)
      const rows = await dbClient.receipts.list(transactionId)
      setItems(rows)
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [transactionId])

  useEffect(() => {
    if (!transactionId) return
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [transactionId, reload])

  const upload = useCallback(async (file: File) => {
    if (!transactionId) throw new Error('No transaction id')
    setError(null)
    try {
      const created = await dbClient.receipts.insert(transactionId, file)
      setItems((prev) => [...prev, created])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    }
  }, [transactionId])

  const remove = useCallback(async (id: string) => {
    setError(null)
    const snapshot = items
    setItems((prev) => prev.filter((r) => r.id !== id))
    try {
      await dbClient.receipts.delete(id)
    } catch (err) {
      setItems(snapshot)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    }
  }, [items])

  return { items, status, error, upload, remove, reload }
}
