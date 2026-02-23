import { useCallback, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { TransactionListRow } from '@/db/types'
import { categorizeWithOllama } from '@/lib/categorize'
import type { CategorizeStatus } from '../_types'

export function useAutoCategorize(
  transactions: TransactionListRow[],
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

    const uncategorized = transactions.filter(tx => tx.category_id === null)

    setCategorizeStatus('running')
    setTotalCount(uncategorized.length)
    setCurrentIndex(0)
    setCategorizedCount(0)

    let applied = 0

    if (uncategorized.length > 0) {
      // Fetch all categories once and build a lowercase name → id map.
      let categoryMap: Map<string, string> = new Map()
      let categoryNames: string[] = []
      try {
        const categories = await dbClient.categories.list()
        for (const cat of categories) {
          categoryMap.set(cat.name.toLowerCase(), cat.id)
        }
        categoryNames = categories.map(c => c.name)
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
          // 1. Check DB history first.
          let categoryName = await dbClient.transactions.findCategoryByDescription(
            tx.description,
          )

          // Reject a history match that would assign an income category to an expense.
          if (categoryName !== null && isExpense && isIncomeName(categoryName)) {
            categoryName = null
          }

          // 2. Fall back to Ollama (with income excluded for expense transactions).
          if (categoryName === null) {
            categoryName = await categorizeWithOllama(tx.description, eligibleNames)
          }

          // 3. Apply if a valid category was found.
          if (categoryName !== null) {
            const categoryId = categoryMap.get(categoryName.toLowerCase())
            if (categoryId !== undefined) {
              await dbClient.transactions.update(tx.id, { category_id: categoryId })
              applied++
            }
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
