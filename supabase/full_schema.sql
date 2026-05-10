-- ==================================================================
-- Oikos — full database schema
-- Generated: 2026-05-10T09:04:35Z
-- Run this in a Supabase SQL editor. Re-running is safe:
--   • CREATE POLICY  → preceded by DROP POLICY IF EXISTS
--   • CREATE FUNCTION → preceded by DROP FUNCTION IF EXISTS CASCADE
--   • CREATE TRIGGER  → preceded by DROP TRIGGER IF EXISTS
--   • ALTER PUBLICATION ADD TABLE → wrapped in pg_publication_tables guard
--   • CREATE TABLE / INDEX → IF NOT EXISTS
-- ==================================================================

-- ────────────────────────────────────────────────────────────────────
-- schema.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Household App — Supabase Schema  (single source of truth)
-- =============================================================================
-- Run this once on a fresh Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
--
-- This file is the complete, up-to-date schema.  All historical fix_*.sql
-- and add_*.sql patches have been folded in.  You never need to run those
-- files on a fresh project — only run this one.
--
-- Order:
--   1. Tables
--   2. Indexes + constraints
--   3. Row Level Security (enable + policies)
--   4. Functions (RPCs)
--   5. Triggers
--   6. REVOKE / GRANT
--   7. Realtime publications
--   8. Storage
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
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid        NOT NULL REFERENCES public.accounts(id)   ON DELETE CASCADE,
  category_id   uuid                 REFERENCES public.categories(id) ON DELETE SET NULL,
  amount_cents  integer     NOT NULL,                  -- negative = expense, positive = income
  currency      text        NOT NULL DEFAULT 'EUR',
  date          date        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  notes         text,
  import_hash   text,                                  -- opaque dedup key from CSV import
  is_transfer   boolean     NOT NULL DEFAULT false,    -- true = internal transfer (excluded from summaries)
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

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,   -- 'invitation' | future types
  title      text        NOT NULL,
  body       text,
  data       jsonb,                  -- type-specific payload
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 2. INDEXES + CONSTRAINTS
-- =============================================================================

-- Transactions: fast range queries by account + date
CREATE INDEX IF NOT EXISTS transactions_account_date_idx
  ON public.transactions (account_id, date);

-- Transactions: unique dedup constraint for CSV import.
-- Must be a plain constraint (not a partial index) so PostgREST's ON CONFLICT
-- can use it. NULL import_hash = manually entered; NULLs are never equal in
-- Postgres uniqueness checks, so manual entries never conflict with each other.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_account_import_hash_key'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_account_import_hash_key
      UNIQUE (account_id, import_hash);
  END IF;
END $$;

-- Calendar events: unique dedup constraint for ICS import.
-- NULL source_uid values (manually created events) are never equal in
-- Postgres uniqueness checks, so manual events are unaffected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calendar_events_account_source_uid_key'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_account_source_uid_key
      UNIQUE (account_id, source_uid);
  END IF;
END $$;

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
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- accounts
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "accounts: members can read"
  ON public.accounts;
CREATE POLICY "accounts: members can read"
  ON public.accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = accounts.id
        AND user_id    = auth.uid()
    )
  );

DROP POLICY IF EXISTS "accounts: owners can update"
  ON public.accounts;
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
DROP POLICY IF EXISTS "account_members: read own rows"
  ON public.account_members;
CREATE POLICY "account_members: read own rows"
  ON public.account_members FOR SELECT
  USING (user_id = auth.uid());

-- Owners can remove anyone; any user can remove themselves.
-- Note: direct DELETE is discouraged — prefer remove_account_member() RPC
-- which is SECURITY DEFINER and bypasses the self-join RLS issue.
DROP POLICY IF EXISTS "account_members: delete self or as owner"
  ON public.account_members;
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
DROP POLICY IF EXISTS "account_members: owners can update permissions"
  ON public.account_members;
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

DROP POLICY IF EXISTS "categories: members can read"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can insert"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can update"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can delete"
  ON public.categories;
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

DROP POLICY IF EXISTS "transactions: members can read"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can insert"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can update"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can delete"
  ON public.transactions;
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

DROP POLICY IF EXISTS "invitations: owners can read"
  ON public.invitations;
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

DROP POLICY IF EXISTS "invitations: owners can insert"
  ON public.invitations;
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

DROP POLICY IF EXISTS "invitations: owners can delete"
  ON public.invitations;
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

DROP POLICY IF EXISTS "authenticated users can read profiles"
  ON public.profiles;
CREATE POLICY "authenticated users can read profiles"
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "users can insert own profile"
  ON public.profiles;
CREATE POLICY "users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users can update own profile"
  ON public.profiles;
CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "user reads own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "user updates own notifications" ON public.notifications;
DROP POLICY IF EXISTS "user deletes own notifications" ON public.notifications;

DROP POLICY IF EXISTS "user reads own notifications"
  ON public.notifications;
CREATE POLICY "user reads own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user updates own notifications"
  ON public.notifications;
CREATE POLICY "user updates own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user deletes own notifications"
  ON public.notifications;
CREATE POLICY "user deletes own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- shopping_items
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "members select shopping"
  ON public.shopping_items;
CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access IN ('read', 'write'))
  ));

DROP POLICY IF EXISTS "members insert shopping"
  ON public.shopping_items;
CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access = 'write')
  ));

DROP POLICY IF EXISTS "members delete shopping"
  ON public.shopping_items;
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

DROP POLICY IF EXISTS "members select calendar"
  ON public.calendar_events;
CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access IN ('read', 'write'))
  ));

DROP POLICY IF EXISTS "members insert calendar"
  ON public.calendar_events;
CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

DROP POLICY IF EXISTS "members update calendar"
  ON public.calendar_events;
CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

DROP POLICY IF EXISTS "members delete calendar"
  ON public.calendar_events;
CREATE POLICY "members delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));


-- =============================================================================
-- 4. FUNCTIONS (RPCs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_monthly_summary
-- Called by: transactionRepo.getMonthlySummary
-- Returns income + expense totals grouped by category for a given YYYY-MM.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_monthly_summary(
  p_account_id  uuid,
  p_year_month  text    -- 'YYYY-MM'
) CASCADE;
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
-- Called by: useHouseholdMembers hook
-- Returns members with their auth email (requires access to auth.users).
-- SECURITY DEFINER avoids self-referential RLS recursion on account_members.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
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
-- get_invitation_by_token
-- Called by: /invite/accept page to show household name + inviter name.
-- Any authenticated user who possesses the token can call this.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_invitation_by_token(p_token uuid) CASCADE;
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

-- -----------------------------------------------------------------------------
-- accept_invitation
-- Called by: /invite/accept page (registered users) and /auth/callback
--            (newly registered users arriving via invite link).
-- Removes the user from their current account, joins the invited account,
-- deletes the in-app invitation notification, and marks the token used.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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

  -- Delete the in-app invitation notification so it disappears from the bell.
  DELETE FROM public.notifications
  WHERE user_id = auth.uid()
    AND type    = 'invitation'
    AND (data->>'invite_token')::uuid = p_token;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- remove_account_member
-- Called by: useHouseholdMembers hook (owner removes a member).
-- SECURITY DEFINER bypasses the self-join RLS issue on account_members DELETE.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
) CASCADE;
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be the owner of this account.
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = auth.uid()
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Access denied: only the account owner can remove members';
  END IF;

  -- Disallow removing the owner.
  IF EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = p_member_id
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the account owner';
  END IF;

  DELETE FROM public.account_members
  WHERE account_id = p_account_id
    AND user_id    = p_member_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- get_or_create_account
-- Called by: getActiveAccountId() in accountContext.ts
-- Returns the user's current account_id, or creates a fresh personal account
-- if they have none (e.g. after being removed from a household).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_or_create_account() CASCADE;
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

  -- No membership — create a fresh personal account (mirrors handle_new_user).
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

-- -----------------------------------------------------------------------------
-- handle_invitation_notification
-- Trigger function: fires after INSERT on invitations.
-- Creates an in-app notification for the invitee if they are already registered.
-- Unregistered invitees have no auth.users row yet — they get only the email.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_invitation_notification() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_invitation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitee_id   uuid;
  inviter_name text;
  acct_name    text;
BEGIN
  -- Look up the invitee by email; skip if not yet registered
  SELECT id INTO invitee_id
  FROM auth.users
  WHERE email = NEW.email
  LIMIT 1;

  IF invitee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve inviter display name and account name
  SELECT
    COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1)),
    a.name
  INTO inviter_name, acct_name
  FROM auth.users        u
  LEFT JOIN public.profiles p ON p.id = u.id
  JOIN  public.accounts  a ON a.id = NEW.account_id
  WHERE u.id = NEW.invited_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    invitee_id,
    'invitation',
    'Household invitation',
    inviter_name || ' invited you to join ' || acct_name,
    jsonb_build_object(
      'invite_token',    NEW.token,
      'account_name',    acct_name,
      'invited_by_name', inviter_name
    )
  );

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- handle_new_user
-- Trigger function: fires after INSERT on auth.users.
-- Creates a personal account + default categories for brand-new registrations.
-- Invited users skip account creation (they join via accept_invitation()).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
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

  INSERT INTO public.account_members (account_id, user_id, role,
    finance_access, shopping_access, calendar_access)
  VALUES (new_account_id, NEW.id, 'owner', 'write', 'write', 'write');

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


-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================

