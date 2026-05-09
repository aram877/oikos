-- =============================================================================
-- Migration: end-to-end encrypted household password vault
--
-- Threat model:
--   • The server (Supabase) never sees plaintext passwords / usernames /
--     notes.  All sensitive fields are encrypted client-side with AES-GCM
--     using a key derived from a household master passphrase via PBKDF2-
--     SHA256 (600k iterations, per-account random salt).
--   • Browse-only fields stay plaintext: entry name + optional url.  This
--     makes the entry list useful even before unlocking and lets us search
--     without decrypting everything.
--   • RLS: account membership + vault_access column gates SELECT/INSERT/
--     UPDATE/DELETE.  Within a member, role-level rules apply (only admins
--     bootstrap the vault row).
--
-- Encryption uses base64 in `text` columns rather than `bytea` to avoid
-- Supabase JS bytea decode/encode pain.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. New permission column on account_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS vault_access text NOT NULL DEFAULT 'none'
    CHECK (vault_access IN ('none', 'read', 'write'));

-- Backfill: admin gets write by default; everyone else stays 'none'
-- (the admin can grant access from /household).
UPDATE public.account_members SET vault_access = 'write' WHERE role = 'admin';


-- -----------------------------------------------------------------------------
-- 2. Per-account vault metadata (KDF params + verifier)
--    Verifier is a fixed plaintext encrypted with the derived key.  On
--    unlock the client decrypts it; if AES-GCM authentication fails OR the
--    plaintext doesn't match, the passphrase is wrong.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_vaults (
  account_id   uuid        PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  kdf          text        NOT NULL DEFAULT 'PBKDF2-SHA256',
  kdf_iters    int         NOT NULL DEFAULT 600000,
  salt_b64     text        NOT NULL,
  verifier_ct  text        NOT NULL,    -- base64 ciphertext
  verifier_iv  text        NOT NULL,    -- base64 12-byte IV
  setup_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read vault meta"
  ON public.password_vaults FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_vaults.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access IN ('read', 'write')
    )
  );

CREATE POLICY "admin sets up vault"
  ON public.password_vaults FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

CREATE POLICY "admin updates vault meta"
  ON public.password_vaults FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

CREATE POLICY "admin deletes vault meta"
  ON public.password_vaults FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = password_vaults.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Vault entries
--    Plaintext fields:  name (label), url (optional), updated_at, created_by.
--    Encrypted blob:    everything sensitive (username, password, totp,
--                       notes) packed into a single JSON object then
--                       AES-GCM-encrypted.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name         text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  url          text,
  ciphertext   text        NOT NULL,
  iv           text        NOT NULL,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_entries_account_idx
  ON public.password_entries (account_id);

ALTER TABLE public.password_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read entries"
  ON public.password_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access IN ('read', 'write')
    )
  );

CREATE POLICY "members insert entries"
  ON public.password_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );

CREATE POLICY "members update entries"
  ON public.password_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );

CREATE POLICY "members delete entries"
  ON public.password_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id   = password_entries.account_id
        AND am.user_id      = auth.uid()
        AND am.vault_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 4. Update get_account_members RPC to surface vault_access
--
-- Postgres won't let CREATE OR REPLACE change a function's return shape, so
-- we drop and recreate.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_account_members(uuid);
CREATE FUNCTION public.get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id          uuid,
  email            text,
  display_name     text,
  role             text,
  joined_at        timestamptz,
  finance_access   text,
  shopping_access  text,
  calendar_access  text,
  settings_access  text,
  ai_access        text,
  messaging_access text,
  vault_access     text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.account_members _am
    WHERE _am.account_id = p_account_id AND _am.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      am.user_id,
      u.email::text,
      COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1))::text,
      am.role,
      am.joined_at,
      am.finance_access,
      am.shopping_access,
      am.calendar_access,
      am.settings_access,
      am.ai_access,
      am.messaging_access,
      am.vault_access
    FROM public.account_members am
    JOIN auth.users        u ON u.id = am.user_id
    LEFT JOIN public.profiles p ON p.id = am.user_id
    WHERE am.account_id = p_account_id
    ORDER BY am.joined_at;
END;
$$;
