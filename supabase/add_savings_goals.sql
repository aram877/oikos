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
