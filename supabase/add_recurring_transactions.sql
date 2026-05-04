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
