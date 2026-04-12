'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CategorizationRuleRow, InsertCategorizationRuleInput } from '@/db/types'

export type RecatStatus = 'idle' | 'running' | 'done'

export function useCategorizationRules() {
  const [rules,   setRules]   = useState<CategorizationRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [recatStatus,  setRecatStatus]  = useState<RecatStatus>('idle')
  const [recatCurrent, setRecatCurrent] = useState(0)
  const [recatTotal,   setRecatTotal]   = useState(0)
  const [recatApplied, setRecatApplied] = useState(0)
  const runningRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await dbClient.categorizationRules.list()
      setRules(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRule = useCallback(async (input: InsertCategorizationRuleInput) => {
    const rule = await dbClient.categorizationRules.insert(input)
    setRules(prev => [...prev, rule])
  }, [])

  const removeRule = useCallback(async (id: string) => {
    await dbClient.categorizationRules.delete(id)
    setRules(prev => prev.filter(r => r.id !== id))
  }, [])

  const recategorize = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setRecatStatus('running')
    setRecatCurrent(0)
    setRecatApplied(0)

    try {
      const [transactions, currentRules] = await Promise.all([
        dbClient.transactions.listAllActive(),
        dbClient.categorizationRules.list(),
      ])
      setRecatTotal(transactions.length)

      let applied = 0
      for (let i = 0; i < transactions.length; i++) {
        const tx  = transactions[i]
        const abs = Math.abs(tx.amount_cents)
        setRecatCurrent(i + 1)

        for (const rule of currentRules) {
          const descMatch = tx.description.toLowerCase().includes(rule.description_contains.toLowerCase())
          const minOk     = rule.amount_min_cents === null || abs >= rule.amount_min_cents
          const maxOk     = rule.amount_max_cents === null || abs <= rule.amount_max_cents
          if (descMatch && minOk && maxOk) {
            if (tx.category_id !== rule.category_id) {
              await dbClient.transactions.update(tx.id, { category_id: rule.category_id })
              applied++
            }
            break
          }
        }
      }

      setRecatApplied(applied)
    } finally {
      setRecatStatus('done')
      runningRef.current = false
    }
  }, [])

  return { rules, loading, error, addRule, removeRule, recategorize, recatStatus, recatCurrent, recatTotal, recatApplied }
}
