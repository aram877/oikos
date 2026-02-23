-- =============================================================================
-- Backfill: create accounts for users who signed up before the trigger existed
-- =============================================================================
-- Safe to run multiple times — skips users who already have an account.
-- =============================================================================

DO $$
DECLARE
  u              record;
  new_account_id uuid;
BEGIN
  FOR u IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE id NOT IN (SELECT user_id FROM public.account_members)
      -- skip invited users (they join an existing account via accept_invitation)
      AND NOT (raw_user_meta_data ? 'invite_token')
  LOOP
    INSERT INTO public.accounts (name, currency)
    VALUES (
      COALESCE(
        NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
        split_part(u.email, '@', 1),
        'My Account'
      ),
      'EUR'
    )
    RETURNING id INTO new_account_id;

    INSERT INTO public.account_members (account_id, user_id, role)
    VALUES (new_account_id, u.id, 'owner');

    RAISE NOTICE 'Created account % for user %', new_account_id, u.email;
  END LOOP;
END;
$$;
