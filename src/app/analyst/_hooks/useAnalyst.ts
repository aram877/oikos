'use client'

import { useCallback, useState } from 'react'
import { dbClient } from '@/db/db.client'
import { buildReport } from '@/lib/analyst'
import { analyzeWithAI } from '@/lib/analyzeWithAI'
import { useAiConfig } from '@/lib/aiConfig'
import type { AnalystReport } from '@/lib/analyst'

export function useAnalyst(): {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  error: string | null
  report: AnalystReport | null
  generate: (months: number, customStart?: string, customEnd?: string) => void
  aiInsights: string | null
  aiStatus: 'idle' | 'loading' | 'done' | 'error'
  aiError: string | null
  generateInsights: () => void
} {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [report, setReport] = useState<AnalystReport | null>(null)

  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [aiStatus,   setAiStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [aiError,    setAiError]    = useState<string | null>(null)

  const { config: aiConfig } = useAiConfig()

  const generate = useCallback((months: number, customStart?: string, customEnd?: string) => {
    setStatus('loading')
    setError(null)

    let cancelled = false

    async function load() {
      try {
        await dbClient.init()

        let startDate: string
        let endDate: string

        if (customStart && customEnd) {
          startDate = customStart
          // endDate is exclusive — add 1 day to the selected end date
          const endD = new Date(customEnd + 'T00:00:00Z')
          endD.setUTCDate(endD.getUTCDate() + 1)
          endDate = endD.toISOString().slice(0, 10)
        } else {
          const now      = new Date()
          const endYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
          const endMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
          endDate  = `${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-01`

          const endD   = new Date(endDate + 'T00:00:00Z')
          const startD = new Date(endD)
          startD.setUTCMonth(startD.getUTCMonth() - months)
          startDate = startD.toISOString().slice(0, 10)
        }

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

  const generateInsights = useCallback(() => {
    if (!report) return
    setAiStatus('loading')
    setAiError(null)
    analyzeWithAI(report, aiConfig)
      .then(text => { setAiInsights(text); setAiStatus('done') })
      .catch(err  => { setAiError(err instanceof Error ? err.message : String(err)); setAiStatus('error') })
  }, [report, aiConfig])

  return { status, error, report, generate, aiInsights, aiStatus, aiError, generateInsights }
}
