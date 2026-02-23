import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code        = searchParams.get('code')
  const inviteToken = searchParams.get('invite_token')
  const next        = searchParams.get('next') ?? '/transactions'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If this is an invitation acceptance, call the Postgres function.
      if (inviteToken) {
        await supabase.rpc('accept_invitation', { p_token: inviteToken })
        // Errors are soft-ignored — the user still lands in the app.
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv    = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // Auth exchange failed — redirect to login with error hint.
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
}
