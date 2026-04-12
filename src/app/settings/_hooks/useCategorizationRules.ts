'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CategorizationRuleRow, InsertCategorizationRuleInput } from '@/db/types'

export function useCategorizationRules() {
  const [rules,   setRules]   = useState<CategorizationRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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

  return { rules, loading, error, addRule, removeRule }
}
