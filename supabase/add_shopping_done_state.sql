-- =============================================================================
-- Migration: shared "done" state on shopping items
--
-- Previously the checkbox on each shopping row was pure local React state
-- ("Only visible to you").  Households expect it to be shared — when one
-- person ticks an item off, everyone else sees the strikethrough.
--
-- Adds a nullable `done_at` timestamp and a `done_by` attribution column.
-- Toggling the checkbox sets/clears `done_at`; the trash button remains the
-- way to actually remove the row from the list.
--
-- Realtime is already enabled on shopping_items (see add_shopping_and_calendar.sql),
-- so UPDATE events flow to other clients automatically.
-- =============================================================================

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS done_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- RLS — explicit UPDATE policy (existing migration only granted INSERT/SELECT/DELETE).
DROP POLICY IF EXISTS "members update shopping items" ON public.shopping_items;
CREATE POLICY "members update shopping items"
  ON public.shopping_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id    = shopping_items.account_id
        AND am.user_id       = auth.uid()
        AND am.shopping_access IN ('read', 'write')
    )
  );
