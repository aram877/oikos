-- =============================================================================
-- Migration: subscription tracker
--
-- Tracks recurring household subscriptions (Netflix, Spotify, gym, …) and
-- links real transactions to them — even when the bank description doesn't
-- name the service (e.g. APPLE.COM/BILL aggregating multiple subscriptions).
--
-- Two tables:
--   • subscriptions — the service itself (name, cadence, expected amount, …)
--   • subscription_match_patterns — one or more matchers per subscription
--     (description-contains + optional amount range), so an aggregator like
--     APPLE.COM/BILL can be narrowed by amount to disambiguate.
--
-- Plus a nullable transactions.subscription_id so a transaction can be
-- explicitly linked, regardless of patterns.
--
-- Run in: Supabase dashboard → SQL Editor.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid        NOT NULL REFERENCES public.accounts(id)   ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 120),
  vendor                text,
  category_id           uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  expected_amount_cents int,                       -- typical cost (signed; negative for expense)
  cadence               text        NOT NULL CHECK (cadence IN ('weekly','biweekly','monthly','quarterly','yearly')),
  notes                 text,
  started_on            date,
  cancelled_on          date,                      -- NULL = active
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz                -- soft delete
);

CREATE INDEX IF NOT EXISTS subscriptions_account_idx
  ON public.subscriptions (account_id) WHERE deleted_at IS NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read subscriptions"
  ON public.subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

CREATE POLICY "members write subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

CREATE POLICY "members update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id     = subscriptions.account_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. subscription_match_patterns
--    description_contains is a case-insensitive substring; amount_min/max
--    are optional bounds on |tx.amount_cents|.  First match wins (most-
--    specific is favoured by the matcher's ranking — see subscriptionMatcher.ts).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_match_patterns (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      uuid        NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  description_contains text        NOT NULL CHECK (char_length(description_contains) > 0),
  amount_min_cents     int,
  amount_max_cents     int,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_match_patterns_sub_idx
  ON public.subscription_match_patterns (subscription_id);

ALTER TABLE public.subscription_match_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read patterns"
  ON public.subscription_match_patterns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access IN ('read', 'write')
    )
  );

CREATE POLICY "members write patterns"
  ON public.subscription_match_patterns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );

CREATE POLICY "members delete patterns"
  ON public.subscription_match_patterns FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.account_members am ON am.account_id = s.account_id
      WHERE s.id              = subscription_match_patterns.subscription_id
        AND am.user_id        = auth.uid()
        AND am.finance_access = 'write'
    )
  );


-- -----------------------------------------------------------------------------
-- 3. transactions.subscription_id  (nullable explicit link)
--    A transaction can be assigned to a subscription either by the matcher
--    or manually by the user.  Manual link wins.
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS subscription_id uuid
    REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_subscription_idx
  ON public.transactions (subscription_id) WHERE deleted_at IS NULL;


-- -----------------------------------------------------------------------------
-- 4. RPC: spend rollups per subscription over a date window.
--    Powers the list page's "monthly cost" column without N+1 queries.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_subscription_spend(
  p_account_id uuid,
  p_start_date date,
  p_end_date   date
)
RETURNS TABLE (
  subscription_id uuid,
  total_cents     bigint,
  charge_count    bigint,
  last_charged_on date
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.subscription_id,
    SUM(ABS(t.amount_cents))::bigint AS total_cents,
    COUNT(*)::bigint                  AS charge_count,
    MAX(t.date)                       AS last_charged_on
    FROM public.transactions t
   WHERE t.account_id      = p_account_id
     AND t.subscription_id IS NOT NULL
     AND t.deleted_at      IS NULL
     AND t.date >= p_start_date
     AND t.date <  p_end_date
     AND EXISTS (
       SELECT 1 FROM public.account_members am
       WHERE am.account_id     = p_account_id
         AND am.user_id        = auth.uid()
         AND am.finance_access IN ('read', 'write')
     )
   GROUP BY t.subscription_id;
$$;
