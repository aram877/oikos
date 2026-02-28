-- =============================================================================
-- Migration: update invitation acceptance to support already-registered users
--
-- Changes:
--   1. accept_invitation() — removes the user from ALL current account
--      memberships before joining the invited account (1 user = 1 household).
--   2. get_invitation_by_token() — new helper that lets an authenticated user
--      read the household name + inviter display name for a pending invitation
--      by token, bypassing RLS (which only lets owners read invitations).
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. accept_invitation (updated)
-- -----------------------------------------------------------------------------
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

  -- Remove user from all current account memberships so that 1 user = 1 household.
  DELETE FROM public.account_members
  WHERE user_id = auth.uid();

  -- Add to the invited account.
  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (inv.account_id, auth.uid(), inv.role);

  -- Mark the in-app notification as read (if one was created for this invite).
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND type    = 'invitation'
    AND (data->>'invite_token')::uuid = p_token
    AND read_at IS NULL;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. get_invitation_by_token (new)
-- Returns household name + inviter name for a pending invitation.
-- Any authenticated user can call this if they possess the token.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token uuid)
RETURNS TABLE (account_name text, invited_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.name::text,
    COALESCE(
      NULLIF(trim(p.display_name), ''),
      split_part(u.email, '@', 1)
    )::text
  FROM public.invitations  i
  JOIN public.accounts     a ON a.id  = i.account_id
  JOIN auth.users          u ON u.id  = i.invited_by
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token       = p_token
    AND i.accepted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO authenticated;
