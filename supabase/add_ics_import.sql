-- Migration: add source_uid to calendar_events for ICS import dedup
-- Run in Supabase SQL Editor on existing projects.
-- schema.sql already includes this column for fresh installs.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_uid text;

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_account_source_uid_key
  UNIQUE (account_id, source_uid);