-- Drop first so re-running the script is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_invitation_created ON public.invitations;

DROP TRIGGER IF EXISTS on_invitation_created ON public.invitations;
CREATE TRIGGER on_invitation_created
  AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_notification();


-- =============================================================================
-- 6. REVOKE / GRANT
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_monthly_summary(uuid, text)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_members(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_account_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_account()          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_monthly_summary(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_members(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_account_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_account()           TO authenticated;


-- =============================================================================
-- 7. REALTIME
-- =============================================================================

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shopping_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
  END IF;
END $pub$;
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='calendar_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
  END IF;
END $pub$;
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $pub$;
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_members;
  END IF;
END $pub$;


-- =============================================================================
-- 8. STORAGE — avatars bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "avatars are publicly readable"
  ON storage.objects;
CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "users upload own avatar"
  ON storage.objects;
CREATE POLICY "users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users update own avatar"
  ON storage.objects;
CREATE POLICY "users update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users delete own avatar"
  ON storage.objects;
CREATE POLICY "users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ────────────────────────────────────────────────────────────────────
-- fix_rls_recursion.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Fix: infinite recursion in account_members RLS policy
-- =============================================================================
-- The original SELECT policy on account_members did a subquery against
-- account_members itself → Postgres detects the cycle and throws:
--   "infinite recursion detected in policy for relation account_members"
--
-- Fix: each user can only SELECT their own rows directly.
-- All "list all members of an account" reads go through the
-- get_account_members() RPC which is SECURITY DEFINER and bypasses RLS.
-- =============================================================================

-- Drop the recursive policy
DROP POLICY IF EXISTS "account_members: members can read" ON public.account_members;

-- Replace with a simple, non-recursive policy
DROP POLICY IF EXISTS "account_members: read own rows"
  ON public.account_members;
CREATE POLICY "account_members: read own rows"
  ON public.account_members FOR SELECT
  USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- fix_import_hash_constraint.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Fix: ON CONFLICT requires a plain unique constraint, not a partial index
-- =============================================================================
-- PostgREST upsert with onConflict: 'account_id,import_hash' needs a full
-- unique constraint on those columns.
-- NULL values are treated as distinct in Postgres uniqueness checks, so
-- rows with import_hash = NULL (manual entries) never conflict with each other.
-- =============================================================================

DROP INDEX IF EXISTS transactions_account_import_hash_uidx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_account_import_hash_key'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_account_import_hash_key
      UNIQUE (account_id, import_hash);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- fix_get_account_members_ambiguous_user_id.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Fix ambiguous "user_id" column reference in get_account_members()
-- =============================================================================
-- The RETURNS TABLE declaration introduces `user_id` as an output variable into
-- the function body scope.  The unqualified `user_id` in the EXISTS guard was
-- therefore ambiguous between that output variable and
-- account_members.user_id, causing Postgres error:
--   "column reference 'user_id' is ambiguous"
-- Fix: alias the table in the EXISTS subquery and qualify every column.

DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- fix_default_categories.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Add default categories to new accounts (and backfill existing ones)
-- =============================================================================


-- ── 1. Update trigger to seed categories on every new account ────────────────

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- backfill_existing_users.sql
-- ────────────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────────────
-- add_shopping_and_calendar.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Add Shopping List + Calendar Events
-- =============================================================================
-- Run in:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ── Shopping Items ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopping_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  quantity   text,
  added_by   uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Calendar Events ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  start_date  date        NOT NULL,
  end_date    date,                          -- NULL = single-day event
  all_day     boolean     NOT NULL DEFAULT true,
  color       text,                          -- hex e.g. '#3b82f6'
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                    -- soft delete
);


-- =============================================================================
-- 2. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.shopping_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- ── Shopping Items policies ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "members select shopping"
  ON public.shopping_items;
CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "members insert shopping"
  ON public.shopping_items;
CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "members delete shopping"
  ON public.shopping_items;
CREATE POLICY "members delete shopping"
  ON public.shopping_items FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

-- ── Calendar Events policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "members select calendar"
  ON public.calendar_events;
CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "members insert calendar"
  ON public.calendar_events;
CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "members update calendar"
  ON public.calendar_events;
CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "members delete calendar"
  ON public.calendar_events;
CREATE POLICY "members delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));


-- =============================================================================
-- 3. REALTIME
-- =============================================================================

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shopping_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
  END IF;
END $pub$;
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='calendar_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
  END IF;
END $pub$;

-- ────────────────────────────────────────────────────────────────────
-- add_profiles.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: add profiles table + avatars storage bucket
-- Run this in the Supabase SQL Editor for existing projects.
-- (Fresh projects: this is already included in schema.sql)
-- =============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text,
  date_of_birth  date,
  avatar_url     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can read profiles"
  ON public.profiles;
CREATE POLICY "authenticated users can read profiles"
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "users can insert own profile"
  ON public.profiles;
CREATE POLICY "users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users can update own profile"
  ON public.profiles;
CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- 3. Back-fill a blank profile row for every existing user
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "avatars are publicly readable"
  ON storage.objects;
CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "users upload own avatar"
  ON storage.objects;
CREATE POLICY "users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users update own avatar"
  ON storage.objects;
CREATE POLICY "users update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users delete own avatar"
  ON storage.objects;
CREATE POLICY "users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ────────────────────────────────────────────────────────────────────
-- add_household_permissions.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: Household member permissions
-- =============================================================================
-- Run in Supabase SQL Editor on an EXISTING project.
-- For a fresh project, run schema.sql instead — this is already folded in.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add permission columns to account_members
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS finance_access  text NOT NULL DEFAULT 'read'
    CHECK (finance_access  IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS shopping_access text NOT NULL DEFAULT 'write'
    CHECK (shopping_access IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS calendar_access text NOT NULL DEFAULT 'write'
    CHECK (calendar_access IN ('none', 'read', 'write'));

-- Back-fill existing owner rows to 'write' (owners bypass RLS anyway, but
-- keeping the columns consistent makes the data self-documenting).
UPDATE public.account_members
  SET finance_access  = 'write',
      shopping_access = 'write',
      calendar_access = 'write'
  WHERE role = 'owner';


-- ---------------------------------------------------------------------------
-- 2. RLS UPDATE policy — owners can change member permissions
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "account_members: owners can update permissions"
  ON public.account_members;

DROP POLICY IF EXISTS "account_members: owners can update permissions"
  ON public.account_members;
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


-- ---------------------------------------------------------------------------
-- 3. Transactions policies (finance)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "transactions: members can read"   ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can update" ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can delete" ON public.transactions;

DROP POLICY IF EXISTS "transactions: members can read"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can insert"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can update"
  ON public.transactions;
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

DROP POLICY IF EXISTS "transactions: members can delete"
  ON public.transactions;
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


-- ---------------------------------------------------------------------------
-- 4. Categories policies (finance — members need read for transaction forms)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "categories: members can read"   ON public.categories;
DROP POLICY IF EXISTS "categories: members can insert" ON public.categories;
DROP POLICY IF EXISTS "categories: members can update" ON public.categories;
DROP POLICY IF EXISTS "categories: members can delete" ON public.categories;

DROP POLICY IF EXISTS "categories: members can read"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can insert"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can update"
  ON public.categories;
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

DROP POLICY IF EXISTS "categories: members can delete"
  ON public.categories;
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


-- ---------------------------------------------------------------------------
-- 5. Shopping items policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members select shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members insert shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members delete shopping" ON public.shopping_items;

DROP POLICY IF EXISTS "members select shopping"
  ON public.shopping_items;
CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access IN ('read', 'write'))
  ));

DROP POLICY IF EXISTS "members insert shopping"
  ON public.shopping_items;
CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access = 'write')
  ));

DROP POLICY IF EXISTS "members delete shopping"
  ON public.shopping_items;
CREATE POLICY "members delete shopping"
  ON public.shopping_items FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR shopping_access = 'write')
  ));


-- ---------------------------------------------------------------------------
-- 6. Calendar events policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members select calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members insert calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members update calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members delete calendar" ON public.calendar_events;

DROP POLICY IF EXISTS "members select calendar"
  ON public.calendar_events;
CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access IN ('read', 'write'))
  ));

DROP POLICY IF EXISTS "members insert calendar"
  ON public.calendar_events;
CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

DROP POLICY IF EXISTS "members update calendar"
  ON public.calendar_events;
CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));

DROP POLICY IF EXISTS "members delete calendar"
  ON public.calendar_events;
CREATE POLICY "members delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'owner' OR calendar_access = 'write')
  ));


-- ---------------------------------------------------------------------------
-- 7. Update get_account_members RPC — add display_name + permission columns
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_account_members(uuid);

DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- add_user_attribution.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: add updated_by to calendar_events
-- Run in Supabase SQL Editor (safe to re-run — IF NOT EXISTS guard)
-- =============================================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- ────────────────────────────────────────────────────────────────────
-- add_ics_import.sql
-- ────────────────────────────────────────────────────────────────────

-- Migration: add source_uid to calendar_events for ICS import dedup
-- Run in Supabase SQL Editor on existing projects.
-- schema.sql already includes this column for fresh installs.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_uid text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calendar_events_account_source_uid_key'
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_account_source_uid_key
      UNIQUE (account_id, source_uid);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- add_transfer_flag.sql
-- ────────────────────────────────────────────────────────────────────

-- Migration: add is_transfer flag to transactions
-- Run in Supabase SQL Editor on existing projects.
-- schema.sql already includes this column for fresh installs.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false;

