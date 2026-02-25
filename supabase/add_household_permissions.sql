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
