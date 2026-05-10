import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gcFetch }      from '../_lib/token'
import { isRequisitionOwner, setGcAccountIds } from '../_lib/ownership'

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

  // Verify the caller created this requisition. Without this check anyone
  // authenticated can pull another user's bank accounts using the shared
  // GoCardless secret.
  if (!(await isRequisitionOwner(reqId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const reqRes = await gcFetch(`/requisitions/${reqId}/`)
    if (!reqRes.ok) {
      const text = await reqRes.text()
      console.error('[gocardless/accounts] gc requisition error', reqRes.status, text.slice(0, 500))
      return NextResponse.json({ error: 'GoCardless error' }, { status: reqRes.status })
    }

    const reqData = await reqRes.json() as { accounts: string[]; status: string }

    if (!reqData.accounts || reqData.accounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        status:   reqData.status,  // CR = created, LN = linked, EX = expired
      })
    }

    // Cache the discovered gc_account_ids so /transactions can verify
    // ownership of an individual account later.
    await setGcAccountIds(reqId, reqData.accounts)

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
    console.error('[gocardless/accounts] error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
