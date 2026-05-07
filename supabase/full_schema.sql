-- ==================================================================
-- Oikos — full database schema
-- Generated: 2026-05-07T09:16:59Z
-- Run this once in a fresh Supabase project's SQL editor.
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
ALTER TABLE public.transactions
  ADD CONSTRAINT IF NOT EXISTS transactions_account_import_hash_key
  UNIQUE (account_id, import_hash);

-- Calendar events: unique dedup constraint for ICS import.
-- NULL source_uid values (manually created events) are never equal in
-- Postgres uniqueness checks, so manual events are unaffected.
ALTER TABLE public.calendar_events
  ADD CONSTRAINT IF NOT EXISTS calendar_events_account_source_uid_key
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
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

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

-- Owners can remove anyone; any user can remove themselves.
-- Note: direct DELETE is discouraged — prefer remove_account_member() RPC
-- which is SECURITY DEFINER and bypasses the self-join RLS issue.
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

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "user reads own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "user updates own notifications" ON public.notifications;
DROP POLICY IF EXISTS "user deletes own notifications" ON public.notifications;

CREATE POLICY "user reads own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user updates own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user deletes own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

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
-- Called by: useHouseholdMembers hook
-- Returns members with their auth email (requires access to auth.users).
-- SECURITY DEFINER avoids self-referential RLS recursion on account_members.
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
-- get_invitation_by_token
-- Called by: /invite/accept page to show household name + inviter name.
-- Any authenticated user who possesses the token can call this.
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

-- -----------------------------------------------------------------------------
-- accept_invitation
-- Called by: /invite/accept page (registered users) and /auth/callback
--            (newly registered users arriving via invite link).
-- Removes the user from their current account, joins the invited account,
-- deletes the in-app invitation notification, and marks the token used.
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────

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

ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_members;


-- =============================================================================
-- 8. STORAGE — avatars bucket
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

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_import_hash_key
  UNIQUE (account_id, import_hash);

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

CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members delete shopping"
  ON public.shopping_items FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

-- ── Calendar Events policies ──────────────────────────────────────────────────

CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "members delete calendar"
  ON public.calendar_events FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM public.account_members WHERE user_id = auth.uid()
  ));


-- =============================================================================
-- 3. REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;

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

CREATE POLICY "authenticated users can read profiles"
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

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


-- ---------------------------------------------------------------------------
-- 4. Categories policies (finance — members need read for transaction forms)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "categories: members can read"   ON public.categories;
DROP POLICY IF EXISTS "categories: members can insert" ON public.categories;
DROP POLICY IF EXISTS "categories: members can update" ON public.categories;
DROP POLICY IF EXISTS "categories: members can delete" ON public.categories;

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


-- ---------------------------------------------------------------------------
-- 5. Shopping items policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members select shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members insert shopping" ON public.shopping_items;
DROP POLICY IF EXISTS "members delete shopping" ON public.shopping_items;

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


-- ---------------------------------------------------------------------------
-- 6. Calendar events policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members select calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members insert calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members update calendar" ON public.calendar_events;
DROP POLICY IF EXISTS "members delete calendar" ON public.calendar_events;

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


-- ---------------------------------------------------------------------------
-- 7. Update get_account_members RPC — add display_name + permission columns
-- ---------------------------------------------------------------------------

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

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_account_source_uid_key
  UNIQUE (account_id, source_uid);

-- ────────────────────────────────────────────────────────────────────
-- add_transfer_flag.sql
-- ────────────────────────────────────────────────────────────────────

-- Migration: add is_transfer flag to transactions
-- Run in Supabase SQL Editor on existing projects.
-- schema.sql already includes this column for fresh installs.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false;

-- Update get_monthly_summary to exclude internal transfers from income/expense totals
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
CREATE POLICY "user reads own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "user updates own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add to Realtime publication so clients get pushed updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- -----------------------------------------------------------------------------
-- 2. Trigger: create notification when an invitation is created
--    Only fires for already-registered invitees (new users have no auth.users row yet).
-- -----------------------------------------------------------------------------
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.account_members;

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

-- ────────────────────────────────────────────────────────────────────
-- update_notifications_delete.sql
-- ────────────────────────────────────────────────────────────────────

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

ALTER TABLE public.account_members
  ADD CONSTRAINT account_members_role_check
  CHECK (role IN ('admin', 'parent', 'child'));

ALTER TABLE public.account_members
  ALTER COLUMN role SET DEFAULT 'parent';

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('parent', 'child'));

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

CREATE POLICY "members select shopping"
  ON public.shopping_items FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND shopping_access IN ('read', 'write')))
  ));

CREATE POLICY "members insert shopping"
  ON public.shopping_items FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND shopping_access = 'write'))
  ));

-- Only admins can delete shopping items
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

CREATE POLICY "members select calendar"
  ON public.calendar_events FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access IN ('read', 'write')))
  ));

CREATE POLICY "members insert calendar"
  ON public.calendar_events FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access = 'write'))
  ));

CREATE POLICY "members update calendar"
  ON public.calendar_events FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM public.account_members
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR (role IN ('parent', 'child') AND calendar_access = 'write'))
  ));

-- Only admins can delete calendar events
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
CREATE POLICY "meals_select" ON meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

CREATE POLICY "meals_insert" ON meals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meals_update" ON meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meals.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

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
CREATE POLICY "meal_plan_slots_select" ON meal_plan_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND am.shopping_access <> 'none'
    )
  );

CREATE POLICY "meal_plan_slots_insert" ON meal_plan_slots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

CREATE POLICY "meal_plan_slots_update" ON meal_plan_slots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_members am
      WHERE am.account_id = meal_plan_slots.account_id
        AND am.user_id    = auth.uid()
        AND (am.shopping_access = 'write' OR am.role = 'admin')
    )
  );

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

CREATE POLICY "account members read messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "account members insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ── Phase 1b: notification trigger ───────────────────────────────────────── --

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
UPDATE categorization_rules
   SET amount_min_cents = amount_cents,
       amount_max_cents = amount_cents
 WHERE amount_cents IS NOT NULL;

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
CREATE POLICY "members read account reads"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users insert own reads"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users update own reads"
  ON public.message_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;


-- -----------------------------------------------------------------------------
-- 2. Trigger: when a user marks a conversation read, drop their unread
--    'message' notifications for that conversation.  This is what kills the
--    "old chat keeps notifying" bug.
-- -----------------------------------------------------------------------------
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
CREATE TRIGGER on_message_read
  AFTER INSERT OR UPDATE ON public.message_reads
  FOR EACH ROW EXECUTE FUNCTION public.clear_message_notifications_on_read();


-- -----------------------------------------------------------------------------
-- 3. Replace notify_members_on_message() to coalesce per (recipient, conv).
--    Also stamps `data.conversation_id` so the trigger above can target it.
-- -----------------------------------------------------------------------------
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

