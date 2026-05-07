-- =============================================================================
-- Migration: receipts on transactions
--
-- Lets users attach images / PDFs to a transaction.  Files live in a PRIVATE
-- Supabase Storage bucket (`receipts`); the app generates short-lived signed
-- URLs to render thumbnails and lightbox previews.
--
-- Path convention: `{accountId}/{transactionId}/{uuid}.{ext}`.  Storage RLS
-- uses the first path segment to enforce account membership.
--
-- The `transaction_receipts` table is the durable record (metadata + the
-- storage path); deleting a row should be paired with deleting the storage
-- object on the client.
--
-- Run in: Supabase dashboard → SQL Editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. transaction_receipts table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_receipts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid        NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id)    ON DELETE CASCADE,
  storage_path    text        NOT NULL,
  mime_type       text        NOT NULL,
  size_bytes      int         NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10 * 1024 * 1024),
  original_name   text,
  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_receipts_tx_idx
  ON public.transaction_receipts (transaction_id);

CREATE INDEX IF NOT EXISTS transaction_receipts_account_idx
  ON public.transaction_receipts (account_id);

ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;

-- Members with finance_access in ('read', 'write') can SELECT.
CREATE POLICY "members read receipts"
  ON public.transaction_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

-- Members with finance_access = 'write' can INSERT.
CREATE POLICY "members insert receipts"
  ON public.transaction_receipts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

-- Members with finance_access = 'write' can DELETE.
CREATE POLICY "members delete receipts"
  ON public.transaction_receipts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = transaction_receipts.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. Storage bucket (private)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT DO NOTHING;

-- Storage RLS: the first folder segment of `name` is the account_id.
-- Members of that account can read; members with finance_access='write' can
-- insert / update / delete.

CREATE POLICY "members read receipt files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access IN ('read', 'write')
    )
  );

CREATE POLICY "members upload receipt files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access = 'write'
    )
  );

CREATE POLICY "members delete receipt files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.user_id        = auth.uid()
        AND am.account_id::text = (storage.foldername(name))[1]
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. RPC: counts per transaction id (used by the list view to render the
--    paperclip indicator without one round-trip per row).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_receipt_counts(p_transaction_ids uuid[])
RETURNS TABLE (transaction_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.transaction_id, COUNT(*)::bigint
    FROM public.transaction_receipts r
   WHERE r.transaction_id = ANY(p_transaction_ids)
     AND EXISTS (
       SELECT 1 FROM public.account_members am
       WHERE am.account_id     = r.account_id
         AND am.user_id        = auth.uid()
         AND am.finance_access IN ('read', 'write')
     )
   GROUP BY r.transaction_id;
$$;
