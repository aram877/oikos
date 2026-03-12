/**
 * GoCardless Bank Account Data — server-side token helper.
 *
 * Required env vars (server-side only, never NEXT_PUBLIC_):
 *   GOCARDLESS_SECRET_ID
 *   GOCARDLESS_SECRET_KEY
 *
 * Get your credentials at: https://bankaccountdata.gocardless.com/overview/
 */

export const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export function gcCredentials() {
  const secretId  = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error('GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY are not set in environment variables.')
  }
  return { secretId, secretKey }
}

/**
 * Fetches a fresh GoCardless access token.
 * Tokens are valid for 24 h — for MVP we fetch one per request (simple, correct).
 */
export async function getGCToken(): Promise<string> {
  const { secretId, secretKey } = gcCredentials()

  const res = await fetch(`${GC_BASE}/token/new/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GoCardless auth failed (${res.status}): ${text}`)
  }

  const json = await res.json() as { access: string }
  return json.access
}

/** Authenticated fetch wrapper for GoCardless API calls. */
export async function gcFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGCToken()
  return fetch(`${GC_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}
