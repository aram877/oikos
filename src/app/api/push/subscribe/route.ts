import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient }  from '@supabase/supabase-js'

// Allowlist the well-known browser push services. Stops a malicious or
// misconfigured endpoint from being persisted under another user's identity.
const ENDPOINT_HOST_ALLOWLIST = [
  /^fcm\.googleapis\.com$/,
  /\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
]

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    return ENDPOINT_HOST_ALLOWLIST.some(rx => rx.test(u.hostname))
  } catch {
    return false
  }
}

const SubscribeBody = z.object({
  endpoint: z.string().url().refine(isAllowedEndpoint, 'Endpoint host not allowed'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
})

const UnsubscribeBody = z.object({
  endpoint: z.string().url(),
})

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = SubscribeBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { endpoint, keys } = parsed.data

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    )

  if (error) {
    console.error('[push/subscribe.POST] db error', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = UnsubscribeBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', parsed.data.endpoint)

  if (error) {
    console.error('[push/subscribe.DELETE] db error', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
