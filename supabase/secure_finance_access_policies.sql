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
