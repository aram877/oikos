import type { RecurringFrequency, RecurringTransactionRow } from '@/db/types'
import { dbClient } from '@/db/db.client'

function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function advanceDate(dateStr: string, frequency: RecurringFrequency): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  switch (frequency) {
    case 'weekly':   date.setDate(date.getDate() + 7);  break
    case 'biweekly': date.setDate(date.getDate() + 14); break
    case 'monthly':  date.setMonth(date.getMonth() + 1); break
    case 'yearly':   date.setFullYear(date.getFullYear() + 1); break
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * For each due template, generate transactions for every occurrence between
 * its current next_run_date and today, then bump next_run_date past today.
 * Returns the number of transactions created.
 */
export async function generateDueRecurringTransactions(): Promise<number> {
  const today = todayLocalISO()
  const due = await dbClient.recurringTransactions.listDue(today)
  if (due.length === 0) return 0

  let created = 0
  for (const tpl of due) {
    let runDate = tpl.next_run_date
    const endDate = tpl.end_date

    while (runDate <= today && (!endDate || runDate <= endDate)) {
      await dbClient.transactions.insert({
        account_id:   tpl.account_id,
        category_id:  tpl.category_id,
        amount_cents: tpl.amount_cents,
        date:         runDate,
        description:  tpl.description,
        notes:        tpl.notes,
        is_transfer:  tpl.is_transfer,
      })
      created++
      runDate = advanceDate(runDate, tpl.frequency)
    }

    await dbClient.recurringTransactions.update(tpl.id, { next_run_date: runDate })
  }
  return created
}

export function summarizeNext(t: RecurringTransactionRow): string {
  const freq = t.frequency.charAt(0).toUpperCase() + t.frequency.slice(1)
  return `${freq} · next ${t.next_run_date}`
}
