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
