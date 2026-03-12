import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gcFetch }      from '../_lib/token'

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
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const origin    = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  // Generic redirect — client reads requisition_id from sessionStorage on return
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
      return NextResponse.json({ error: `GoCardless: ${text}` }, { status: res.status })
    }

    const data = await res.json() as { id: string; link: string }
    return NextResponse.json({ requisition_id: data.id, link: data.link })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
