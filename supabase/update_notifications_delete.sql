-- =============================================================================
-- Migration: notifications — delete on accept + allow user to delete own rows
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- 1. Allow users to delete their own notifications (dismiss button).
CREATE POLICY "user deletes own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());


-- 2. Update accept_invitation() to DELETE the invitation notification instead
--    of marking it read, so it disappears from the dropdown immediately.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv record;
BEGIN
  SELECT * INTO inv
  FROM public.invitations
  WHERE token       = p_token
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already accepted';
  END IF;

  -- Remove user from all current account memberships (1 user = 1 household).
  DELETE FROM public.account_members
  WHERE user_id = auth.uid();

  -- Add to the invited account.
  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (inv.account_id, auth.uid(), inv.role);

  -- Remove the invitation notification entirely (not just mark read).
  DELETE FROM public.notifications
  WHERE user_id = auth.uid()
    AND type    = 'invitation'
    AND (data->>'invite_token')::uuid = p_token;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;
