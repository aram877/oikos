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
