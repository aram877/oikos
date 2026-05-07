'use client'

import { useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { SubscriptionRow, SubscriptionSpendRow } from '@/db/types'

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function useSubscriptions() {
  const [items,  setItems]  = useState<SubscriptionRow[]>([])
  const [spend,  setSpend]  = useState<Record<string, SubscriptionSpendRow>>({})
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,  setError]  = useState<string | null>(null)

  async function reload() {
    try {
      setStatus('loading')
      setError(null)
      const [subs, rollup] = await Promise.all([
        dbClient.subscriptions.list(),
        dbClient.subscriptions.spend(thirtyDaysAgo(), tomorrow()),
      ])
      setItems(subs)
      const map: Record<string, SubscriptionSpendRow> = {}
      for (const r of rollup) map[r.subscription_id] = r
      setSpend(map)
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [])

  return { items, spend, status, error, reload }
}
