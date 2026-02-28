-- =============================================================================
-- Fix: missing DELETE RLS policy on account_members
--
-- Run in: Supabase dashboard → SQL Editor
--
-- The incremental migrations (add_household_permissions.sql,
-- fix_rls_recursion.sql) never created a DELETE policy, so any call to
-- remove a member silently deleted 0 rows (RLS block ≠ error in PostgREST).
-- The schema.sql has this policy for fresh projects — this backfills it.
-- =============================================================================

-- Owners can remove any member; members can remove themselves (leave).
CREATE POLICY "account_members: delete self or as owner"
  ON public.account_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'owner'
    )
  );
