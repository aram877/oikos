-- =============================================================================
-- Migration: household wiki / manuals
--
-- A simple shared notes feature for household institutional knowledge:
--   • "How to reset the boiler"
--   • "Trash day is Tuesday morning"
--   • "Wi-Fi extender is in the upstairs hall — passphrase is in the vault"
--
-- Markdown body (plaintext stored in DB, rendered client-side via
-- react-markdown + remark-gfm with safe-by-default behavior — no raw HTML).
--
-- Permissions follow the same per-feature access column pattern as
-- shopping / calendar / vault.  Default is everyone-can-write because the
-- whole point of the feature is shared knowledge; admin can revoke per
-- member from /household if needed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. wiki_access column on account_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS wiki_access text NOT NULL DEFAULT 'write'
    CHECK (wiki_access IN ('none', 'read', 'write'));


-- -----------------------------------------------------------------------------
-- 2. wiki_pages table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wiki_pages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        text        NOT NULL DEFAULT '',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                 -- soft delete
);

CREATE INDEX IF NOT EXISTS wiki_pages_account_idx
  ON public.wiki_pages (account_id) WHERE deleted_at IS NULL;

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read wiki pages"
  ON public.wiki_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access IN ('read', 'write')
    )
  );

CREATE POLICY "members insert wiki pages"
  ON public.wiki_pages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access = 'write'
    )
  );

CREATE POLICY "members update wiki pages"
  ON public.wiki_pages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id  = wiki_pages.account_id
        AND am.user_id     = auth.uid()
        AND am.wiki_access = 'write'
    )
  );

CREATE POLICY "members delete wiki pages"
  ON public.wiki_pages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = wiki_pages.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Update get_account_members RPC to surface wiki_access
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
  vault_access     text,
  wiki_access      text
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
      am.vault_access,
      am.wiki_access
    FROM public.account_members am
    JOIN auth.users        u ON u.id = am.user_id
    LEFT JOIN public.profiles p ON p.id = am.user_id
    WHERE am.account_id = p_account_id
    ORDER BY am.joined_at;
END;
$$;
