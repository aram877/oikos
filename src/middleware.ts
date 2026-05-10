import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/callback', '/api/push/send']

// Nonce-based CSP would be stricter, but Next.js + React 19 currently leak the
// nonce attribute into hydrated HTML in a way that breaks dev hydration checks.
// We use 'unsafe-inline' for scripts and rely on the rest of the directives
// (frame-ancestors, base-uri, form-action, object-src, img/connect allowlists,
// upgrade-insecure-requests) for defense in depth.
function buildCsp(): string {
  const isDev = process.env.NODE_ENV === 'development'
  const scriptSrc = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*`,
    `frame-src 'self' https://*.supabase.co`,
    `media-src 'self' https://*.supabase.co`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const csp = buildCsp()

  let supabaseResponse = NextResponse.next({ request })
  supabaseResponse.headers.set('content-security-policy', csp)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          supabaseResponse.headers.set('content-security-policy', csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: always use getUser() — validates JWT server-side.
  // Never use getSession() here; it does not verify the JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPath   = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!user && !isAuthPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirect = NextResponse.redirect(url)
    redirect.headers.set('content-security-policy', csp)
    return redirect
  }

  if (user && isAuthPath && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone()
    url.pathname = '/transactions'
    const redirect = NextResponse.redirect(url)
    redirect.headers.set('content-security-policy', csp)
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