-- Update get_monthly_summary to exclude internal transfers from income/expense totals
DROP FUNCTION IF EXISTS public.get_monthly_summary(
  p_account_id  uuid,
  p_year_month  text    -- 'YYYY-MM'
) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- add_notifications.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: notifications table + invitation notification trigger
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. notifications table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,   -- 'invitation' | future types
  title      text        NOT NULL,
  body       text,
  data       jsonb,                  -- type-specific payload
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
DROP POLICY IF EXISTS "user reads own notifications"
  ON public.notifications;
CREATE POLICY "user reads own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS "user updates own notifications"
  ON public.notifications;
CREATE POLICY "user updates own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add to Realtime publication so clients get pushed updates
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $pub$;


-- -----------------------------------------------------------------------------
-- 2. Trigger: create notification when an invitation is created
--    Only fires for already-registered invitees (new users have no auth.users row yet).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_invitation_notification() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_invitation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitee_id   uuid;
  inviter_name text;
  acct_name    text;
BEGIN
  -- Look up the invitee by email; skip if not yet registered
  SELECT id INTO invitee_id
  FROM auth.users
  WHERE email = NEW.email
  LIMIT 1;

  IF invitee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve inviter display name and account name
  SELECT
    COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1)),
    a.name
  INTO inviter_name, acct_name
  FROM auth.users        u
  LEFT JOIN public.profiles p ON p.id = u.id
  JOIN  public.accounts  a ON a.id = NEW.account_id
  WHERE u.id = NEW.invited_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    invitee_id,
    'invitation',
    'Household invitation',
    inviter_name || ' invited you to join ' || acct_name,
    jsonb_build_object(
      'invite_token',    NEW.token,
      'account_name',    acct_name,
      'invited_by_name', inviter_name
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invitation_created ON public.invitations;
CREATE TRIGGER on_invitation_created
  AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_notification();

-- ────────────────────────────────────────────────────────────────────
-- add_get_or_create_account_fn.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: add get_or_create_account() function
--
-- Run in: Supabase dashboard → SQL Editor
--
-- Replaces the direct account_members query in getActiveAccountId() with a
-- SECURITY DEFINER RPC that gracefully bootstraps a new personal account
-- when the user has no membership (e.g. after being removed from a household).
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_or_create_account() CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- add_account_members_realtime.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: add account_members to Realtime publication
--
-- Run in: Supabase dashboard → SQL Editor
--
-- This enables clients to receive real-time DELETE events when a member is
-- removed from a household, so their UI can immediately redirect them out
-- rather than showing stale data.
--
-- RLS still applies: each user only receives events for their own rows
-- (enforced by the existing "account_members: read own rows" policy).
-- =============================================================================

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_members;
  END IF;
END $pub$;

-- ────────────────────────────────────────────────────────────────────
-- add_remove_member_fn.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: add remove_account_member() SECURITY DEFINER function
--
-- Run in: Supabase dashboard → SQL Editor
--
-- Direct DELETE on account_members with an RLS self-join silently deletes
-- 0 rows when the subquery recursion fails.  This function bypasses RLS
-- and does the authorization check explicitly — same pattern as
-- get_account_members() and accept_invitation().
-- =============================================================================

DROP FUNCTION IF EXISTS public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
) CASCADE;
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be the owner of this account.
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = auth.uid()
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Access denied: only the account owner can remove members';
  END IF;

  -- Disallow removing the owner.
  IF EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = p_member_id
      AND role       = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the account owner';
  END IF;

  DELETE FROM public.account_members
  WHERE account_id = p_account_id
    AND user_id    = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_account_member(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- fix_account_members_delete_policy.sql
-- ────────────────────────────────────────────────────────────────────

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
DROP POLICY IF EXISTS "account_members: delete self or as owner"
  ON public.account_members;
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

-- ────────────────────────────────────────────────────────────────────
-- update_accept_invitation.sql
-- ────────────────────────────────────────────────────────────────────

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
DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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
DROP FUNCTION IF EXISTS public.get_invitation_by_token(p_token uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- update_notifications_delete.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: notifications — delete on accept + allow user to delete own rows
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- 1. Allow users to delete their own notifications (dismiss button).
DROP POLICY IF EXISTS "user deletes own notifications"
  ON public.notifications;
CREATE POLICY "user deletes own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());


-- 2. Update accept_invitation() to DELETE the invitation notification instead
--    of marking it read, so it disappears from the dropdown immediately.
DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- update_roles.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: roles redesign — owner/member → admin/parent/child
--
-- Run in: Supabase dashboard → SQL Editor
--
-- Changes:
--   1. Drop old CHECK constraints (unblocks backfill UPDATEs)
--   2. Backfill existing rows (owner→admin, member→parent)
--   3. Add new CHECK constraints + access columns to invitations
--   4. Replace all RLS policies with the new role model
--   5. Update RPCs: accept_invitation, remove_account_member,
--      get_or_create_account, handle_new_user
-- =============================================================================


-- =============================================================================
-- 1. DROP old constraints so backfill UPDATEs aren't blocked
-- =============================================================================

ALTER TABLE public.account_members
  DROP CONSTRAINT IF EXISTS account_members_role_check;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;


-- =============================================================================
-- 2. BACKFILL
-- =============================================================================

UPDATE public.account_members SET role = 'admin'  WHERE role = 'owner';
UPDATE public.account_members SET role = 'parent' WHERE role = 'member';
UPDATE public.invitations      SET role = 'parent' WHERE role = 'member';


-- =============================================================================
-- 3. ADD new constraints (rows are now valid)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_role_check') THEN
    ALTER TABLE public.account_members
      ADD CONSTRAINT account_members_role_check
      CHECK (role IN ('admin', 'parent', 'child'));
  END IF;
END $$;

ALTER TABLE public.account_members
  ALTER COLUMN role SET DEFAULT 'parent';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_role_check') THEN
    ALTER TABLE public.invitations
      ADD CONSTRAINT invitations_role_check
      CHECK (role IN ('parent', 'child'));
  END IF;
END $$;

ALTER TABLE public.invitations
  ALTER COLUMN role SET DEFAULT 'parent';


-- =============================================================================
-- 4. ADD ACCESS COLUMNS TO invitations
--    Stores the intended access levels so accept_invitation() can apply them.
-- =============================================================================

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS finance_access  text NOT NULL DEFAULT 'write'
    CHECK (finance_access  IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS shopping_access text NOT NULL DEFAULT 'write'
    CHECK (shopping_access IN ('none', 'read', 'write')),
  ADD COLUMN IF NOT EXISTS calendar_access text NOT NULL DEFAULT 'write'
    CHECK (calendar_access IN ('none', 'read', 'write'));


-- =============================================================================
-- 5. RLS POLICIES — drop old, recreate with new role model
-- =============================================================================

-- ── accounts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "accounts: owners can update" ON public.accounts;

DROP POLICY IF EXISTS "accounts: admins can update"
  ON public.accounts;
CREATE POLICY "accounts: admins can update"
  ON public.accounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = accounts.id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── account_members ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "account_members: delete self or as owner" ON public.account_members;

DROP POLICY IF EXISTS "account_members: delete self or as admin"
  ON public.account_members;
CREATE POLICY "account_members: delete self or as admin"
  ON public.account_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

DROP POLICY IF EXISTS "account_members: owners can update permissions" ON public.account_members;

DROP POLICY IF EXISTS "account_members: admins can update permissions"
  ON public.account_members;
CREATE POLICY "account_members: admins can update permissions"
  ON public.account_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );


-- ── categories ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "categories: members can read"   ON public.categories;
DROP POLICY IF EXISTS "categories: members can insert" ON public.categories;
DROP POLICY IF EXISTS "categories: members can update" ON public.categories;
DROP POLICY IF EXISTS "categories: members can delete" ON public.categories;

DROP POLICY IF EXISTS "categories: members can read"
  ON public.categories;
CREATE POLICY "categories: members can read"
  ON public.categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "categories: members can insert"
  ON public.categories;
CREATE POLICY "categories: members can insert"
  ON public.categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "categories: members can update"
  ON public.categories;
CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

-- Only admins can delete categories
DROP POLICY IF EXISTS "categories: admins can delete"
  ON public.categories;
CREATE POLICY "categories: admins can delete"
  ON public.categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categories.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── transactions ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "transactions: members can read"   ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can update" ON public.transactions;
DROP POLICY IF EXISTS "transactions: members can delete" ON public.transactions;

DROP POLICY IF EXISTS "transactions: members can read"
  ON public.transactions;
CREATE POLICY "transactions: members can read"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "transactions: members can insert"
  ON public.transactions;
CREATE POLICY "transactions: members can insert"
  ON public.transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "transactions: members can update"
  ON public.transactions;
CREATE POLICY "transactions: members can update"
  ON public.transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

-- Only admins can delete transactions
DROP POLICY IF EXISTS "transactions: admins can delete"
  ON public.transactions;
CREATE POLICY "transactions: admins can delete"
  ON public.transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = transactions.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── invitations ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "invitations: owners can read"   ON public.invitations;
DROP POLICY IF EXISTS "invitations: owners can insert" ON public.invitations;
DROP POLICY IF EXISTS "invitations: owners can delete" ON public.invitations;

DROP POLICY IF EXISTS "invitations: admins can read"
  ON public.invitations;
CREATE POLICY "invitations: admins can read"
  ON public.invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );

DROP POLICY IF EXISTS "invitations: admins can insert"
  ON public.invitations;
CREATE POLICY "invitations: admins can insert"
  ON public.invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );

