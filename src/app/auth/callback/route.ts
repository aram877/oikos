import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code        = searchParams.get('code')
  const inviteToken = searchParams.get('invite_token')
  const rawNext     = searchParams.get('next') ?? '/transactions'

  // Reject anything that isn't a strict same-origin path. Protocol-relative
  // (`//evil.com`) and absolute URLs would otherwise be browser-normalised
  // into a cross-origin redirect.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/transactions'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv    = process.env.NODE_ENV === 'development'
      const baseUrl       = !isLocalEnv && forwardedHost
        ? `https://${forwardedHost}`
        : origin

      // Invite tokens go through the explicit confirmation page so the
      // user knows they will be evicted from their current household.
      // The DB function also enforces an email-match check.
      const target = inviteToken
        ? `/invite/accept?token=${encodeURIComponent(inviteToken)}`
        : next

      return NextResponse.redirect(`${baseUrl}${target}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
}
