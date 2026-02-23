-- =============================================================================
-- Financial Tracker — Supabase Schema
-- =============================================================================
-- Run this once in:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Order:
--   1. Tables
--   2. Indexes
--   3. Row Level Security (enable + policies)
--   4. Functions (RPCs)
--   5. Trigger — auto-create account on user signup
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.accounts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  currency    text        NOT NULL DEFAULT 'EUR',
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_members (
  account_id  uuid  NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id     uuid  NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  role        text  NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'member')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  parent_id   uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transactions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid    NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  category_id   uuid             REFERENCES public.categories(id)  ON DELETE SET NULL,
  amount_cents  integer NOT NULL,                  -- negative = expense, positive = income
  currency      text    NOT NULL DEFAULT 'EUR',
  date          date    NOT NULL,
  description   text    NOT NULL DEFAULT '',
  notes         text,
  import_hash   text,                              -- opaque dedup key from CSV import
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'member')),
  token       uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);


-- =============================================================================
-- 2. INDEXES
-- =============================================================================

-- Transactions: fast range queries by account + date
CREATE INDEX IF NOT EXISTS transactions_account_date_idx
  ON public.transactions (account_id, date);

-- Transactions: unique dedup constraint for CSV import.
-- Must be a plain constraint (not a partial index) so PostgREST's ON CONFLICT
-- can use it. NULL import_hash = manually entered; NULLs are never equal in
-- Postgres uniqueness checks, so manual entries never conflict with each other.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_import_hash_key
  UNIQUE (account_id, import_hash);

-- Categories: fast lookup by account
CREATE INDEX IF NOT EXISTS categories_account_idx
  ON public.categories (account_id);


-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations     ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- accounts
-- -----------------------------------------------------------------------------

CREATE POLICY "accounts: members can read"
  ON public.accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = accounts.id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "accounts: owners can update"
  ON public.accounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = accounts.id
        AND user_id    = auth.uid()
        AND role       = 'owner'
    )
  );

-- -----------------------------------------------------------------------------
-- account_members
-- -----------------------------------------------------------------------------

-- Each user can only see their own membership rows.
-- "List all members of an account" is handled by get_account_members() RPC
-- (SECURITY DEFINER) to avoid a self-referential recursion here.
CREATE POLICY "account_members: read own rows"
  ON public.account_members FOR SELECT
  USING (user_id = auth.uid());

-- Owners can remove anyone; any user can remove themselves
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

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------

CREATE POLICY "categories: members can read"
  ON public.categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "categories: members can insert"
  ON public.categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "categories: members can delete"
  ON public.categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------

CREATE POLICY "transactions: members can read"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "transactions: members can insert"
  ON public.transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "transactions: members can update"
  ON public.transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
    )
  );

CREATE POLICY "transactions: members can delete"
  ON public.transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------

CREATE POLICY "invitations: owners can read"
  ON public.invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'owner'
    )
  );

CREATE POLICY "invitations: owners can insert"
  ON public.invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'owner'
    )
  );

CREATE POLICY "invitations: owners can delete"
  ON public.invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'owner'
    )
  );


-- =============================================================================
-- 4. FUNCTIONS (RPCs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_monthly_summary
-- Called by: transactionRepo.getMonthlySummary
-- Returns income + expense totals grouped by category for a given YYYY-MM.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_summary(
  p_account_id  uuid,
  p_year_month  text    -- 'YYYY-MM'
)
RETURNS TABLE (
  category_id   uuid,
  category_name text,
  parent_id     uuid,
  income_cents  bigint,
  expense_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be a member of the account
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    c.id                                                                          AS category_id,
    c.name                                                                        AS category_name,
    c.parent_id                                                                   AS parent_id,
    COALESCE(SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END), 0)::bigint AS income_cents,
    COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END), 0)::bigint AS expense_cents
  FROM public.transactions t
  LEFT JOIN public.categories c
    ON c.id = t.category_id AND c.deleted_at IS NULL
  WHERE t.account_id               = p_account_id
    AND to_char(t.date, 'YYYY-MM') = p_year_month
    AND t.deleted_at               IS NULL
  GROUP BY c.id, c.name, c.parent_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- get_account_members
-- Called by: useAccountMembers hook
-- Returns members with their auth email (requires access to auth.users).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- accept_invitation
-- Called by: /auth/callback route after a user signs up via invite link.
-- Adds the current user to the invited account and marks the token as used.
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

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (inv.account_id, auth.uid(), inv.role)
  ON CONFLICT (account_id, user_id) DO NOTHING;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;

-- Restrict execution to authenticated users only
REVOKE EXECUTE ON FUNCTION public.get_monthly_summary(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_members(uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid)         FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_monthly_summary(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_members(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid)         TO authenticated;


-- =============================================================================
-- 5. TRIGGER — auto-create account on new user signup
-- =============================================================================
--
-- When a brand-new user signs up normally, create a personal account and make
-- them the owner.
--
-- When a user signs up via an invitation link, skip account creation — they
-- will be added to the inviter's account by accept_invitation() in the
-- /auth/callback route.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_account_id uuid;
BEGIN
  -- Invited users carry invite_token in their metadata — skip account creation.
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

-- Drop first so re-running the script is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
