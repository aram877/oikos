-- Replace exact amount_cents match with an open range (min/max).
-- Both NULL = match any amount.  One or both can be set for < / > / range checks.

ALTER TABLE categorization_rules
  ADD COLUMN IF NOT EXISTS amount_min_cents integer,
  ADD COLUMN IF NOT EXISTS amount_max_cents integer;

-- Migrate existing exact-match rules: treat them as an exact range.
-- Guarded so re-runs (where amount_cents has already been dropped) succeed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'categorization_rules'
      AND column_name  = 'amount_cents'
  ) THEN
    EXECUTE 'UPDATE categorization_rules '
         || 'SET amount_min_cents = amount_cents, '
         || '    amount_max_cents = amount_cents '
         || 'WHERE amount_cents IS NOT NULL';
  END IF;
END $$;

ALTER TABLE categorization_rules
  DROP COLUMN IF EXISTS amount_cents;
