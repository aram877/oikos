-- =============================================================================
-- Fix: infinite recursion in account_members RLS policy
-- =============================================================================
-- The original SELECT policy on account_members did a subquery against
-- account_members itself → Postgres detects the cycle and throws:
--   "infinite recursion detected in policy for relation account_members"
--
-- Fix: each user can only SELECT their own rows directly.
-- All "list all members of an account" reads go through the
-- get_account_members() RPC which is SECURITY DEFINER and bypasses RLS.
-- =============================================================================

-- Drop the recursive policy
DROP POLICY IF EXISTS "account_members: members can read" ON public.account_members;

-- Replace with a simple, non-recursive policy
CREATE POLICY "account_members: read own rows"
  ON public.account_members FOR SELECT
  USING (user_id = auth.uid());
