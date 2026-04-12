-- Returns a balance breakdown for an account based on all recorded transactions.
-- cashflow_cents  = sum of non-transfer transactions (income - expenses) = net worth
-- transfers_cents = sum of transfer transactions (negative = net moved to savings)
-- balance_cents   = sum of ALL transactions (= checking account balance)
--
-- Net worth = cashflow_cents
-- Checking  = balance_cents
-- Savings   = -transfers_cents

CREATE OR REPLACE FUNCTION get_account_balance(p_account_id uuid)
RETURNS TABLE (
  cashflow_cents  bigint,
  transfers_cents bigint,
  balance_cents   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(CASE WHEN NOT is_transfer THEN amount_cents ELSE 0 END), 0) AS cashflow_cents,
    COALESCE(SUM(CASE WHEN     is_transfer THEN amount_cents ELSE 0 END), 0) AS transfers_cents,
    COALESCE(SUM(amount_cents), 0)                                           AS balance_cents
  FROM transactions
  WHERE account_id = p_account_id
    AND deleted_at IS NULL;
$$;