DROP POLICY IF EXISTS "invitations: admins can delete"
  ON public.invitations;
CREATE POLICY "invitations: admins can delete"
  ON public.invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = invitations.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── shopping_items ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "members select shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members insert shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members delete shopping" ON public.shopping_items;

DROP POLICY IF EXISTS "members select shopping"
  ON public.shopping_items;
CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND shopping_access IN ('read', 'write')))
  ));

DROP POLICY IF EXISTS "members insert shopping"
  ON public.shopping_items;
CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND shopping_access = 'write'))
  ));

-- Only admins can delete shopping items
DROP POLICY IF EXISTS "admins delete shopping"
  ON public.shopping_items;
CREATE POLICY "admins delete shopping"
  ON public.shopping_items FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND role = 'admin'
  ));


-- ── calendar_events ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "members select calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members insert calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members update calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members delete calendar" ON public.calendar_events;

DROP POLICY IF EXISTS "members select calendar"
  ON public.calendar_events;
CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access IN ('read', 'write')))
  ));

DROP POLICY IF EXISTS "members insert calendar"
  ON public.calendar_events;
CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access = 'write'))
  ));

DROP POLICY IF EXISTS "members update calendar"
  ON public.calendar_events;
CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access = 'write'))
  ));

-- Only admins can delete calendar events
DROP POLICY IF EXISTS "admins delete calendar"
  ON public.calendar_events;
CREATE POLICY "admins delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND role = 'admin'
  ));


-- =============================================================================
-- 6. UPDATE RPCs
-- =============================================================================

-- ── accept_invitation — copy access columns from invitation to membership ─────

DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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

  -- Add to the invited account with the role and access levels from the invitation.
  INSERT INTO public.account_members (
    account_id, user_id, role,
    finance_access, shopping_access, calendar_access
  )
  VALUES (
    inv.account_id, auth.uid(), inv.role,
    inv.finance_access, inv.shopping_access, inv.calendar_access
  );

  -- Delete the in-app invitation notification so it disappears from the bell.
  DELETE FROM public.notifications
  WHERE user_id = auth.uid()
    AND type    = 'invitation'
    AND (data->>'invite_token')::uuid = p_token;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE token = p_token;
END;
$$;


-- ── remove_account_member — check for admin role ──────────────────────────────

DROP FUNCTION IF EXISTS public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
) CASCADE;
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_account_id uuid,
  p_member_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Caller must be the admin of this account.
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = auth.uid()
      AND role       = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: only the account admin can remove members';
  END IF;

  -- Disallow removing the admin.
  IF EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id
      AND user_id    = p_member_id
      AND role       = 'admin'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the account admin';
  END IF;

  DELETE FROM public.account_members
  WHERE account_id = p_account_id
    AND user_id    = p_member_id;
END;
$$;


-- ── get_or_create_account — use admin role for new accounts ───────────────────

DROP FUNCTION IF EXISTS public.get_or_create_account() CASCADE;
CREATE OR REPLACE FUNCTION public.get_or_create_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_user_email text;
BEGIN
  SELECT account_id INTO v_account_id
  FROM public.account_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.accounts (name, currency)
  VALUES (split_part(v_user_email, '@', 1), 'EUR')
  RETURNING id INTO v_account_id;

  INSERT INTO public.account_members (account_id, user_id, role,
    finance_access, shopping_access, calendar_access)
  VALUES (v_account_id, auth.uid(), 'admin', 'write', 'write', 'write');

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


-- ── handle_new_user — use admin role for new accounts ────────────────────────

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_account_id uuid;
BEGIN
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

  INSERT INTO public.account_members (account_id, user_id, role,
    finance_access, shopping_access, calendar_access)
  VALUES (new_account_id, NEW.id, 'admin', 'write', 'write', 'write');

  INSERT INTO public.profiles (id) VALUES (NEW.id);

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

-- ────────────────────────────────────────────────────────────────────
-- add_settings_ai_access.sql
-- ────────────────────────────────────────────────────────────────────

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

DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
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

DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- add_meal_plan.sql
-- ────────────────────────────────────────────────────────────────────

-- ── Meal Plan feature ─────────────────────────────────────────────────────────
-- Tables: meals, meal_ingredients, meal_plan_slots
-- Permissions: reuses shopping_access (no new column needed)
-- Run in Supabase SQL editor.

-- 1. Meal library (one row per meal per household)
CREATE TABLE IF NOT EXISTS meals (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ingredients per meal (names only, no quantities)
CREATE TABLE IF NOT EXISTS meal_ingredients (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name    text NOT NULL
);

-- 3. Weekly plan grid slots
--    week_start is always the Monday of the planned week (YYYY-MM-DD)
--    day_of_week: 0=Mon … 6=Sun
--    slot: breakfast | lunch | dinner
CREATE TABLE IF NOT EXISTS meal_plan_slots (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid     NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  week_start   date     NOT NULL,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot         text     NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
  meal_id      uuid     REFERENCES meals(id) ON DELETE SET NULL,
  UNIQUE (account_id, week_start, day_of_week, slot)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE meals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_slots  ENABLE ROW LEVEL SECURITY;

-- meals: members with any shopping_access can read; write requires shopping_access = 'write'
DROP POLICY IF EXISTS "meals_select" ON meals;
CREATE POLICY "meals_select" ON meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

DROP POLICY IF EXISTS "meals_insert" ON meals;
CREATE POLICY "meals_insert" ON meals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meals_update" ON meals;
CREATE POLICY "meals_update" ON meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meals_delete" ON meals;
CREATE POLICY "meals_delete" ON meals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

-- meal_ingredients: inherit access via parent meal → account
DROP POLICY IF EXISTS "meal_ingredients_select" ON meal_ingredients;
CREATE POLICY "meal_ingredients_select" ON meal_ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

DROP POLICY IF EXISTS "meal_ingredients_insert" ON meal_ingredients;
CREATE POLICY "meal_ingredients_insert" ON meal_ingredients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meal_ingredients_update" ON meal_ingredients;
CREATE POLICY "meal_ingredients_update" ON meal_ingredients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meal_ingredients_delete" ON meal_ingredients;
CREATE POLICY "meal_ingredients_delete" ON meal_ingredients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN account_members am ON am.account_id = m.account_id
      WHERE m.id         = meal_ingredients.meal_id
        AND am.user_id   = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

-- meal_plan_slots: same access pattern as meals
DROP POLICY IF EXISTS "meal_plan_slots_select" ON meal_plan_slots;
CREATE POLICY "meal_plan_slots_select" ON meal_plan_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

DROP POLICY IF EXISTS "meal_plan_slots_insert" ON meal_plan_slots;
CREATE POLICY "meal_plan_slots_insert" ON meal_plan_slots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meal_plan_slots_update" ON meal_plan_slots;
CREATE POLICY "meal_plan_slots_update" ON meal_plan_slots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "meal_plan_slots_delete" ON meal_plan_slots;
CREATE POLICY "meal_plan_slots_delete" ON meal_plan_slots
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_messages.sql
-- ────────────────────────────────────────────────────────────────────

-- ── Phase 1a: messages table ─────────────────────────────────────────────── --

CREATE TABLE IF NOT EXISTS public.messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account members read messages"
  ON public.messages;
CREATE POLICY "account members read messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "account members insert own messages"
  ON public.messages;
CREATE POLICY "account members insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $pub$;

-- ── Phase 1b: notification trigger ───────────────────────────────────────── --

DROP FUNCTION IF EXISTS public.notify_members_on_message() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(display_name, 'A member') INTO sender_name
  FROM public.profiles WHERE id = NEW.user_id;

  FOR m IN
    SELECT user_id FROM public.account_members
    WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      m.user_id, 'message',
      sender_name,
      left(NEW.body, 100),
      jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_message ON public.messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_members_on_message();

-- ── Phase 1c: messaging_access column ────────────────────────────────────── --

ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS messaging_access text NOT NULL DEFAULT 'write'
    CHECK (messaging_access IN ('none', 'read', 'write'));

-- ────────────────────────────────────────────────────────────────────
-- add_push_subscriptions.sql
-- ────────────────────────────────────────────────────────────────────

-- Push subscriptions for Web Push notifications
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subscriptions" ON public.push_subscriptions;
CREATE POLICY "own subscriptions" ON public.push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- add_dm_messages.sql
-- ────────────────────────────────────────────────────────────────────

-- Migration: add DM support to messages
-- Run this in the Supabase SQL editor before deploying the app update.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS: members can read group messages and their own DMs
DROP POLICY IF EXISTS "account members read messages"                ON public.messages;
DROP POLICY IF EXISTS "messages: members can read group and own DMs" ON public.messages;
DROP POLICY IF EXISTS "messages: members can read group and own DMs"
  ON public.messages;
CREATE POLICY "messages: members can read group and own DMs"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
    AND (
      messages.recipient_id IS NULL
      OR messages.user_id      = auth.uid()
      OR messages.recipient_id = auth.uid()
    )
  );

-- Update RLS: members can insert their own messages (group or DM)
-- Note: no recipient membership check needed — the SELECT policy enforces DM visibility
DROP POLICY IF EXISTS "account members insert own messages"       ON public.messages;
DROP POLICY IF EXISTS "messages: members can insert own messages" ON public.messages;
DROP POLICY IF EXISTS "messages: members can insert own messages"
  ON public.messages;
CREATE POLICY "messages: members can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

-- Replace trigger function to handle both group and DM notifications
-- (The trigger itself is unchanged — it already calls this function by name)
DROP FUNCTION IF EXISTS public.notify_members_on_message() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(display_name, 'A member') INTO sender_name
  FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.recipient_id IS NULL THEN
    -- Group message: notify all other members
    FOR m IN
      SELECT user_id FROM public.account_members
      WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (m.user_id, 'message', sender_name, left(NEW.body, 100),
        jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id, 'is_dm', false));
    END LOOP;
  ELSE
    -- DM: notify only the recipient
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_id, 'message', sender_name, left(NEW.body, 100),
      jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id, 'is_dm', true));
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_categorization_rules.sql
-- ────────────────────────────────────────────────────────────────────

