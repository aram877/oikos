-- =============================================================================
-- Migration: add updated_by to calendar_events
-- Run in Supabase SQL Editor (safe to re-run — IF NOT EXISTS guard)
-- =============================================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
