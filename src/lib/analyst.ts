/**
 * Pure financial analysis engine.
 *
 * Takes a list of TransactionListRow and returns a structured AnalystReport.
 * No async, no side effects, no external dependencies.
 */

import type { TransactionListRow } from '@/db/types'

// ── Exported types ────────────────────────────────────────────────────────── //

export interface AnalystReport {
  periodLabel: string
  cashFlow: CashFlowSummary
  expenseBreakdown: ExpenseBreakdownItem[]
  fixedExpenses: FixedExpenseItem[]
  variableExpenses: VariableExpenseItem[]
  variableTotalCents: number
  recurringPayments: RecurringItem[]
  merchantAnalysis: MerchantItem[]
  anomalies: AnomalyItem[]
}

export interface CashFlowSummary {
  totalIncomeCents: number
  totalExpenseCents: number  // negative
  netCents: number
  transferCount: number
  transfers: TransactionListRow[]
}

export interface SubcategoryItem {
  name: string
  totalCents: number
  count: number
}

export interface ExpenseBreakdownItem {
  category: string
  totalCents: number
  count: number
  pct: number
  subcategories: SubcategoryItem[]
}

export interface FixedExpenseItem {
  name: string
  monthlyAvgCents: number
  months: string[]
}

export interface VariableExpenseItem {
  name: string
  totalCents: number
  count: number
}

export interface RecurringItem {
  name: string
  frequency: 'weekly' | 'biweekly' | 'monthly'
  avgAmountCents: number
  nextExpectedDate: string
}

export interface MerchantItem {
  name: string
  totalCents: number
  txCount: number
  avgCents: number
}

export interface AnomalyItem {
  txId: string
  description: string
  amountCents: number
  date: string
  reason: string
}

// ── Transfer detection ────────────────────────────────────────────────────── //

function isTransfer(tx: TransactionListRow): boolean {
  return tx.is_transfer === true
}

// ── Description normalisation (shared across sections C, D, E) ───────────── //

function normalize(description: string): string {
  let s = description.toLowerCase().trim()

  // Strip leading bank prefixes
  const prefixes = ['kartenzahlung', 'lastschrift', 'sepa', 'pos', 'nfc', 'paypal *', 'visa']
  let changed = true
  while (changed) {
    changed = false
    for (const p of prefixes) {
      if (s.startsWith(p)) {
        s = s.slice(p.length).trim()
        changed = true
      }
    }
  }

  // Strip trailing reference codes (4+ digit sequences or 6+ uppercase alphanumeric)
  s = s.replace(/[\d]{4,}.*$/, '').trim()
  s = s.replace(/\s+[A-Z0-9]{6,}$/, '').trim()

  // Collapse whitespace and take first 5 words
  const words = s.split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(' ')
}

// ── Math helpers ──────────────────────────────────────────────────────────── //

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// ── Date helpers ──────────────────────────────────────────────────────────── //

/** Adds `days` to a YYYY-MM-DD string and returns a new YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Returns the calendar month string "YYYY-MM" for a YYYY-MM-DD date. */
function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Difference in days between two YYYY-MM-DD strings. */
function daysDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86_400_000)
}

// ── Section A — Cash Flow Summary ─────────────────────────────────────────── //

function buildCashFlow(
  income: TransactionListRow[],
  expenses: TransactionListRow[],
  transfers: TransactionListRow[],
): CashFlowSummary {
  const totalIncomeCents  = income.reduce((s, tx) => s + tx.amount_cents, 0)
  const totalExpenseCents = expenses.reduce((s, tx) => s + tx.amount_cents, 0)
  return {
    totalIncomeCents,
    totalExpenseCents,
    netCents: totalIncomeCents + totalExpenseCents,
    transferCount: transfers.length,
    transfers,
  }
}

// ── Section B — Expense Breakdown ─────────────────────────────────────────── //

function buildExpenseBreakdown(expenses: TransactionListRow[]): ExpenseBreakdownItem[] {
  type GroupEntry = { totalCents: number; count: number; subs: Map<string, { totalCents: number; count: number }> }
  const groups = new Map<string, GroupEntry>()

  for (const tx of expenses) {
    // Group under the parent name only when we have both parent_id AND parent name.
    // If the parent was deleted (parent_id set but name is null), treat as top-level.
    const hasParentName = tx.category_parent_id !== null && tx.parent_category_name !== null
    const parentName    = hasParentName ? tx.parent_category_name! : (tx.category_name ?? 'Uncategorized')
    const subName       = hasParentName ? (tx.category_name ?? null) : null
    const absAmt      = Math.abs(tx.amount_cents)

    const entry = groups.get(parentName) ?? { totalCents: 0, count: 0, subs: new Map() }
    entry.totalCents += absAmt
    entry.count++

    if (subName) {
      const sub = entry.subs.get(subName) ?? { totalCents: 0, count: 0 }
      sub.totalCents += absAmt
      sub.count++
      entry.subs.set(subName, sub)
    }

    groups.set(parentName, entry)
  }

  const totalAbs = [...groups.values()].reduce((s, g) => s + g.totalCents, 0)

  return [...groups.entries()]
    .map(([category, g]) => ({
      category,
      totalCents: g.totalCents,
      count: g.count,
      pct: totalAbs > 0 ? (g.totalCents / totalAbs) * 100 : 0,
      subcategories: [...g.subs.entries()]
        .map(([name, s]) => ({ name, totalCents: s.totalCents, count: s.count }))
        .sort((a, b) => b.totalCents - a.totalCents),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

// ── Section C — Fixed vs Variable ─────────────────────────────────────────── //

function buildFixedExpenses(
  expenses: TransactionListRow[],
  monthsInRange: number,
): { fixedExpenses: FixedExpenseItem[]; variableTotalCents: number } {
  // Group by normalized description
  const groups = new Map<string, TransactionListRow[]>()
  for (const tx of expenses) {
    const key = normalize(tx.description)
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(tx)
    groups.set(key, arr)
  }

  const fixedExpenses: FixedExpenseItem[] = []
  let fixedSumCents = 0

  for (const [name, txs] of groups) {
    const months = [...new Set(txs.map(tx => toYearMonth(tx.date)))]
    if (months.length < 3) continue

    const amounts = txs.map(tx => Math.abs(tx.amount_cents))
    const minAmt = Math.min(...amounts)
    const maxAmt = Math.max(...amounts)
    const meanAmt = mean(amounts)

    if (meanAmt === 0) continue
    const variance = (maxAmt - minAmt) / meanAmt
    if (variance >= 0.30) continue

    const monthlyAvgCents = Math.round(meanAmt)
    fixedExpenses.push({ name, monthlyAvgCents, months })
    fixedSumCents += monthlyAvgCents * monthsInRange
  }

  const totalExpenseAbs = expenses.reduce((s, tx) => s + Math.abs(tx.amount_cents), 0)
  const variableTotalCents = Math.max(0, totalExpenseAbs - fixedSumCents)

  fixedExpenses.sort((a, b) => b.monthlyAvgCents - a.monthlyAvgCents)

  return { fixedExpenses, variableTotalCents }
}

// ── Section C (part 2) — Variable Expenses ────────────────────────────────── //

function buildVariableExpenses(
  expenses: TransactionListRow[],
  fixedNames: Set<string>,
): VariableExpenseItem[] {
  const groups = new Map<string, { totalCents: number; count: number }>()
  for (const tx of expenses) {
    const key = normalize(tx.description)
    if (!key || fixedNames.has(key)) continue
    const entry = groups.get(key) ?? { totalCents: 0, count: 0 }
    entry.totalCents += Math.abs(tx.amount_cents)
    entry.count++
    groups.set(key, entry)
  }
  return [...groups.entries()]
    .map(([name, g]) => ({ name, totalCents: g.totalCents, count: g.count }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

// ── Section D — Recurring Payments ───────────────────────────────────────── //

function buildRecurringPayments(expenses: TransactionListRow[]): RecurringItem[] {
  const groups = new Map<string, TransactionListRow[]>()
  for (const tx of expenses) {
    const key = normalize(tx.description)
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(tx)
    groups.set(key, arr)
  }

  const recurring: RecurringItem[] = []

  for (const [name, txs] of groups) {
    if (txs.length < 2) continue

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysDiff(sorted[i - 1].date, sorted[i].date))
    }

    const medianInterval = median(intervals)
    const intervalVariance = intervals.reduce((max, iv) => Math.max(max, Math.abs(iv - medianInterval)), 0)

    if (intervalVariance > 10) continue

    let frequency: 'weekly' | 'biweekly' | 'monthly' | null = null
    if (medianInterval >= 5 && medianInterval <= 9) frequency = 'weekly'
    else if (medianInterval >= 12 && medianInterval <= 16) frequency = 'biweekly'
    else if (medianInterval >= 25 && medianInterval <= 35) frequency = 'monthly'

    if (!frequency) continue

    const lastDate = sorted[sorted.length - 1].date
    const nextExpectedDate = addDays(lastDate, Math.round(medianInterval))
    const avgAmountCents = Math.round(mean(txs.map(tx => Math.abs(tx.amount_cents))))

    recurring.push({ name, frequency, avgAmountCents, nextExpectedDate })
  }

  return recurring
}

// ── Section E — Merchant Analysis ─────────────────────────────────────────── //

function buildMerchantAnalysis(nonTransfers: TransactionListRow[]): MerchantItem[] {
  const groups = new Map<string, { totalCents: number; count: number }>()
  for (const tx of nonTransfers) {
    const key = normalize(tx.description)
    if (!key) continue
    const entry = groups.get(key) ?? { totalCents: 0, count: 0 }
    entry.totalCents += Math.abs(tx.amount_cents)
    entry.count++
    groups.set(key, entry)
  }

  return [...groups.entries()]
    .map(([name, g]) => ({
      name,
      totalCents: g.totalCents,
      txCount: g.count,
      avgCents: Math.round(g.totalCents / g.count),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10)
}

// ── Section F — Anomaly Detection ─────────────────────────────────────────── //

function buildAnomalies(
  expenses: TransactionListRow[],
  knownRegularNames: Set<string>,
): AnomalyItem[] {
  const anomalyMap = new Map<string, AnomalyItem>()

  // Rule 1: Large amount — |amount| > 5× median absolute expense.
  // Skip transactions already identified as fixed or recurring — rent, subscriptions,
  // etc. are large by design and should never appear here.
  // Requires at least 5 expenses so the median is meaningful.
  if (expenses.length >= 5) {
    const irregular = expenses.filter(tx => !knownRegularNames.has(normalize(tx.description)))
    const absAmounts = irregular.map(tx => Math.abs(tx.amount_cents))
    const medianAbs = median(absAmounts)
    const threshold = medianAbs * 5

    for (const tx of irregular) {
      if (Math.abs(tx.amount_cents) > threshold) {
        anomalyMap.set(tx.id, {
          txId: tx.id,
          description: tx.description,
          amountCents: tx.amount_cents,
          date: tx.date,
          reason: 'Unusually large amount',
        })
      }
    }
  }

  // Rule 2: Category outlier — |amount| > mean + 2×stddev within category.
  // Also skip known-regular transactions within their category.
  const catGroups = new Map<string, TransactionListRow[]>()
  for (const tx of expenses) {
    if (knownRegularNames.has(normalize(tx.description))) continue
    const cat = tx.category_name ?? 'Uncategorized'
    const arr = catGroups.get(cat) ?? []
    arr.push(tx)
    catGroups.set(cat, arr)
  }

  for (const [cat, txs] of catGroups) {
    if (txs.length < 3) continue
    const amounts = txs.map(tx => Math.abs(tx.amount_cents))
    const m = mean(amounts)
    const sd = stddev(amounts)
    const catThreshold = m + 3 * sd
    for (const tx of txs) {
      if (Math.abs(tx.amount_cents) > catThreshold && !anomalyMap.has(tx.id)) {
        anomalyMap.set(tx.id, {
          txId: tx.id,
          description: tx.description,
          amountCents: tx.amount_cents,
          date: tx.date,
          reason: `Outlier for category ${cat}`,
        })
      }
    }
  }

  // Rule 3: Possible duplicate — same normalized description, same amount, dates within 3 days.
  // Skip pairs where normalization produced an empty or very short string — those are
  // noise collisions from transactions that stripped down to nothing (e.g. "SEPA 12345").
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i]
      const b = expenses[j]
      if (a.amount_cents !== b.amount_cents) continue
      const normalizedA = normalize(a.description)
      if (normalizedA.length < 4) continue
      if (normalizedA !== normalize(b.description)) continue
      if (Math.abs(daysDiff(a.date, b.date)) > 3) continue
      if (!anomalyMap.has(a.id)) {
        anomalyMap.set(a.id, {
          txId: a.id,
          description: a.description,
          amountCents: a.amount_cents,
          date: a.date,
          reason: 'Possible duplicate',
        })
      }
      if (!anomalyMap.has(b.id)) {
        anomalyMap.set(b.id, {
          txId: b.id,
          description: b.description,
          amountCents: b.amount_cents,
          date: b.date,
          reason: 'Possible duplicate',
        })
      }
    }
  }

  return [...anomalyMap.values()].sort((a, b) => b.date.localeCompare(a.date))
}

// ── Public entry point ────────────────────────────────────────────────────── //

export function buildReport(
  transactions: TransactionListRow[],
  startDate: string,
  endDate: string,
): AnalystReport {
  // Period label e.g. "Nov 2025 – Jan 2026"
  const startLabel = new Date(startDate + 'T00:00:00Z')
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  // endDate is exclusive (first of next month), so subtract 1 day for the label
  const endLabelDate = addDays(endDate, -1)
  const endLabel = new Date(endLabelDate + 'T00:00:00Z')
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const periodLabel = `${startLabel} – ${endLabel}`

  // Compute months in range (approximate, used for fixed expense projection)
  const startD = new Date(startDate + 'T00:00:00Z')
  const endD   = new Date(endDate   + 'T00:00:00Z')
  const monthsInRange = Math.max(
    1,
    (endD.getUTCFullYear() - startD.getUTCFullYear()) * 12 +
    (endD.getUTCMonth() - startD.getUTCMonth()),
  )

  // Split into transfers / income / expenses
  const transfers: TransactionListRow[] = []
  const income:    TransactionListRow[] = []
  const expenses:  TransactionListRow[] = []

  for (const tx of transactions) {
    if (isTransfer(tx)) {
      transfers.push(tx)
    } else if (tx.amount_cents > 0) {
      income.push(tx)
    } else {
      expenses.push(tx)
    }
  }

  const nonTransfers = [...income, ...expenses]

  const cashFlow        = buildCashFlow(income, expenses, transfers)
  const expenseBreakdown = buildExpenseBreakdown(expenses)
  const { fixedExpenses, variableTotalCents } = buildFixedExpenses(expenses, monthsInRange)
  const fixedNames = new Set(fixedExpenses.map(f => f.name))
  const variableExpenses = buildVariableExpenses(expenses, fixedNames)
  const recurringPayments = buildRecurringPayments(expenses)
  const merchantAnalysis  = buildMerchantAnalysis(nonTransfers)

  // Build exclusion set for anomaly detection: anything already classified as
  // fixed or recurring is expected behaviour, not an anomaly.
  // Also exclude any merchant that appears in 2+ distinct calendar months —
  // if you pay the same person/company every month it is by definition regular.
  const descMonths = new Map<string, Set<string>>()
  for (const tx of expenses) {
    const key = normalize(tx.description)
    if (!key) continue
    const months = descMonths.get(key) ?? new Set<string>()
    months.add(toYearMonth(tx.date))
    descMonths.set(key, months)
  }
  const multiMonthNames = new Set<string>(
    [...descMonths.entries()]
      .filter(([, months]) => months.size >= 2)
      .map(([name]) => name),
  )

  const knownRegularNames = new Set<string>([
    ...fixedExpenses.map(f => f.name),
    ...recurringPayments.map(r => r.name),
    ...multiMonthNames,
  ])
  const anomalies = buildAnomalies(expenses, knownRegularNames)

  return {
    periodLabel,
    cashFlow,
    expenseBreakdown,
    fixedExpenses,
    variableExpenses,
    variableTotalCents,
    recurringPayments,
    merchantAnalysis,
    anomalies,
  }
}
