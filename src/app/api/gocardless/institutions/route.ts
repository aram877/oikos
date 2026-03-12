import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gcFetch }      from '../_lib/token'

export interface GCInstitution {
  id:                     string
  name:                   string
  bic:                    string
  transaction_total_days: string
  logo:                   string
}

export async function GET(request: NextRequest) {
  // Must be authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const country = request.nextUrl.searchParams.get('country')
  if (!country || country.length !== 2) {
    return NextResponse.json({ error: 'country param required (2-letter ISO)' }, { status: 400 })
  }

  try {
    const res = await gcFetch(`/institutions/?country=${country.toUpperCase()}`)
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `GoCardless: ${text}` }, { status: res.status })
    }
    const data = await res.json() as GCInstitution[]
    return NextResponse.json({ institutions: data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
