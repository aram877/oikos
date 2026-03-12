import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gcFetch }      from '../_lib/token'

export interface GCAccount {
  id:   string
  iban: string | null
  name: string | null
}

/**
 * GET /api/gocardless/accounts?requisition_id=xxx
 * Returns the bank accounts linked to a completed requisition.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reqId = request.nextUrl.searchParams.get('requisition_id')
  if (!reqId) return NextResponse.json({ error: 'requisition_id required' }, { status: 400 })

  try {
    // 1. Get the requisition to retrieve account IDs
    const reqRes = await gcFetch(`/requisitions/${reqId}/`)
    if (!reqRes.ok) {
      const text = await reqRes.text()
      return NextResponse.json({ error: `GoCardless: ${text}` }, { status: reqRes.status })
    }

    const reqData = await reqRes.json() as { accounts: string[]; status: string }

    if (!reqData.accounts || reqData.accounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        status:   reqData.status,  // CR = created, LN = linked, EX = expired
      })
    }

    // 2. Fetch details for each account (IBAN, name)
    const accounts = await Promise.all(
      reqData.accounts.map(async (accountId): Promise<GCAccount> => {
        const detailRes = await gcFetch(`/accounts/${accountId}/details/`)
        if (!detailRes.ok) return { id: accountId, iban: null, name: null }

        const detail = await detailRes.json() as {
          account: { iban?: string; name?: string; ownerName?: string }
        }
        return {
          id:   accountId,
          iban: detail.account.iban  ?? null,
          name: detail.account.name  ?? detail.account.ownerName ?? null,
        }
      })
    )

    return NextResponse.json({ accounts, status: reqData.status })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
