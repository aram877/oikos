-- =============================================================================
-- Household App — Supabase Schema  (single source of truth)
-- =============================================================================
-- Run this once on a fresh Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
--
-- This file is the complete, up-to-date schema.  All historical fix_*.sql
-- patches have been folded in.  You never need to run those files on a
-- fresh project — only run this one.
--
-- Order:
--   1. Tables
--   2. Indexes
--   3. Row Level Security (enable + policies)
--   4. Functions (RPCs)
--   5. Trigger — auto-create account on user signup
--   6. Realtime publications
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
  account_id       uuid  NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id          uuid  NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  role             text  NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'member')),
  joined_at        timestamptz NOT NULL DEFAULT now(),
  finance_access   text  NOT NULL DEFAULT 'read'
                         CHECK (finance_access  IN ('none', 'read', 'write')),
  shopping_access  text  NOT NULL DEFAULT 'write'
                         CHECK (shopping_access IN ('none', 'read', 'write')),
  calendar_access  text  NOT NULL DEFAULT 'write'
                         CHECK (calendar_access IN ('none', 'read', 'write')),
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
  is_transfer   boolean     NOT NULL DEFAULT false, -- true = internal transfer (excluded from summaries)
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

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  quantity   text,
  added_by   uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  start_date  date        NOT NULL,
  end_date    date,                          -- NULL = single-day event
  all_day     boolean     NOT NULL DEFAULT true,
  color       text,                          -- hex e.g. '#3b82f6'
  source_uid  text,                          -- RFC 5545 UID from ICS import
  created_by  uuid        REFERENCES auth.users(id),
  updated_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                    -- soft delete
);


-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text,
  date_of_birth  date,
  avatar_url     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
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

-- Calendar events: unique dedup constraint for ICS import.
-- NULL source_uid values (manually created events) are never equal in
-- Postgres uniqueness checks, so manual events are unaffected.
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_account_source_uid_key
  UNIQUE (account_id, source_uid);

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
ALTER TABLE public.shopping_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;

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

-- Owners can update member permissions
CREATE POLICY "account_members: owners can update permissions"
  ON public.account_members FOR UPDATE
  USING (
    EXISTS (
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
        AND (role = 'owner' OR finance_access IN ('read', 'write'))
    )
  );

CREATE POLICY "categories: members can insert"
  ON public.categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
    )
  );

CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
    )
  );

CREATE POLICY "categories: members can delete"
  ON public.categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
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
        AND (role = 'owner' OR finance_access IN ('read', 'write'))
    )
  );

CREATE POLICY "transactions: members can insert"
  ON public.transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
    )
  );

CREATE POLICY "transactions: members can update"
  ON public.transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
    )
  );

CREATE POLICY "transactions: members can delete"
  ON public.transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'owner' OR finance_access = 'write')
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


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated users can read profiles"
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());


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
    AND t.is_transfer              = false
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
  user_id         uuid,
  email           text,
  display_name    text,
  role            text,
  joined_at       timestamptz,
  finance_access  text,
  shopping_access text,
  calendar_access text
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
    COALESCE(p.display_name, split_part(u.email::text, '@', 1))::text,
    am.role,
    am.joined_at,
    am.finance_access,
    am.shopping_access,
    am.calendar_access
  FROM public.account_members am
  JOIN auth.users u ON u.id = am.user_id
  LEFT JOIN public.profiles p ON p.id = am.user_id
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
    INSERT INTO public.profiles (id) VALUES (NEW.id);
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

  INSERT INTO public.profiles (id) VALUES (NEW.id);

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


-- =============================================================================
-- 6. RLS POLICIES — shopping_items + calendar_events
-- =============================================================================

-- -----------------------------------------------------------------------------
-- shopping_items
-- -----------------------------------------------------------------------------

CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access IN ('read', 'write'))
  ));

CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access = 'write')
  ));

CREATE POLICY "members delete shopping"
  ON public.shopping_items FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access = 'write')
  ));

-- -----------------------------------------------------------------------------
-- calendar_events
-- -----------------------------------------------------------------------------

CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access IN ('read', 'write'))
  ));

CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

CREATE POLICY "members delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));


-- =============================================================================
-- 7. STORAGE — avatars bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);


-- =============================================================================
-- 8. REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;

