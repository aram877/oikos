-- Migration: add is_transfer flag to transactions
-- Run in Supabase SQL Editor on existing projects.
-- schema.sql already includes this column for fresh installs.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false;

-- Update get_monthly_summary to exclude internal transfers from income/expense totals
CREATE OR REPLACE FUNCTION public.get_monthly_summary(
  p_account_id  uuid,
  p_year_month  text    -- 'YYYY-MM'
)
RETURNS TABLE (
  category_id   uuid,
  category_name text,
  parent_id     uuid,
  income_cents  bigint,
  expense_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = p_account_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    c.id                                                                          AS category_id,
    c.name                                                                        AS category_name,
    c.parent_id                                                                   AS parent_id,
    COALESCE(SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END), 0)::bigint AS income_cents,
    COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END), 0)::bigint AS expense_cents
  FROM public.transactions t
  LEFT JOIN public.categories c
    ON c.id = t.category_id AND c.deleted_at IS NULL
  WHERE t.account_id               = p_account_id
    AND to_char(t.date, 'YYYY-MM') = p_year_month
    AND t.deleted_at               IS NULL
    AND t.is_transfer              = false
  GROUP BY c.id, c.name, c.parent_id;
END;
$$;
