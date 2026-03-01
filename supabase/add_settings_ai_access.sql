-- =============================================================================
-- Migration: add settings_access + ai_access columns
--
-- Run in: Supabase dashboard → SQL Editor
-- Prerequisite: update_roles.sql must have been applied first.
--
-- Changes:
--   1. Add settings_access + ai_access to account_members
--   2. Add settings_access + ai_access to invitations
--   3. Backfill admin rows to 'write', all others to 'none'
--   4. Update get_account_members() RPC to return the new columns
--   5. Update accept_invitation() RPC to copy the new columns
-- =============================================================================


-- =============================================================================
-- 1. account_members — add columns
-- =============================================================================

ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS settings_access text NOT NULL DEFAULT 'none'
    CHECK (settings_access IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS ai_access       text NOT NULL DEFAULT 'none'
    CHECK (ai_access       IN ('none', 'read', 'write'));


-- =============================================================================
-- 2. invitations — add columns
-- =============================================================================

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS settings_access text NOT NULL DEFAULT 'none'
    CHECK (settings_access IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS ai_access       text NOT NULL DEFAULT 'none'
    CHECK (ai_access       IN ('none', 'read', 'write'));


-- =============================================================================
-- 3. Backfill — admins get full access, others keep 'none'
-- =============================================================================

UPDATE public.account_members
SET settings_access = 'write',
    ai_access       = 'write'
WHERE role = 'admin';


-- =============================================================================
-- 4. get_account_members — return new columns
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_account_members(uuid);

CREATE OR REPLACE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id         uuid,
  email           text,
  display_name    text,
  role            text,
  joined_at       timestamptz,
  finance_access  text,
  shopping_access text,
  calendar_access text,
  settings_access text,
  ai_access       text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    COALESCE(p.display_name, split_part(u.email::text, '@', 1))::text,
    am.role,
    am.joined_at,
    am.finance_access,
    am.shopping_access,
    am.calendar_access,
    am.settings_access,
    am.ai_access
  FROM public.account_members am
  JOIN auth.users u ON u.id = am.user_id
  LEFT JOIN public.profiles p ON p.id = am.user_id
  WHERE am.account_id = p_account_id
  ORDER BY am.joined_at ASC;
END;
$$;


-- =============================================================================
-- 5. accept_invitation — copy new columns to the new membership row
-- =============================================================================

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

  DELETE FROM public.account_members
  WHERE user_id = auth.uid();

  INSERT INTO public.account_members (
    account_id, user_id, role,
    finance_access, shopping_access, calendar_access,
    settings_access, ai_access
  )
  VALUES (
    inv.account_id, auth.uid(), inv.role,
    inv.finance_access, inv.shopping_access, inv.calendar_access,
    inv.settings_access, inv.ai_access
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
