-- -----------------------------------------------------------------------------
-- Security hardening: require the caller's email to match the invited email.
--
-- Previously `accept_invitation(p_token)` accepted any authenticated caller
-- who possessed the token. A leaked / forwarded link let any user join the
-- inviting household — and, because the function deletes the caller's prior
-- memberships first, also evicted them from their real household.
--
-- This migration:
--   1. Adds a case-insensitive email match in `accept_invitation` (preserving
--      the access-column copy from the previous `update_roles.sql` version).
--   2. Tightens `get_invitation_by_token` so it only previews invitations
--      addressed to the calling user's email.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv          record;
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO inv
  FROM public.invitations
  WHERE token       = p_token
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already accepted';
  END IF;

  IF lower(inv.email) <> lower(caller_email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  DELETE FROM public.account_members
  WHERE user_id = auth.uid();

  INSERT INTO public.account_members (
    account_id, user_id, role,
    finance_access, shopping_access, calendar_access
  )
  VALUES (
    inv.account_id, auth.uid(), inv.role,
    inv.finance_access, inv.shopping_access, inv.calendar_access
  );

  DELETE FROM public.notifications
  WHERE user_id = auth.uid()
    AND type    = 'invitation'
    AND (data->>'invite_token')::uuid = p_token;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token uuid)
RETURNS TABLE (account_name text, invited_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_email text;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  IF caller_email IS NULL THEN
    RETURN;
  END IF;

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
    AND i.accepted_at IS NULL
    AND lower(i.email) = lower(caller_email);
END;
$$;
