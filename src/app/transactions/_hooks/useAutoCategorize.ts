import { useCallback, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { TransactionListRow, CategorizationRuleRow } from '@/db/types'
import { categorizeWithOllama } from '@/lib/categorize'
import type { CategorizeStatus } from '../_types'

function matchRule(rules: CategorizationRuleRow[], tx: TransactionListRow): string | null {
  const abs = Math.abs(tx.amount_cents)
  for (const rule of rules) {
    const descMatch = tx.description.toLowerCase().includes(rule.description_contains.toLowerCase())
    const minOk     = rule.amount_min_cents === null || abs >= rule.amount_min_cents
    const maxOk     = rule.amount_max_cents === null || abs <= rule.amount_max_cents
    if (descMatch && minOk && maxOk) return rule.category_id
  }
  return null
}

export function useAutoCategorize(
  transactions: TransactionListRow[] | null,  // null = fetch all uncategorized globally
  reload: () => void,
): {
  categorizeStatus: CategorizeStatus
  currentIndex: number
  totalCount: number
  categorizedCount: number
  startCategorize: () => Promise<void>
  dismissResult: () => void
} {
  const [categorizeStatus, setCategorizeStatus] = useState<CategorizeStatus>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [categorizedCount, setCategorizedCount] = useState(0)

  const runningRef = useRef(false)

  const startCategorize = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true

    setCategorizeStatus('running')
    setTotalCount(0)
    setCurrentIndex(0)
    setCategorizedCount(0)

    await dbClient.init()
    const uncategorized = transactions === null
      ? await dbClient.transactions.listUncategorized()
      : transactions.filter(tx => tx.category_id === null)

    setTotalCount(uncategorized.length)

    let applied = 0

    if (uncategorized.length > 0) {
      // Fetch all categories once and build a lowercase name → id map.
      let categoryMap: Map<string, string> = new Map()
      let categoryNames: string[] = []
      let rules: CategorizationRuleRow[] = []
      try {
        const [categories, loadedRules] = await Promise.all([
          dbClient.categories.list(),
          dbClient.categorizationRules.list(),
        ])
        for (const cat of categories) {
          categoryMap.set(cat.name.toLowerCase(), cat.id)
        }
        categoryNames = categories.map(c => c.name)
        rules = loadedRules
      } catch {
        // If we can't load categories, just finish with 0 applied.
        setCategorizeStatus('done')
        setCategorizedCount(0)
        runningRef.current = false
        reload()
        return
      }

      const isIncomeName = (name: string) => name.toLowerCase().includes('income')

      for (let i = 0; i < uncategorized.length; i++) {
        const tx = uncategorized[i]
        setCurrentIndex(i + 1)

        // For negative (expense) transactions, income categories are not valid.
        const isExpense = tx.amount_cents < 0
        const eligibleNames = isExpense
          ? categoryNames.filter(n => !isIncomeName(n))
          : categoryNames

        try {
          // 0. Check rules first (instant, no AI needed).
          let categoryId = matchRule(rules, tx) ?? undefined

          if (categoryId === undefined) {
            // 1. Check DB history.
            let categoryName = await dbClient.transactions.findCategoryByDescription(tx.description)

            // Reject a history match that would assign an income category to an expense.
            if (categoryName !== null && isExpense && isIncomeName(categoryName)) {
              categoryName = null
            }

            // 2. Fall back to Ollama.
            if (categoryName === null) {
              categoryName = await categorizeWithOllama(tx.description, eligibleNames)
            }

            if (categoryName !== null) {
              categoryId = categoryMap.get(categoryName.toLowerCase())
            }
          }

          // 3. Apply if a category was found.
          if (categoryId !== undefined) {
            await dbClient.transactions.update(tx.id, { category_id: categoryId })
            applied++
          }
        } catch {
          // Skip this transaction and continue with the rest.
        }
      }
    }

    setCategorizeStatus('done')
    setCategorizedCount(applied)
    runningRef.current = false
    reload()
  }, [transactions, reload])

  const dismissResult = useCallback(() => {
    setCategorizeStatus('idle')
  }, [])

  return {
    categorizeStatus,
    currentIndex,
    totalCount,
    categorizedCount,
    startCategorize,
    dismissResult,
  }
}
