/**
 * Smart subscription detector — pure-TS, no deps.
 *
 * Scans a window of transactions and surfaces "this looks like a
 * subscription you aren't tracking yet" suggestions.  Specifically:
 *
 *   • outflows only, not transfers, not already linked
 *   • not matching any existing subscription pattern (the matcher would
 *     auto-link those after a backfill)
 *   • grouped by (normalized description + amount bucket)
 *   • ≥ 3 charges
 *   • interval between charges matches a recognizable cadence within
 *     tolerance (low variance — drops one-off "recurring-looking" noise)
 *
 * Each suggestion carries a stable fingerprint; the same group always
 * produces the same fingerprint so account-wide dismissals (stored
 * server-side) survive across regenerations.
 */

import type {
  TransactionListRow,
  SubscriptionMatchPatternRow,
  SubscriptionCadence,
} from '@/db/types'
import { matchSubscription } from './subscriptionMatcher'

// ── Tunables ──────────────────────────────────────────────────────────────── //

const MIN_CHARGES = 3
/** Reject groups whose interval (max-min)/median ratio exceeds this. */
const MAX_INTERVAL_VARIANCE = 0.4
/** Bucket width for amount grouping, in cents.  €1 covers minor FX drift. */
const AMOUNT_BUCKET_CENTS = 100

// ── Public types ──────────────────────────────────────────────────────────── //

export interface SubscriptionSuggestion {
  fingerprint:        string
  suggestedName:      string
  sampleDescription:  string
  amountCents:        number          // signed; expense (negative)
  cadence:            SubscriptionCadence
  chargeCount:        number
  firstSeen:          string          // YYYY-MM-DD
  lastSeen:           string          // YYYY-MM-DD
  intervalDaysMedian: number
  intervalVariance:   number          // 0..1
  transactions:       TransactionListRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────── //

function normalize(description: string): string {
  // Strip trailing reference codes BEFORE lowercasing so the case-sensitive
  // [A-Z0-9] regex actually fires.
  let s = description.trim()
  s = s.replace(/\s+[A-Z0-9]{6,}$/, '').trim()
  s = s.replace(/\s*\d{4,}.*$/, '').trim()

  s = s.toLowerCase()
  const prefixes = ['kartenzahlung', 'lastschrift', 'sepa', 'pos', 'nfc', 'paypal *', 'visa']
  let changed = true
  while (changed) {
    changed = false
    for (const p of prefixes) {
      if (s.startsWith(p)) { s = s.slice(p.length).trim(); changed = true }
    }
  }
  const words = s.split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(' ')
}

/** Stable 32-bit FNV-1a hash → hex string. */
function fnv1a32(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function makeFingerprint(normalizedDesc: string, amountCents: number): string {
  const bucket = Math.round(Math.abs(amountCents) / AMOUNT_BUCKET_CENTS) * AMOUNT_BUCKET_CENTS
  return fnv1a32(`${normalizedDesc}|${bucket}`)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const a = new Date(laterIso).getTime()
  const b = new Date(earlierIso).getTime()
  return Math.abs(Math.round((a - b) / 86_400_000))
}

function detectCadence(medianInterval: number): SubscriptionCadence | null {
  if (medianInterval >= 5   && medianInterval <= 9)   return 'weekly'
  if (medianInterval >= 12  && medianInterval <= 16)  return 'biweekly'
  if (medianInterval >= 26  && medianInterval <= 34)  return 'monthly'
  if (medianInterval >= 85  && medianInterval <= 95)  return 'quarterly'
  if (medianInterval >= 355 && medianInterval <= 375) return 'yearly'
  return null
}

function prettifyName(description: string): string {
  // Take a normalized version, title-case the first 2-3 informative words.
  const stripped = normalize(description)
    .replace(/[*_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = stripped.split(' ').filter((w) => w.length >= 2).slice(0, 3)
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || description.slice(0, 40)
}

// ── Detection ─────────────────────────────────────────────────────────────── //

export interface DetectInput {
  transactions:        TransactionListRow[]
  existingPatterns:    SubscriptionMatchPatternRow[]
  dismissedFingerprints: ReadonlySet<string>
}

export function detectSuggestions(input: DetectInput): SubscriptionSuggestion[] {
  const { transactions, existingPatterns, dismissedFingerprints } = input

  // 1. Filter candidates.
  const candidates = transactions.filter((t) =>
    !t.is_transfer
    && t.subscription_id == null
    && t.amount_cents < 0
    && matchSubscription(existingPatterns, { description: t.description, amount_cents: t.amount_cents }) === null,
  )

  // 2. Group by fingerprint.
  const groups = new Map<string, TransactionListRow[]>()
  for (const tx of candidates) {
    const fp = makeFingerprint(normalize(tx.description), tx.amount_cents)
    const bucket = groups.get(fp) ?? []
    bucket.push(tx)
    groups.set(fp, bucket)
  }

  // 3. Score each group.
  const out: SubscriptionSuggestion[] = []

  for (const [fp, group] of groups) {
    if (dismissedFingerprints.has(fp))     continue
    if (group.length < MIN_CHARGES)        continue

    group.sort((a, b) => a.date.localeCompare(b.date))

    const intervals: number[] = []
    for (let i = 1; i < group.length; i++) {
      intervals.push(daysBetween(group[i].date, group[i - 1].date))
    }

    const med = median(intervals)
    const cadence = detectCadence(med)
    if (!cadence) continue

    const min = Math.min(...intervals)
    const max = Math.max(...intervals)
    const variance = med > 0 ? (max - min) / med : 1
    if (variance > MAX_INTERVAL_VARIANCE) continue

    // Use the median amount as the "expected" — robust to one weird month.
    const amounts = group.map((t) => t.amount_cents)
    const medAmount = median(amounts)

    out.push({
      fingerprint:        fp,
      suggestedName:      prettifyName(group[group.length - 1].description),
      sampleDescription:  group[group.length - 1].description,
      amountCents:        Math.round(medAmount),
      cadence,
      chargeCount:        group.length,
      firstSeen:          group[0].date,
      lastSeen:           group[group.length - 1].date,
      intervalDaysMedian: med,
      intervalVariance:   variance,
      transactions:       group,
    })
  }

  // Most recently active first; tie by charge count.
  out.sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen < b.lastSeen ? 1 : -1
    return b.chargeCount - a.chargeCount
  })

  return out
}

export const __test__ = { normalize, makeFingerprint, detectCadence, prettifyName }
