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
