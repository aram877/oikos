-- -----------------------------------------------------------------------------
-- GoCardless requisition ownership tracking.
--
-- The GoCardless integration uses a single shared app-level secret. Without
-- per-user ownership tracking, any authenticated Oikos user could pass another
-- user's `requisition_id` (or `gc_account_id`) to /api/gocardless/* and read
-- their bank accounts and transactions.
--
-- This table records, per requisition, which user originated it. After the
-- bank-side flow completes and /accounts resolves the discovered GoCardless
-- account IDs, those are stashed in `gc_account_ids` so /transactions can
-- verify the caller owns the requisition that owns the gc_account.
--
-- The routes use the service-role client, so RLS is for defence in depth.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gocardless_requisitions (
  requisition_id  text        PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gc_account_ids  text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gocardless_requisitions_user_idx
  ON gocardless_requisitions (user_id);

ALTER TABLE gocardless_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gocardless_requisitions: owner can read"
  ON gocardless_requisitions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "gocardless_requisitions: owner can delete"
  ON gocardless_requisitions FOR DELETE
  USING (user_id = auth.uid());
