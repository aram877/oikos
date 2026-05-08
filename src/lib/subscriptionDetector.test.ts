import { describe, it, expect } from 'vitest'
import { detectSuggestions, __test__ } from './subscriptionDetector'
import type { TransactionListRow } from '@/db/types'

const { normalize, makeFingerprint, detectCadence, prettifyName } = __test__

function tx(over: Partial<TransactionListRow>): TransactionListRow {
  return {
    id:                   over.id ?? Math.random().toString(36).slice(2),
    account_id:           'a',
    category_id:          null,
    amount_cents:         -1599,
    currency:             'EUR',
    date:                 '2026-01-15',
    description:          'NETFLIX.COM',
    notes:                null,
    import_hash:          null,
    is_transfer:          false,
    subscription_id:      null,
    created_at:           '2026-01-15T00:00:00Z',
    updated_at:           '2026-01-15T00:00:00Z',
    deleted_at:           null,
    category_name:        null,
    category_parent_id:   null,
    parent_category_name: null,
    ...over,
  }
}

describe('subscriptionDetector', () => {
  it('normalize strips bank prefixes and trailing reference codes', () => {
    expect(normalize('SEPA NETFLIX.COM 12345678')).toBe('netflix.com')
    expect(normalize('Lastschrift Spotify  ABC123XYZ')).toBe('spotify')
  })

  it('cadence detection', () => {
    expect(detectCadence(7)).toBe('weekly')
    expect(detectCadence(14)).toBe('biweekly')
    expect(detectCadence(30)).toBe('monthly')
    expect(detectCadence(90)).toBe('quarterly')
    expect(detectCadence(365)).toBe('yearly')
    expect(detectCadence(20)).toBe(null)   // gap between cadences
  })

  it('prettifyName produces a Title-Cased label', () => {
    expect(prettifyName('NETFLIX.COM 12345')).toMatch(/Netflix/)
  })

  it('fingerprint is stable for the same normalized desc + bucket', () => {
    const a = makeFingerprint('netflix.com', -1599)
    const b = makeFingerprint('netflix.com', -1601)   // same €16 bucket
    expect(a).toBe(b)
    const c = makeFingerprint('netflix.com', -899)    // different bucket
    expect(a).not.toBe(c)
  })

  it('detects a clean monthly subscription (≥3 charges, low variance)', () => {
    const txs: TransactionListRow[] = [
      tx({ id: '1', date: '2025-12-15', amount_cents: -1599 }),
      tx({ id: '2', date: '2026-01-15', amount_cents: -1599 }),
      tx({ id: '3', date: '2026-02-15', amount_cents: -1599 }),
      tx({ id: '4', date: '2026-03-15', amount_cents: -1599 }),
    ]
    const out = detectSuggestions({
      transactions: txs,
      existingPatterns: [],
      dismissedFingerprints: new Set(),
    })
    expect(out).toHaveLength(1)
    expect(out[0].cadence).toBe('monthly')
    expect(out[0].chargeCount).toBe(4)
    expect(out[0].amountCents).toBe(-1599)
  })

  it('skips groups already covered by an existing pattern', () => {
    const txs = [
      tx({ id: '1', date: '2026-01-15' }),
      tx({ id: '2', date: '2026-02-15' }),
      tx({ id: '3', date: '2026-03-15' }),
    ]
    const out = detectSuggestions({
      transactions: txs,
      existingPatterns: [{
        id: 'p', subscription_id: 's', description_contains: 'NETFLIX',
        amount_min_cents: null, amount_max_cents: null, created_at: '2026-01-01',
      }],
      dismissedFingerprints: new Set(),
    })
    expect(out).toHaveLength(0)
  })

  it('respects dismissed fingerprints', () => {
    const txs = [
      tx({ id: '1', date: '2026-01-15' }),
      tx({ id: '2', date: '2026-02-15' }),
      tx({ id: '3', date: '2026-03-15' }),
    ]
    const fp = makeFingerprint('netflix.com', -1599)
    const out = detectSuggestions({
      transactions: txs, existingPatterns: [], dismissedFingerprints: new Set([fp]),
    })
    expect(out).toHaveLength(0)
  })

  it('rejects high-variance interval groups', () => {
    const txs = [
      tx({ id: '1', date: '2026-01-01' }),
      tx({ id: '2', date: '2026-01-15' }),  // 14d
      tx({ id: '3', date: '2026-04-15' }),  // 90d — too erratic
    ]
    const out = detectSuggestions({
      transactions: txs, existingPatterns: [], dismissedFingerprints: new Set(),
    })
    expect(out).toHaveLength(0)
  })

  it('skips transfers, incomes, and already-linked transactions', () => {
    const txs = [
      tx({ id: '1', date: '2026-01-15', is_transfer:    true }),
      tx({ id: '2', date: '2026-02-15', is_transfer:    true }),
      tx({ id: '3', date: '2026-03-15', is_transfer:    true }),
      tx({ id: '4', date: '2026-01-15', amount_cents:    1599 }),    // income
      tx({ id: '5', date: '2026-02-15', amount_cents:    1599 }),
      tx({ id: '6', date: '2026-03-15', amount_cents:    1599 }),
      tx({ id: '7', date: '2026-01-15', subscription_id: 'sub' }),
      tx({ id: '8', date: '2026-02-15', subscription_id: 'sub' }),
      tx({ id: '9', date: '2026-03-15', subscription_id: 'sub' }),
    ]
    const out = detectSuggestions({
      transactions: txs, existingPatterns: [], dismissedFingerprints: new Set(),
    })
    expect(out).toHaveLength(0)
  })
})