-- Categorization rules: account-level rules that map description + optional
-- amount to a category. Applied before DB history and Ollama during auto-categorize.

CREATE TABLE IF NOT EXISTS categorization_rules (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  description_contains text        NOT NULL,
  amount_cents         integer,    -- NULL = match any amount (absolute value match)
  category_id          uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can manage their account's categorization rules"
  ON categorization_rules;
CREATE POLICY "Members can manage their account's categorization rules"
  ON categorization_rules
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- alter_categorization_rules_amount_range.sql
-- ────────────────────────────────────────────────────────────────────

-- Replace exact amount_cents match with an open range (min/max).
-- Both NULL = match any amount.  One or both can be set for < / > / range checks.

ALTER TABLE categorization_rules
  ADD COLUMN IF NOT EXISTS amount_min_cents integer,
  ADD COLUMN IF NOT EXISTS amount_max_cents integer;

-- Migrate existing exact-match rules: treat them as an exact range.
-- Guarded so re-runs (where amount_cents has already been dropped) succeed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'categorization_rules'
      AND column_name  = 'amount_cents'
  ) THEN
    EXECUTE 'UPDATE categorization_rules '
         || 'SET amount_min_cents = amount_cents, '
         || '    amount_max_cents = amount_cents '
         || 'WHERE amount_cents IS NOT NULL';
  END IF;
END $$;

ALTER TABLE categorization_rules
  DROP COLUMN IF EXISTS amount_cents;

-- ────────────────────────────────────────────────────────────────────
-- alter_categorization_rules_add_note.sql
-- ────────────────────────────────────────────────────────────────────

-- Add optional note to categorization rules.
-- When a rule matches, this note is applied to the transaction alongside the category.

ALTER TABLE categorization_rules
  ADD COLUMN IF NOT EXISTS note text;

-- ────────────────────────────────────────────────────────────────────
-- add_get_account_balance_fn.sql
-- ────────────────────────────────────────────────────────────────────

-- Returns a balance breakdown for an account based on all recorded transactions.
-- cashflow_cents  = sum of non-transfer transactions (income - expenses) = net worth
-- transfers_cents = sum of transfer transactions (negative = net moved to savings)
-- balance_cents   = sum of ALL transactions (= checking account balance)
--
-- Net worth = cashflow_cents
-- Checking  = balance_cents
-- Savings   = -transfers_cents

DROP FUNCTION IF EXISTS get_account_balance(p_account_id uuid) CASCADE;
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id uuid)
RETURNS TABLE (
  cashflow_cents  bigint,
  transfers_cents bigint,
  balance_cents   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(CASE WHEN NOT is_transfer THEN amount_cents ELSE 0 END), 0) AS cashflow_cents,
    COALESCE(SUM(CASE WHEN     is_transfer THEN amount_cents ELSE 0 END), 0) AS transfers_cents,
    COALESCE(SUM(amount_cents), 0)                                           AS balance_cents
  FROM transactions
  WHERE account_id = p_account_id
    AND deleted_at IS NULL;
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_budgets.sql
-- ────────────────────────────────────────────────────────────────────

-- Budgets: per-category monthly spending caps for an account.
-- One row per (account_id, category_id) — represents the recurring monthly target.
-- amount_cents is stored as a positive number (the cap on absolute spend).

CREATE TABLE IF NOT EXISTS budgets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  category_id  uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount_cents integer     NOT NULL CHECK (amount_cents > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, category_id)
);

CREATE INDEX IF NOT EXISTS budgets_account_id_idx ON budgets (account_id);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can manage their account's budgets"
  ON budgets;
CREATE POLICY "Members can manage their account's budgets"
  ON budgets
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_savings_goals.sql
-- ────────────────────────────────────────────────────────────────────

-- Savings goals: named targets with optional deadline.
-- current_cents is updated manually by the user (no auto-link to transactions
-- in v1). soft delete via deleted_at.

CREATE TABLE IF NOT EXISTS savings_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          text        NOT NULL CHECK (length(trim(name)) > 0),
  target_cents  integer     NOT NULL CHECK (target_cents > 0),
  current_cents integer     NOT NULL DEFAULT 0 CHECK (current_cents >= 0),
  target_date   date,                          -- NULL = no deadline
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz                     -- NULL = active
);

CREATE INDEX IF NOT EXISTS savings_goals_account_id_idx ON savings_goals (account_id) WHERE deleted_at IS NULL;

ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can manage their account's savings goals"
  ON savings_goals;
CREATE POLICY "Members can manage their account's savings goals"
  ON savings_goals
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_recurring_transactions.sql
-- ────────────────────────────────────────────────────────────────────

-- Recurring transactions: templates that auto-generate transactions on a
-- schedule (e.g. monthly rent, weekly subscription). The generator runs
-- client-side when a household member opens the transactions page — it
-- reads templates whose next_run_date <= today, inserts the transactions,
-- and bumps next_run_date forward.

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid        NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  category_id     uuid                 REFERENCES categories(id) ON DELETE SET NULL,
  description     text        NOT NULL CHECK (length(trim(description)) > 0),
  notes           text,
  amount_cents    integer     NOT NULL,                       -- signed: negative = expense
  is_transfer     boolean     NOT NULL DEFAULT false,
  frequency       text        NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'yearly')),
  start_date      date        NOT NULL,
  next_run_date   date        NOT NULL,                       -- the next date to generate
  end_date        date,                                        -- NULL = no end
  paused          boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                                  -- NULL = active
);

CREATE INDEX IF NOT EXISTS recurring_transactions_account_idx
  ON recurring_transactions (account_id, next_run_date)
  WHERE deleted_at IS NULL AND paused = false;

ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can manage their account's recurring transactions"
  ON recurring_transactions;
