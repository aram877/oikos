/**
 * Provides `getActiveAccountId()` — a lazy-cached lookup of the current
 * user's primary account.
 *
 * Every repository function that needs an account_id calls this instead of
 * threading the ID through every call site.
 *
 * The cache is per page session; it is cleared on sign-out by calling
 * `clearAccountCache()`.
 */

import { getSupabase } from './supabase'

let _accountId: string | null = null

/**
 * Returns the account_id for the currently authenticated user.
 *
 * On first call it queries `account_members` joined to `accounts`; the result
 * is cached for the lifetime of the page session.
 *
 * @throws if the user is not authenticated or has no account membership.
 */
export async function getActiveAccountId(): Promise<string> {
  if (_accountId) return _accountId

  const supabase = getSupabase()

  // get_or_create_account() returns the user's current account_id, or
  // bootstraps a fresh personal account if they have no membership
  // (e.g. after being removed from a household).
  const { data, error } = await supabase.rpc('get_or_create_account')

  if (error || !data) {
    throw new Error(
      `[accountContext] Failed to resolve active account: ${error?.message ?? 'no account found'}`,
    )
  }

  _accountId = data as string
  return _accountId
}

/**
 * Clears the cached account ID.  Call this on sign-out so the next user
 * gets a fresh lookup.
 */
export function clearAccountCache(): void {
  _accountId = null
}
