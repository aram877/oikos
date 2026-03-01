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
