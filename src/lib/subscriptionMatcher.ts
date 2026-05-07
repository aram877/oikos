/**
 * Pure-TS subscription matcher.
 *
 * Given a transaction (description + amount) and the set of patterns for the
 * account, returns the *most specific* matching subscription id, or null.
 *
 * Specificity ranking (most → least):
 *   1. Both amount bounds set         (narrowest range — disambiguates aggregators like APPLE.COM/BILL)
 *   2. One amount bound set
 *   3. Longer description_contains    (longer string ⇒ more specific token)
 *   4. Older pattern (created_at)     (deterministic tiebreak)
 *
 * The matcher is the same shape as categorization rules' first-match-wins
 * but with a smarter ranking, because subscription matching needs to handle
 * shared-name aggregators where an exact-amount rule must beat a generic
 * description rule.
 */

import type { SubscriptionMatchPatternRow } from '@/db/types'

export interface CandidateTransaction {
  description: string
  amount_cents: number
}

function rangeWidth(min: number | null, max: number | null): number {
  if (min !== null && max !== null) return Math.max(0, max - min)
  return Number.POSITIVE_INFINITY
}

function rangeBounds(min: number | null, max: number | null): number {
  return (min !== null ? 1 : 0) + (max !== null ? 1 : 0)
}

function patternMatches(pattern: SubscriptionMatchPatternRow, tx: CandidateTransaction): boolean {
  const haystack = tx.description.toLowerCase()
  const needle   = pattern.description_contains.toLowerCase()
  if (!haystack.includes(needle)) return false

  const abs = Math.abs(tx.amount_cents)
  if (pattern.amount_min_cents !== null && abs < pattern.amount_min_cents) return false
  if (pattern.amount_max_cents !== null && abs > pattern.amount_max_cents) return false
  return true
}

/**
 * Returns the subscription_id of the best-matching pattern, or null.
 */
export function matchSubscription(
  patterns: SubscriptionMatchPatternRow[],
  tx: CandidateTransaction,
): string | null {
  let best: SubscriptionMatchPatternRow | null = null

  for (const p of patterns) {
    if (!patternMatches(p, tx)) continue
    if (best === null) { best = p; continue }

    // Prefer the more specific pattern.
    const a = best
    const b = p

    const aBounds = rangeBounds(a.amount_min_cents, a.amount_max_cents)
    const bBounds = rangeBounds(b.amount_min_cents, b.amount_max_cents)
    if (bBounds !== aBounds) { if (bBounds > aBounds) best = b; continue }

    const aWidth = rangeWidth(a.amount_min_cents, a.amount_max_cents)
    const bWidth = rangeWidth(b.amount_min_cents, b.amount_max_cents)
    if (bWidth !== aWidth) { if (bWidth < aWidth) best = b; continue }

    if (b.description_contains.length !== a.description_contains.length) {
      if (b.description_contains.length > a.description_contains.length) best = b
      continue
    }

    // Tiebreak: older pattern wins for stability.
    if (b.created_at < a.created_at) best = b
  }

  return best?.subscription_id ?? null
}

/**
 * Suggests a sensible default amount range when the user creates a pattern
 * from an existing transaction — useful for aggregator descriptions where
 * narrowing by amount is the only way to distinguish services.
 *
 * Returns a range of [amount - 50¢, amount + 50¢] in absolute cents.
 */
export function suggestedAmountRange(amountCents: number): { min: number; max: number } {
  const abs = Math.abs(amountCents)
  return { min: Math.max(0, abs - 50), max: abs + 50 }
}
