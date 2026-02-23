-- =============================================================================
-- Fix: ON CONFLICT requires a plain unique constraint, not a partial index
-- =============================================================================
-- PostgREST upsert with onConflict: 'account_id,import_hash' needs a full
-- unique constraint on those columns.
-- NULL values are treated as distinct in Postgres uniqueness checks, so
-- rows with import_hash = NULL (manual entries) never conflict with each other.
-- =============================================================================

DROP INDEX IF EXISTS transactions_account_import_hash_uidx;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_import_hash_key
  UNIQUE (account_id, import_hash);
