import { NextResponse, type NextRequest } from 'next/server'
import { createClient }       from '@/lib/supabase/server'
import { gcFetch }            from '../_lib/token'
import type { InsertTransactionInput } from '@/db/types'

interface GCTransactionAmount {
  amount:   string   // e.g. "-42.50"
  currency: string
}

interface GCTransaction {
  transactionId?:                         string
  bookingDate:                            string   // YYYY-MM-DD
  transactionAmount:                      GCTransactionAmount
  remittanceInformationUnstructured?:     string
  remittanceInformationStructured?:       string
  creditorName?:                          string
  debtorName?:                            string
}

/** Normalise a GoCardless transaction to our InsertTransactionInput shape. */
function normalise(t: GCTransaction, accountId: string): InsertTransactionInput {
  const amountCents = Math.round(parseFloat(t.transactionAmount.amount) * 100)

  const description = (
    t.remittanceInformationUnstructured ||
    t.remittanceInformationStructured   ||
    t.creditorName                      ||
    t.debtorName                        ||
    'Bank transaction'
  ).slice(0, 250)

  // Deterministic hash for dedup: use transactionId when present, else composite
  const importHash = t.transactionId
    ?? `gc-${t.bookingDate}-${t.transactionAmount.amount}-${description.slice(0, 40)}`

  return {
    account_id:   accountId,
    category_id:  null,
    amount_cents: amountCents,
    date:         t.bookingDate,
    description,
    notes:        null,
    import_hash:  importHash,
  }
}

/**
 * GET /api/gocardless/transactions?gc_account_id=xxx&date_from=YYYY-MM-DD&account_id=xxx
 *
 * gc_account_id — the GoCardless account ID (from /accounts endpoint)
 * date_from     — ISO date to fetch from (default: 90 days ago)
 * account_id    — the household account to import into (for normalisation)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const gcAccountId = searchParams.get('gc_account_id')
  const accountId   = searchParams.get('account_id')

  if (!gcAccountId) return NextResponse.json({ error: 'gc_account_id required' }, { status: 400 })
  if (!accountId)   return NextResponse.json({ error: 'account_id required' }, { status: 400 })

  // Default to 90 days ago (GoCardless free-tier maximum)
  const dateFrom = searchParams.get('date_from') ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().slice(0, 10)
  })()

  try {
    const res = await gcFetch(
      `/accounts/${gcAccountId}/transactions/?date_from=${dateFrom}`
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `GoCardless: ${text}` }, { status: res.status })
    }

    const data = await res.json() as {
      transactions: { booked: GCTransaction[]; pending?: GCTransaction[] }
    }

    const transactions = (data.transactions.booked ?? []).map((t) =>
      normalise(t, accountId)
    )

    return NextResponse.json({ transactions })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
