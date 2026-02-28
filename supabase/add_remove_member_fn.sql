-- =============================================================================
-- Migration: add remove_account_member() SECURITY DEFINER function
--
-- Run in: Supabase dashboard → SQL Editor
--
-- Direct DELETE on account_members with an RLS self-join silently deletes
-- 0 rows when the subquery recursion fails.  This function bypasses RLS
-- and does the authorization check explicitly — same pattern as
-- get_account_members() and accept_invitation().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be the owner of this account.
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = auth.uid()
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Access denied: only the account owner can remove members';
  END IF;

  -- Disallow removing the owner.
  IF EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = p_member_id
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the account owner';
  END IF;

  DELETE FROM public.account_members
  WHERE account_id = p_account_id
    AND user_id    = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_account_member(uuid, uuid) TO authenticated;
