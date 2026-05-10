import { NextResponse, type NextRequest } from 'next/server'
import { createClient }     from '@/lib/supabase/server'
import { gcFetch }          from '../_lib/token'
import { recordRequisition } from '../_lib/ownership'

/**
 * POST /api/gocardless/connect
 * Body: { institution_id: string }
 * Returns: { requisition_id, link }
 *
 * The client should store requisition_id in sessionStorage before
 * following `link`, so it's available when GoCardless redirects back.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let institutionId: string
  try {
    const body = await request.json() as { institution_id?: string }
    if (!body.institution_id) throw new Error('institution_id required')
    institutionId = body.institution_id
  } catch {
    return NextResponse.json({ error: 'institution_id required' }, { status: 400 })
  }

  const origin    = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  const redirectTo = `${origin}/import?tab=bank`
  const reference  = `${user.id.slice(0, 8)}-${Date.now()}`

  try {
    const res = await gcFetch('/requisitions/', {
      method: 'POST',
      body:   JSON.stringify({
        redirect:       redirectTo,
        institution_id: institutionId,
        reference,
        user_language:  'EN',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[gocardless/connect] gc error', res.status, text.slice(0, 500))
      return NextResponse.json({ error: 'GoCardless error' }, { status: res.status })
    }

    const data = await res.json() as { id: string; link: string }

    // Bind the requisition to this user so /accounts and /transactions can
    // verify ownership later — the GoCardless secret is shared, so without
    // this anyone authenticated could read anyone else's requisition.
    await recordRequisition(data.id, user.id)

    return NextResponse.json({ requisition_id: data.id, link: data.link })
  } catch (err) {
    console.error('[gocardless/connect] error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
