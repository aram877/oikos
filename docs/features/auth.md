# Authentication

Supabase Auth (email + password) with cookie-based sessions, an SSR-safe
client, a server-side callback for email confirm + OAuth-style code
exchange, and a Next.js middleware that redirects unauthenticated users to
`/auth/login`.

## Routes / API

| Path                    | File                                 | Purpose |
|-------------------------|--------------------------------------|---------|
| `/auth/login`           | `src/app/auth/login/page.tsx`        | Email + password form; optional "hide amounts" privacy toggle. |
| `/auth/register`        | `src/app/auth/register/page.tsx`     | Email + password (≥ 8). Sends confirmation email. |
| `/auth/callback`        | `src/app/auth/callback/route.ts`     | Server-side code exchange; optional invite acceptance. |

## Middleware

`src/middleware.ts` intercepts every non-static request:

1. Builds an SSR-safe Supabase client with cookie handlers.
2. Calls **`supabase.auth.getUser()`** (verifies the JWT server-side — *not*
   `getSession()`).
3. If unauthenticated → redirects to `/auth/login` (unless on a public path:
   `/auth/login`, `/auth/register`, `/auth/callback`, `/api/push/send`).
4. If authenticated and on `/auth/login` or `/auth/register` → redirects to
   `/transactions`.

## Library — `src/lib/supabase/`

- `client.ts` — `createClient()`: browser client using `@supabase/ssr`,
  reads / writes session cookies via the SSR adapter.
- `server.ts` — server client; same SSR adapter, with cookie handlers wired
  to `next/headers`.

## React layer

- `src/app/auth/login/page.tsx` — form, calls
  `supabase.auth.signInWithPassword({ email, password })`. On success,
  navigates to `/transactions`.
- `src/app/auth/register/page.tsx` — form, calls
  `supabase.auth.signUp({ email, password, options: { emailRedirectTo: '/auth/callback' } })`,
  shows a "check your email" message.
- `src/app/auth/callback/route.ts` — server route handler:
  1. Reads `code` and optional `invite_token` from the URL.
  2. `supabase.auth.exchangeCodeForSession(code)` writes session cookies.
  3. If `invite_token` is present, calls the `accept_invitation(token)` RPC
     immediately (so newly-signed-up invitees join the inviter's household).
  4. Redirects to `/transactions` (or `?next=…` if provided).

## How it works

1. **Sign up.** User submits email + password on `/auth/register`. Supabase
   creates an `auth.users` row in a *pending* state and emails a
   confirmation link to `/auth/callback?code=…`. The
   `handle_new_user` trigger fires and bootstraps a profile + (unless
   `invite_token` is in metadata) an account + admin membership + default
   categories.
2. **Confirm.** Clicking the email link hits `/auth/callback` which
   exchanges the code for a session, sets cookies, and redirects.
3. **Sign in.** User submits credentials on `/auth/login`. The browser SDK
   does the auth flow, stores session cookies, navigates to `/transactions`.
4. **Subsequent requests.** Middleware verifies the JWT on every request via
   `getUser()` and either lets it through or redirects.
5. **Sign out.** `dbClient.resetAndTerminate()` calls `supabase.auth.signOut()`
   and clears the in-memory account-id cache.

## Invitation interplay

If the user is signed up via an invite, the email link points to
`/auth/callback?code=…&invite_token=…`. The callback exchanges the code,
then calls `accept_invitation(token)` so they land in the inviter's
household. The `handle_new_user` trigger sees the `invite_token` in
`raw_user_meta_data` and **skips** account / membership bootstrap (the user
joins via accept, not creates).

## Notable details

- **`getUser()` not `getSession()`.** `getSession()` only reads the cookie;
  `getUser()` actually verifies the JWT, preventing session fixation.
- **HttpOnly session cookies.** Set / read by the SSR adapter — never
  exposed to JS.
- **Public callback path.** Unauthenticated visitors hit `/auth/callback`
  during sign-up confirmation; middleware allows it.
- **No 3rd-party OAuth providers** in MVP — email + password only.
- **Privacy toggle on login** (the eye checkbox) flips the global
  `oikos:privacy` flag *before* sign-in, so first paint of `/transactions`
  is already masked.
