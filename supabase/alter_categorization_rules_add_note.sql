-- Add optional note to categorization rules.
-- When a rule matches, this note is applied to the transaction alongside the category.

ALTER TABLE categorization_rules
  ADD COLUMN IF NOT EXISTS note text;
