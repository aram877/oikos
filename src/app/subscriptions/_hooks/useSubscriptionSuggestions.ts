'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import { detectSuggestions, type SubscriptionSuggestion } from '@/lib/subscriptionDetector'
import { suggestedAmountRange } from '@/lib/subscriptionMatcher'

const LOOKBACK_MONTHS = 12

function lookbackRange(): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - LOOKBACK_MONTHS)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

export function useSubscriptionSuggestions() {
  const [items,     setItems]     = useState<SubscriptionSuggestion[]>([])
  const [status,    setStatus]    = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,     setError]     = useState<string | null>(null)

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const { start, end } = lookbackRange()
      const [txs, patterns, dismissed] = await Promise.all([
        dbClient.transactions.listByDateRange(start, end),
        dbClient.subscriptions.listAllPatterns(),
        dbClient.subscriptions.listDismissed(),
      ])
      const suggestions = detectSuggestions({
        transactions:          txs,
        existingPatterns:      patterns,
        dismissedFingerprints: new Set(dismissed),
      })
      setItems(suggestions)
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [reload])

  /**
   * Track a suggestion: create a subscription, save a default match
   * pattern from the sample description + ±50¢ amount window, and
   * bulk-link every transaction in the suggestion's group.
   */
  const track = useCallback(async (
    s: SubscriptionSuggestion,
    overrides?: { name?: string; categoryId?: string | null },
  ): Promise<string> => {
    const sub = await dbClient.subscriptions.insert({
      name:                  overrides?.name?.trim() || s.suggestedName,
      cadence:               s.cadence,
      expected_amount_cents: s.amountCents,
      category_id:           overrides?.categoryId ?? null,
    })

    // Default pattern: first informative token of the sample description,
    // with a ±50¢ amount range (handles aggregator descriptions like
    // APPLE.COM/BILL where amount narrowing is the only disambiguator).
    const patternDesc = pickPatternToken(s.sampleDescription)
    const range = suggestedAmountRange(s.amountCents)
    await dbClient.subscriptions.insertPattern({
      subscription_id:      sub.id,
      description_contains: patternDesc,
      amount_min_cents:     range.min,
      amount_max_cents:     range.max,
    })

    // Bulk-link the suggestion's transactions.
    await dbClient.subscriptions.linkTransactionsBulk(
      s.transactions.map((t) => t.id),
      sub.id,
    )

    setItems((prev) => prev.filter((x) => x.fingerprint !== s.fingerprint))
    return sub.id
  }, [])

  const dismiss = useCallback(async (s: SubscriptionSuggestion) => {
    setItems((prev) => prev.filter((x) => x.fingerprint !== s.fingerprint))
    try {
      await dbClient.subscriptions.dismiss(s.fingerprint)
    } catch (err) {
      // Roll back UI on failure
      setItems((prev) => [...prev, s])
      throw err
    }
  }, [])

  return { items, status, error, reload, track, dismiss }
}

/**
 * Picks a sensible substring to use as a default match pattern.
 * Prefers a long uppercase token (likely the merchant), otherwise the
 * first 30 characters of the description.
 */
function pickPatternToken(description: string): string {
  // Find an all-uppercase token of length >= 4.
  const m = description.match(/\b[A-Z][A-Z0-9*.\-/]{3,}\b/)
  if (m) return m[0]
  return description.slice(0, 30).trim()
}