CREATE POLICY "Members can manage their account's recurring transactions"
  ON recurring_transactions
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_message_reads.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: message_reads (per-user-per-conversation read tracking)
--
-- Replaces the localStorage-based unread tracking with a server-side source
-- of truth.  Powers conversation-list unread badges, the nav-bar message
-- badge, and read receipts.
--
-- Also rewrites notify_members_on_message() to coalesce notifications:
--   • only one unread bell entry per (recipient, conversation) at a time
--   • opening a conversation deletes those entries automatically (via the
--     on_message_read trigger), so old chats no longer "keep notifying".
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. message_reads table
--    PK = (user_id, account_id, conversation_id)
--    conversation_id is the literal string 'group' OR a partner user_id (uuid as text)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reads (
  user_id         uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id text        NOT NULL,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS message_reads_account_conv_idx
  ON public.message_reads (account_id, conversation_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Account members can read each other's read timestamps (needed for read receipts).
DROP POLICY IF EXISTS "members read account reads"
  ON public.message_reads;
CREATE POLICY "members read account reads"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users insert own reads"
  ON public.message_reads;
CREATE POLICY "users insert own reads"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users update own reads"
  ON public.message_reads;
CREATE POLICY "users update own reads"
  ON public.message_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
  END IF;
END $pub$;


-- -----------------------------------------------------------------------------
-- 2. Trigger: when a user marks a conversation read, drop their unread
--    'message' notifications for that conversation.  This is what kills the
--    "old chat keeps notifying" bug.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.clear_message_notifications_on_read() CASCADE;
CREATE OR REPLACE FUNCTION public.clear_message_notifications_on_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE user_id = NEW.user_id
     AND type    = 'message'
     AND (data->>'conversation_id') = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_read ON public.message_reads;
DROP TRIGGER IF EXISTS on_message_read ON public.message_reads;
CREATE TRIGGER on_message_read
  AFTER INSERT OR UPDATE ON public.message_reads
  FOR EACH ROW EXECUTE FUNCTION public.clear_message_notifications_on_read();


-- -----------------------------------------------------------------------------
-- 3. Replace notify_members_on_message() to coalesce per (recipient, conv).
--    Also stamps `data.conversation_id` so the trigger above can target it.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.notify_members_on_message() CASCADE;
CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  conv_id     TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(NULLIF(trim(display_name), ''), 'A member')
    INTO sender_name
    FROM public.profiles
   WHERE id = NEW.user_id;

  IF NEW.recipient_id IS NULL THEN
    -- Group message
    conv_id := 'group';
    FOR m IN
      SELECT user_id FROM public.account_members
       WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
    LOOP
      DELETE FROM public.notifications
       WHERE user_id = m.user_id
         AND type    = 'message'
         AND read_at IS NULL
         AND (data->>'conversation_id') = conv_id;

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (m.user_id, 'message', sender_name, left(NEW.body, 100),
              jsonb_build_object(
                'message_id',      NEW.id,
                'sender_id',       NEW.user_id,
                'conversation_id', conv_id,
                'is_dm',           false
              ));
    END LOOP;
  ELSE
    -- DM: recipient sees this as a conversation keyed by the sender's id
    conv_id := NEW.user_id::text;
    DELETE FROM public.notifications
     WHERE user_id = NEW.recipient_id
       AND type    = 'message'
       AND read_at IS NULL
       AND (data->>'conversation_id') = conv_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_id, 'message', sender_name, left(NEW.body, 100),
            jsonb_build_object(
              'message_id',      NEW.id,
              'sender_id',       NEW.user_id,
              'conversation_id', conv_id,
              'is_dm',           true
            ));
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. RPC: total unread message count for the active user across all
--    conversations in the account.  Powers the nav-bar badge.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_unread_message_count(p_account_id uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_unread_message_count(p_account_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH my_reads AS (
    SELECT conversation_id, last_read_at
      FROM public.message_reads
     WHERE user_id    = auth.uid()
       AND account_id = p_account_id
  ),
  group_read AS (
    SELECT COALESCE(
             (SELECT last_read_at FROM my_reads WHERE conversation_id = 'group'),
             'epoch'::timestamptz
           ) AS ts
  )
  SELECT COUNT(*)::bigint
    FROM public.messages m
   WHERE m.account_id = p_account_id
     AND m.user_id   <> auth.uid()
     AND (
       (m.recipient_id IS NULL AND m.created_at > (SELECT ts FROM group_read))
       OR
       (m.recipient_id = auth.uid() AND m.created_at > COALESCE(
         (SELECT last_read_at FROM my_reads WHERE conversation_id = m.user_id::text),
         'epoch'::timestamptz
       ))
     );
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_transaction_receipts.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: receipts on transactions
--
-- Lets users attach images / PDFs to a transaction.  Files live in a PRIVATE
-- Supabase Storage bucket (`receipts`); the app generates short-lived signed
-- URLs to render thumbnails and lightbox previews.
--
-- Path convention: `{accountId}/{transactionId}/{uuid}.{ext}`.  Storage RLS
-- uses the first path segment to enforce account membership.
--
-- The `transaction_receipts` table is the durable record (metadata + the
-- storage path); deleting a row should be paired with deleting the storage
-- object on the client.
--
-- Run in: Supabase dashboard → SQL Editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. transaction_receipts table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_receipts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid        NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  storage_path    text        NOT NULL,
  mime_type       text        NOT NULL,
  size_bytes      int         NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10 * 1024 * 1024),
  original_name   text,
  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_receipts_tx_idx
  ON public.transaction_receipts (transaction_id);

CREATE INDEX IF NOT EXISTS transaction_receipts_account_idx
  ON public.transaction_receipts (account_id);

ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;

-- Members with finance_access in ('read', 'write') can SELECT.
DROP POLICY IF EXISTS "members read receipts"
  ON public.transaction_receipts;
CREATE POLICY "members read receipts"
  ON public.transaction_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

-- Members with finance_access = 'write' can INSERT.
DROP POLICY IF EXISTS "members insert receipts"
  ON public.transaction_receipts;
CREATE POLICY "members insert receipts"
  ON public.transaction_receipts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

-- Members with finance_access = 'write' can DELETE.
DROP POLICY IF EXISTS "members delete receipts"
  ON public.transaction_receipts;
CREATE POLICY "members delete receipts"
  ON public.transaction_receipts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. Storage bucket (private)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT DO NOTHING;

-- Storage RLS: the first folder segment of `name` is the account_id.
-- Members of that account can read; members with finance_access='write' can
-- insert / update / delete.

DROP POLICY IF EXISTS "members read receipt files"
  ON storage.objects;
CREATE POLICY "members read receipt files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members upload receipt files"
  ON storage.objects;
CREATE POLICY "members upload receipt files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members delete receipt files"
  ON storage.objects;
CREATE POLICY "members delete receipt files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. RPC: counts per transaction id (used by the list view to render the
--    paperclip indicator without one round-trip per row).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_receipt_counts(p_transaction_ids uuid[]) CASCADE;
CREATE OR REPLACE FUNCTION public.get_receipt_counts(p_transaction_ids uuid[])
RETURNS TABLE (transaction_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.transaction_id, COUNT(*)::bigint
    FROM public.transaction_receipts r
   WHERE r.transaction_id = ANY(p_transaction_ids)
     AND EXISTS (
       SELECT 1 FROM public.account_members am
       WHERE am.account_id     = r.account_id
         AND am.user_id        = auth.uid()
         AND am.finance_access IN ('read', 'write')
     )
   GROUP BY r.transaction_id;
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_subscriptions.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: subscription tracker
--
-- Tracks recurring household subscriptions (Netflix, Spotify, gym, …) and
-- links real transactions to them — even when the bank description doesn't
-- name the service (e.g. APPLE.COM/BILL aggregating multiple subscriptions).
--
-- Two tables:
--   • subscriptions — the service itself (name, cadence, expected amount, …)
--   • subscription_match_patterns — one or more matchers per subscription
--     (description-contains + optional amount range), so an aggregator like
--     APPLE.COM/BILL can be narrowed by amount to disambiguate.
--
-- Plus a nullable transactions.subscription_id so a transaction can be
-- explicitly linked, regardless of patterns.
--
-- Run in: Supabase dashboard → SQL Editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid        NOT NULL REFERENCES public.accounts(id)   ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 120),
  vendor                text,
  category_id           uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  expected_amount_cents int,                       -- typical cost (signed; negative for expense)
  cadence               text        NOT NULL CHECK (cadence IN ('weekly','biweekly','monthly','quarterly','yearly')),
  notes                 text,
  started_on            date,
  cancelled_on          date,                      -- NULL = active
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz                -- soft delete
);

CREATE INDEX IF NOT EXISTS subscriptions_account_idx
  ON public.subscriptions (account_id) WHERE deleted_at IS NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read subscriptions"
  ON public.subscriptions;
CREATE POLICY "members read subscriptions"
  ON public.subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members write subscriptions"
  ON public.subscriptions;
CREATE POLICY "members write subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members update subscriptions"
  ON public.subscriptions;
