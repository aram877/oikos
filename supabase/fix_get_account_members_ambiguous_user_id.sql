-- =============================================================================
-- Fix ambiguous "user_id" column reference in get_account_members()
-- =============================================================================
-- The RETURNS TABLE declaration introduces `user_id` as an output variable into
-- the function body scope.  The unqualified `user_id` in the EXISTS guard was
-- therefore ambiguous between that output variable and
-- account_members.user_id, causing Postgres error:
--   "column reference 'user_id' is ambiguous"
-- Fix: alias the table in the EXISTS subquery and qualify every column.

CREATE OR REPLACE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id   uuid,
  email     text,
  role      text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be a member of the account
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members _am
    WHERE _am.account_id = p_account_id AND _am.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    am.user_id,
    u.email::text,
    am.role,
    am.joined_at
  FROM public.account_members am
  JOIN auth.users u ON u.id = am.user_id
  WHERE am.account_id = p_account_id
  ORDER BY am.joined_at ASC;
END;
$$;
