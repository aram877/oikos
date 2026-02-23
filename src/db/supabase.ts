/**
 * Module-level Supabase singleton for use in repository functions.
 *
 * This is a browser client — safe to import from client components and
 * client-only repository code.  Server-side code should use
 * src/lib/supabase/server.ts instead.
 */

import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient()
  }
  return _client
}