CREATE POLICY "members update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. subscription_match_patterns
--    description_contains is a case-insensitive substring; amount_min/max
--    are optional bounds on |tx.amount_cents|.  First match wins (most-
--    specific is favoured by the matcher's ranking — see subscriptionMatcher.ts).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_match_patterns (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      uuid        NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  description_contains text        NOT NULL CHECK (char_length(description_contains) > 0),
  amount_min_cents     int,
  amount_max_cents     int,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_match_patterns_sub_idx
  ON public.subscription_match_patterns (subscription_id);

ALTER TABLE public.subscription_match_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read patterns"
  ON public.subscription_match_patterns;
CREATE POLICY "members read patterns"
  ON public.subscription_match_patterns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members write patterns"
  ON public.subscription_match_patterns;
CREATE POLICY "members write patterns"
  ON public.subscription_match_patterns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members delete patterns"
  ON public.subscription_match_patterns;
CREATE POLICY "members delete patterns"
  ON public.subscription_match_patterns FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. transactions.subscription_id  (nullable explicit link)
--    A transaction can be assigned to a subscription either by the matcher
--    or manually by the user.  Manual link wins.
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS subscription_id uuid
    REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_subscription_idx
  ON public.transactions (subscription_id) WHERE deleted_at IS NULL;


-- -----------------------------------------------------------------------------
-- 4. RPC: spend rollups per subscription over a date window.
--    Powers the list page's "monthly cost" column without N+1 queries.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_subscription_spend(
  p_account_id uuid,
  p_start_date date,
  p_end_date   date
) CASCADE;
CREATE OR REPLACE FUNCTION public.get_subscription_spend(
  p_account_id uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS TABLE (
  subscription_id uuid,
  total_cents     bigint,
  charge_count    bigint,
  last_charged_on date
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.subscription_id,
    SUM(ABS(t.amount_cents))::bigint AS total_cents,
    COUNT(*)::bigint                  AS charge_count,
    MAX(t.date)                       AS last_charged_on
    FROM public.transactions t
   WHERE t.account_id      = p_account_id
     AND t.subscription_id IS NOT NULL
     AND t.deleted_at      IS NULL
     AND t.date >= p_start_date
     AND t.date <  p_end_date
     AND EXISTS (
       SELECT 1 FROM public.account_members am
       WHERE am.account_id     = p_account_id
         AND am.user_id        = auth.uid()
         AND am.finance_access IN ('read', 'write')
     )
   GROUP BY t.subscription_id;
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_subscription_suggestions.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: subscription suggestion dismissals
--
-- The smart subscription detector scans the last 12 months of transactions
-- and surfaces likely subscriptions (recurring same-merchant-same-amount
-- patterns).  Users can either "Track this" (creates a subscription + match
-- pattern + bulk-links the transactions) or "Dismiss" the suggestion.
--
-- Dismissals are persisted account-wide so they don't reappear on a
-- different device or after the next login.  The fingerprint is a stable
-- hash of (normalized description + amount bucket); it's computed
-- deterministically by src/lib/subscriptionDetector.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_suggestion_dismissals (
  account_id    uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fingerprint   text        NOT NULL,
  dismissed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, fingerprint)
);

ALTER TABLE public.subscription_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read dismissals"
  ON public.subscription_suggestion_dismissals;
CREATE POLICY "members read dismissals"
  ON public.subscription_suggestion_dismissals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members insert dismissals"
  ON public.subscription_suggestion_dismissals;
CREATE POLICY "members insert dismissals"
  ON public.subscription_suggestion_dismissals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members delete dismissals"
  ON public.subscription_suggestion_dismissals;
CREATE POLICY "members delete dismissals"
  ON public.subscription_suggestion_dismissals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_password_vault.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: end-to-end encrypted household password vault
--
-- Threat model:
--   • The server (Supabase) never sees plaintext passwords / usernames /
--     notes.  All sensitive fields are encrypted client-side with AES-GCM
--     using a key derived from a household master passphrase via PBKDF2-
--     SHA256 (600k iterations, per-account random salt).
--   • Browse-only fields stay plaintext: entry name + optional url.  This
--     makes the entry list useful even before unlocking and lets us search
--     without decrypting everything.
--   • RLS: account membership + vault_access column gates SELECT/INSERT/
--     UPDATE/DELETE.  Within a member, role-level rules apply (only admins
--     bootstrap the vault row).
--
-- Encryption uses base64 in `text` columns rather than `bytea` to avoid
-- Supabase JS bytea decode/encode pain.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. New permission column on account_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS vault_access text NOT NULL DEFAULT 'none'
    CHECK (vault_access IN ('none', 'read', 'write'));

-- Backfill: admin gets write by default; everyone else stays 'none'
-- (the admin can grant access from /household).
UPDATE public.account_members SET vault_access = 'write' WHERE role = 'admin';


-- -----------------------------------------------------------------------------
-- 2. Per-account vault metadata (KDF params + verifier)
--    Verifier is a fixed plaintext encrypted with the derived key.  On
--    unlock the client decrypts it; if AES-GCM authentication fails OR the
--    plaintext doesn't match, the passphrase is wrong.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_vaults (
  account_id   uuid        PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  kdf          text        NOT NULL DEFAULT 'PBKDF2-SHA256',
  kdf_iters    int         NOT NULL DEFAULT 600000,
  salt_b64     text        NOT NULL,
  verifier_ct  text        NOT NULL,    -- base64 ciphertext
  verifier_iv  text        NOT NULL,    -- base64 12-byte IV
  setup_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_vaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read vault meta"
  ON public.password_vaults;
CREATE POLICY "members read vault meta"
  ON public.password_vaults FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_vaults.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "admin sets up vault"
  ON public.password_vaults;
CREATE POLICY "admin sets up vault"
  ON public.password_vaults FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

DROP POLICY IF EXISTS "admin updates vault meta"
  ON public.password_vaults;
CREATE POLICY "admin updates vault meta"
  ON public.password_vaults FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

DROP POLICY IF EXISTS "admin deletes vault meta"
  ON public.password_vaults;
CREATE POLICY "admin deletes vault meta"
  ON public.password_vaults FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Vault entries
--    Plaintext fields:  name (label), url (optional), updated_at, created_by.
--    Encrypted blob:    everything sensitive (username, password, totp,
--                       notes) packed into a single JSON object then
--                       AES-GCM-encrypted.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name         text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  url          text,
  ciphertext   text        NOT NULL,
  iv           text        NOT NULL,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_entries_account_idx
  ON public.password_entries (account_id);

ALTER TABLE public.password_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read entries"
  ON public.password_entries;
CREATE POLICY "members read entries"
  ON public.password_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members insert entries"
  ON public.password_entries;
CREATE POLICY "members insert entries"
  ON public.password_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members update entries"
  ON public.password_entries;
CREATE POLICY "members update entries"
  ON public.password_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members delete entries"
  ON public.password_entries;
CREATE POLICY "members delete entries"
  ON public.password_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 4. Update get_account_members RPC to surface vault_access
--
-- Postgres won't let CREATE OR REPLACE change a function's return shape, so
-- we drop and recreate.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_account_members(uuid);
DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
CREATE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  display_name     text,
  role             text,
  joined_at        timestamptz,
  finance_access   text,
  shopping_access  text,
  calendar_access  text,
  settings_access  text,
  ai_access        text,
  messaging_access text,
  vault_access     text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members _am
    WHERE _am.account_id = p_account_id AND _am.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      am.user_id,
      u.email::text,
      COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1))::text,
      am.role,
      am.joined_at,
      am.finance_access,
      am.shopping_access,
      am.calendar_access,
      am.settings_access,
      am.ai_access,
      am.messaging_access,
      am.vault_access
    FROM public.account_members am
    JOIN auth.users        u ON u.id = am.user_id
    LEFT JOIN public.profiles p ON p.id = am.user_id
    WHERE am.account_id = p_account_id
    ORDER BY am.joined_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- add_shopping_done_state.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: shared "done" state on shopping items
--
-- Previously the checkbox on each shopping row was pure local React state
-- ("Only visible to you").  Households expect it to be shared — when one
-- person ticks an item off, everyone else sees the strikethrough.
--
-- Adds a nullable `done_at` timestamp and a `done_by` attribution column.
-- Toggling the checkbox sets/clears `done_at`; the trash button remains the
-- way to actually remove the row from the list.
--
-- Realtime is already enabled on shopping_items (see add_shopping_and_calendar.sql),
-- so UPDATE events flow to other clients automatically.
-- =============================================================================

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- RLS — explicit UPDATE policy (existing migration only granted INSERT/SELECT/DELETE).
DROP POLICY IF EXISTS "members update shopping items" ON public.shopping_items;
DROP POLICY IF EXISTS "members update shopping items"
  ON public.shopping_items;
CREATE POLICY "members update shopping items"
  ON public.shopping_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id    = shopping_items.account_id
        AND am.user_id       = auth.uid()
        AND am.shopping_access IN ('read', 'write')
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_wiki.sql
-- ────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Migration: household wiki / manuals
--
-- A simple shared notes feature for household institutional knowledge:
--   • "How to reset the boiler"
--   • "Trash day is Tuesday morning"
--   • "Wi-Fi extender is in the upstairs hall — passphrase is in the vault"
--
-- Markdown body (plaintext stored in DB, rendered client-side via
-- react-markdown + remark-gfm with safe-by-default behavior — no raw HTML).
--
-- Permissions follow the same per-feature access column pattern as
-- shopping / calendar / vault.  Default is everyone-can-write because the
-- whole point of the feature is shared knowledge; admin can revoke per
-- member from /household if needed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. wiki_access column on account_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS wiki_access text NOT NULL DEFAULT 'write'
    CHECK (wiki_access IN ('none', 'read', 'write'));


-- -----------------------------------------------------------------------------
-- 2. wiki_pages table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wiki_pages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        text        NOT NULL DEFAULT '',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                 -- soft delete
);

CREATE INDEX IF NOT EXISTS wiki_pages_account_idx
  ON public.wiki_pages (account_id) WHERE deleted_at IS NULL;

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read wiki pages"
  ON public.wiki_pages;
CREATE POLICY "members read wiki pages"
  ON public.wiki_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access IN ('read', 'write')
    )
  );

DROP POLICY IF EXISTS "members insert wiki pages"
  ON public.wiki_pages;
CREATE POLICY "members insert wiki pages"
  ON public.wiki_pages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members update wiki pages"
  ON public.wiki_pages;
CREATE POLICY "members update wiki pages"
  ON public.wiki_pages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access = 'write'
    )
  );

DROP POLICY IF EXISTS "members delete wiki pages"
  ON public.wiki_pages;
CREATE POLICY "members delete wiki pages"
  ON public.wiki_pages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = wiki_pages.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Update get_account_members RPC to surface wiki_access
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_account_members(uuid);
DROP FUNCTION IF EXISTS public.get_account_members(p_account_id uuid) CASCADE;
CREATE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  display_name     text,
  role             text,
  joined_at        timestamptz,
  finance_access   text,
  shopping_access  text,
  calendar_access  text,
  settings_access  text,
  ai_access        text,
  messaging_access text,
  vault_access     text,
  wiki_access      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members _am
    WHERE _am.account_id = p_account_id AND _am.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      am.user_id,
      u.email::text,
      COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1))::text,
      am.role,
      am.joined_at,
      am.finance_access,
      am.shopping_access,
      am.calendar_access,
      am.settings_access,
      am.ai_access,
      am.messaging_access,
      am.vault_access,
      am.wiki_access
    FROM public.account_members am
    JOIN auth.users        u ON u.id = am.user_id
    LEFT JOIN public.profiles p ON p.id = am.user_id
    WHERE am.account_id = p_account_id
    ORDER BY am.joined_at;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- secure_invitation_email_check.sql
-- ────────────────────────────────────────────────────────────────────

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

DROP FUNCTION IF EXISTS public.accept_invitation(p_token uuid) CASCADE;
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


DROP FUNCTION IF EXISTS public.get_invitation_by_token(p_token uuid) CASCADE;
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

-- ────────────────────────────────────────────────────────────────────
-- secure_finance_access_policies.sql
-- ────────────────────────────────────────────────────────────────────

