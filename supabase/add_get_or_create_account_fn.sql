-- =============================================================================
-- Migration: add get_or_create_account() function
--
-- Run in: Supabase dashboard → SQL Editor
--
-- Replaces the direct account_members query in getActiveAccountId() with a
-- SECURITY DEFINER RPC that gracefully bootstraps a new personal account
-- when the user has no membership (e.g. after being removed from a household).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_user_email text;
BEGIN
  -- Return the user's earliest-joined account if one exists.
  SELECT account_id INTO v_account_id
  FROM public.account_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  -- No membership — create a fresh personal account (mirrors handle_new_user trigger).
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.accounts (name, currency)
  VALUES (split_part(v_user_email, '@', 1), 'EUR')
  RETURNING id INTO v_account_id;

  INSERT INTO public.account_members (account_id, user_id, role,
    finance_access, shopping_access, calendar_access)
  VALUES (v_account_id, auth.uid(), 'owner', 'write', 'write', 'write');

  INSERT INTO public.categories (account_id, name, parent_id)
  VALUES
    (v_account_id, 'Housing',            NULL),
    (v_account_id, 'Utilities',          NULL),
    (v_account_id, 'Food and Groceries', NULL),
    (v_account_id, 'Transportation',     NULL),
    (v_account_id, 'Healthcare',         NULL),
    (v_account_id, 'Entertainment',      NULL),
    (v_account_id, 'Travel',             NULL),
    (v_account_id, 'Children Expenses',  NULL),
    (v_account_id, 'Income',             NULL),
    (v_account_id, 'Transfers',          NULL);

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_account() TO authenticated;
