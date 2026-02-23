'use client'

import { useCallback, useState } from 'react'
import { dbClient } from '@/db/db.client'
import { buildReport } from '@/lib/analyst'
import type { AnalystReport } from '@/lib/analyst'

export function useAnalyst(): {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  error: string | null
  report: AnalystReport | null
  generate: () => void
} {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [report, setReport] = useState<AnalystReport | null>(null)

  const generate = useCallback(() => {
    setStatus('loading')
    setError(null)

    let cancelled = false

    async function load() {
      try {
        await dbClient.init()

        const now = new Date()
        const endYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
        const endMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
        const endDate  = `${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-01`

        const endD   = new Date(endDate + 'T00:00:00Z')
        const startD = new Date(endD)
        startD.setUTCMonth(startD.getUTCMonth() - 3)
        const startDate = startD.toISOString().slice(0, 10)

        const txs = await dbClient.transactions.listByDateRange(startDate, endDate)

        if (cancelled) return

        const r = buildReport(txs, startDate, endDate)
        setReport(r)
        setStatus('loaded')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { status, error, report, generate }
}