-- -----------------------------------------------------------------------------
-- Security hardening: enforce finance_access on the remaining finance tables.
--
-- Previously `budgets`, `savings_goals`, `recurring_transactions`, and
-- `categorization_rules` each shipped with a single `FOR ALL` policy that only
-- checked household membership. A `child` (or any member with
-- `finance_access = 'none'`) could read AND write all four tables. Recurring
-- transactions in particular auto-generate real `transactions` rows on a
-- schedule, fully bypassing the per-row finance_access enforcement that the
-- `transactions` table already had.
--
-- This migration replaces those FOR ALL policies with the four-policy pattern
-- already used by `transactions` and `categories` in `update_roles.sql`:
--   SELECT  → admin OR (parent AND finance_access IN ('read', 'write'))
--   INSERT  → admin OR (parent AND finance_access = 'write')
--   UPDATE  → admin OR (parent AND finance_access = 'write')
--   DELETE  → admin only
-- All policies use both USING and WITH CHECK where applicable so an authorised
-- writer can't move a row across accounts.
-- -----------------------------------------------------------------------------


-- ── budgets ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can manage their account's budgets" ON public.budgets;

DROP POLICY IF EXISTS "budgets: members can read"
  ON public.budgets;
CREATE POLICY "budgets: members can read"
  ON public.budgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = budgets.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "budgets: members can insert"
  ON public.budgets;
CREATE POLICY "budgets: members can insert"
  ON public.budgets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = budgets.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "budgets: members can update"
  ON public.budgets;
CREATE POLICY "budgets: members can update"
  ON public.budgets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = budgets.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = budgets.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "budgets: admins can delete"
  ON public.budgets;
CREATE POLICY "budgets: admins can delete"
  ON public.budgets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = budgets.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── savings_goals ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can manage their account's savings goals" ON public.savings_goals;

DROP POLICY IF EXISTS "savings_goals: members can read"
  ON public.savings_goals;
CREATE POLICY "savings_goals: members can read"
  ON public.savings_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = savings_goals.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "savings_goals: members can insert"
  ON public.savings_goals;
CREATE POLICY "savings_goals: members can insert"
  ON public.savings_goals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = savings_goals.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "savings_goals: members can update"
  ON public.savings_goals;
CREATE POLICY "savings_goals: members can update"
  ON public.savings_goals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = savings_goals.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = savings_goals.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "savings_goals: admins can delete"
  ON public.savings_goals;
CREATE POLICY "savings_goals: admins can delete"
  ON public.savings_goals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = savings_goals.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── recurring_transactions ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can manage their account's recurring transactions" ON public.recurring_transactions;

DROP POLICY IF EXISTS "recurring_transactions: members can read"
  ON public.recurring_transactions;
CREATE POLICY "recurring_transactions: members can read"
  ON public.recurring_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = recurring_transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "recurring_transactions: members can insert"
  ON public.recurring_transactions;
CREATE POLICY "recurring_transactions: members can insert"
  ON public.recurring_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = recurring_transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "recurring_transactions: members can update"
  ON public.recurring_transactions;
CREATE POLICY "recurring_transactions: members can update"
  ON public.recurring_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = recurring_transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = recurring_transactions.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "recurring_transactions: admins can delete"
  ON public.recurring_transactions;
CREATE POLICY "recurring_transactions: admins can delete"
  ON public.recurring_transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = recurring_transactions.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );


-- ── categorization_rules ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can manage their account's categorization rules" ON public.categorization_rules;

DROP POLICY IF EXISTS "categorization_rules: members can read"
  ON public.categorization_rules;
CREATE POLICY "categorization_rules: members can read"
  ON public.categorization_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categorization_rules.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access IN ('read', 'write')))
    )
  );

DROP POLICY IF EXISTS "categorization_rules: members can insert"
  ON public.categorization_rules;
CREATE POLICY "categorization_rules: members can insert"
  ON public.categorization_rules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categorization_rules.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "categorization_rules: members can update"
  ON public.categorization_rules;
CREATE POLICY "categorization_rules: members can update"
  ON public.categorization_rules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categorization_rules.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categorization_rules.account_id
        AND user_id    = auth.uid()
        AND (role = 'admin' OR (role = 'parent' AND finance_access = 'write'))
    )
  );

DROP POLICY IF EXISTS "categorization_rules: admins can delete"
  ON public.categorization_rules;
CREATE POLICY "categorization_rules: admins can delete"
  ON public.categorization_rules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = categorization_rules.account_id
        AND user_id    = auth.uid()
        AND role       = 'admin'
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- add_gocardless_requisitions.sql
-- ────────────────────────────────────────────────────────────────────

-- -----------------------------------------------------------------------------
-- GoCardless requisition ownership tracking.
--
-- The GoCardless integration uses a single shared app-level secret. Without
-- per-user ownership tracking, any authenticated Oikos user could pass another
-- user's `requisition_id` (or `gc_account_id`) to /api/gocardless/* and read
-- their bank accounts and transactions.
--
-- This table records, per requisition, which user originated it. After the
-- bank-side flow completes and /accounts resolves the discovered GoCardless
-- account IDs, those are stashed in `gc_account_ids` so /transactions can
-- verify the caller owns the requisition that owns the gc_account.
--
-- The routes use the service-role client, so RLS is for defence in depth.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gocardless_requisitions (
  requisition_id  text        PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gc_account_ids  text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gocardless_requisitions_user_idx
  ON gocardless_requisitions (user_id);

ALTER TABLE gocardless_requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gocardless_requisitions: owner can read"
  ON gocardless_requisitions;
CREATE POLICY "gocardless_requisitions: owner can read"
  ON gocardless_requisitions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "gocardless_requisitions: owner can delete"
  ON gocardless_requisitions;
CREATE POLICY "gocardless_requisitions: owner can delete"
  ON gocardless_requisitions FOR DELETE
  USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- secure_rls_hardening.sql
-- ────────────────────────────────────────────────────────────────────

-- -----------------------------------------------------------------------------
-- RLS hardening pass.
--
-- 1. messages: validate recipient_id is a household member, and enforce
--    `messaging_access` (the column existed but was never honoured).
-- 2. account_members UPDATE: add WITH CHECK pinning `account_id` so an admin
--    can't move a row across households.
-- 3. categories UPDATE: same WITH CHECK.
-- 4. notifications UPDATE: only allow `read_at` to change. Enforced via a
--    BEFORE UPDATE trigger because Postgres RLS doesn't have column-level
--    ACL on UPDATE that's expressive enough.
-- -----------------------------------------------------------------------------


-- ── messages ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "messages: members can read group and own DMs" ON public.messages;
DROP POLICY IF EXISTS "messages: members can read group and own DMs"
  ON public.messages;
CREATE POLICY "messages: members can read group and own DMs"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = messages.account_id
        AND am.user_id    = auth.uid()
        AND am.messaging_access IN ('read', 'write')
    )
    AND (
      messages.recipient_id IS NULL
      OR messages.user_id      = auth.uid()
      OR messages.recipient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages: members can insert own messages" ON public.messages;
DROP POLICY IF EXISTS "messages: members can insert own messages"
  ON public.messages;
CREATE POLICY "messages: members can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = messages.account_id
        AND am.user_id    = auth.uid()
        AND am.messaging_access = 'write'
    )
    AND (
      messages.recipient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.account_members am2
        WHERE am2.account_id = messages.account_id
          AND am2.user_id    = messages.recipient_id
      )
    )
  );


-- ── account_members ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "account_members: admins can update permissions" ON public.account_members;
DROP POLICY IF EXISTS "account_members: admins can update permissions"
  ON public.account_members;
CREATE POLICY "account_members: admins can update permissions"
  ON public.account_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

-- Reject account_id / user_id changes via trigger (RLS USING/WITH CHECK
-- can't compare OLD to NEW in policy expressions).
DROP FUNCTION IF EXISTS public.account_members_lock_identity() CASCADE;
CREATE OR REPLACE FUNCTION public.account_members_lock_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'account_id cannot be changed';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_members_lock_identity ON public.account_members;
DROP TRIGGER IF EXISTS account_members_lock_identity ON public.account_members;
CREATE TRIGGER account_members_lock_identity
  BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.account_members_lock_identity();


-- ── categories ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "categories: members can update" ON public.categories;
DROP POLICY IF EXISTS "categories: members can update"
  ON public.categories;
CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = categories.account_id
        AND am.user_id    = auth.uid()
        AND (am.role = 'admin' OR (am.role = 'parent' AND am.finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = categories.account_id
        AND am.user_id    = auth.uid()
        AND (am.role = 'admin' OR (am.role = 'parent' AND am.finance_access = 'write'))
    )
  );


-- ── notifications: only allow toggling read_at ──────────────────────────────

DROP FUNCTION IF EXISTS public.notifications_lock_immutable_columns() CASCADE;
CREATE OR REPLACE FUNCTION public.notifications_lock_immutable_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id    IS DISTINCT FROM OLD.user_id    THEN RAISE EXCEPTION 'user_id is immutable';    END IF;
  IF NEW.type       IS DISTINCT FROM OLD.type       THEN RAISE EXCEPTION 'type is immutable';       END IF;
  IF NEW.title      IS DISTINCT FROM OLD.title      THEN RAISE EXCEPTION 'title is immutable';      END IF;
  IF NEW.body       IS DISTINCT FROM OLD.body       THEN RAISE EXCEPTION 'body is immutable';       END IF;
  IF NEW.data       IS DISTINCT FROM OLD.data       THEN RAISE EXCEPTION 'data is immutable';       END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_lock_immutable_columns ON public.notifications;
DROP TRIGGER IF EXISTS notifications_lock_immutable_columns ON public.notifications;
CREATE TRIGGER notifications_lock_immutable_columns
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_lock_immutable_columns();

