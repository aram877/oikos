-- =============================================================================
-- Migration: subscription suggestion dismissals
--
-- The smart subscription detector scans the last 12 months of transactions
-- and surfaces likely subscriptions (recurring same-merchant-same-amount
-- patterns).  Users can either "Track this" (creates a subscription + match
-- pattern + bulk-links the transactions) or "Dismiss" the suggestion.
--
-- Dismissals are persisted account-wide so they don't reappear on a
-- different device or after the next login.  The fingerprint is a stable
-- hash of (normalized description + amount bucket); it's computed
-- deterministically by src/lib/subscriptionDetector.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_suggestion_dismissals (
  account_id    uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fingerprint   text        NOT NULL,
  dismissed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, fingerprint)
);

ALTER TABLE public.subscription_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read dismissals"
  ON public.subscription_suggestion_dismissals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

CREATE POLICY "members insert dismissals"
  ON public.subscription_suggestion_dismissals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

CREATE POLICY "members delete dismissals"
  ON public.subscription_suggestion_dismissals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscription_suggestion_dismissals.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );
