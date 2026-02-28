-- =============================================================================
-- Migration: add account_members to Realtime publication
--
-- Run in: Supabase dashboard → SQL Editor
--
-- This enables clients to receive real-time DELETE events when a member is
-- removed from a household, so their UI can immediately redirect them out
-- rather than showing stale data.
--
-- RLS still applies: each user only receives events for their own rows
-- (enforced by the existing "account_members: read own rows" policy).
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.account_members;
