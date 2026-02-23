-- =============================================================================
-- Add default categories to new accounts (and backfill existing ones)
-- =============================================================================


-- ── 1. Update trigger to seed categories on every new account ────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_account_id uuid;
BEGIN
  -- Invited users join an existing account via accept_invitation() — skip.
  IF (NEW.raw_user_meta_data ? 'invite_token') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.accounts (name, currency)
  VALUES (
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(NEW.email, '@', 1),
      'My Account'
    ),
    'EUR'
  )
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  -- Seed default top-level categories
  INSERT INTO public.categories (account_id, name, parent_id)
  VALUES
    (new_account_id, 'Housing',            NULL),
    (new_account_id, 'Utilities',          NULL),
    (new_account_id, 'Food and Groceries', NULL),
    (new_account_id, 'Transportation',     NULL),
    (new_account_id, 'Healthcare',         NULL),
    (new_account_id, 'Entertainment',      NULL),
    (new_account_id, 'Travel',             NULL),
    (new_account_id, 'Children Expenses',  NULL),
    (new_account_id, 'Income',             NULL),
    (new_account_id, 'Transfers',          NULL);

  RETURN NEW;
END;
$$;


-- ── 2. Backfill existing accounts that have no categories yet ─────────────────

DO $$
DECLARE
  acc record;
BEGIN
  FOR acc IN
    SELECT id FROM public.accounts
    WHERE deleted_at IS NULL
      AND id NOT IN (SELECT DISTINCT account_id FROM public.categories)
  LOOP
    INSERT INTO public.categories (account_id, name, parent_id)
    VALUES
      (acc.id, 'Housing',            NULL),
      (acc.id, 'Utilities',          NULL),
      (acc.id, 'Food and Groceries', NULL),
      (acc.id, 'Transportation',     NULL),
      (acc.id, 'Healthcare',         NULL),
      (acc.id, 'Entertainment',      NULL),
      (acc.id, 'Travel',             NULL),
      (acc.id, 'Children Expenses',  NULL),
      (acc.id, 'Income',             NULL),
      (acc.id, 'Transfers',          NULL);

    RAISE NOTICE 'Seeded default categories for account %', acc.id;
  END LOOP;
END;
$$;
