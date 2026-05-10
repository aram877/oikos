-- -----------------------------------------------------------------------------
-- RLS hardening pass.
--
-- 1. messages: validate recipient_id is a household member, and enforce
--    `messaging_access` (the column existed but was never honoured).
-- 2. account_members UPDATE: add WITH CHECK pinning `account_id` so an admin
--    can't move a row across households.
-- 3. categories UPDATE: same WITH CHECK.
-- 4. notifications UPDATE: only allow `read_at` to change. Enforced via a
--    BEFORE UPDATE trigger because Postgres RLS doesn't have column-level
--    ACL on UPDATE that's expressive enough.
-- -----------------------------------------------------------------------------


-- ── messages ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "messages: members can read group and own DMs" ON public.messages;
CREATE POLICY "messages: members can read group and own DMs"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = messages.account_id
        AND am.user_id    = auth.uid()
        AND am.messaging_access IN ('read', 'write')
    )
    AND (
      messages.recipient_id IS NULL
      OR messages.user_id      = auth.uid()
      OR messages.recipient_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages: members can insert own messages" ON public.messages;
CREATE POLICY "messages: members can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = messages.account_id
        AND am.user_id    = auth.uid()
        AND am.messaging_access = 'write'
    )
    AND (
      messages.recipient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.account_members am2
        WHERE am2.account_id = messages.account_id
          AND am2.user_id    = messages.recipient_id
      )
    )
  );


-- ── account_members ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "account_members: admins can update permissions" ON public.account_members;
CREATE POLICY "account_members: admins can update permissions"
  ON public.account_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id
        AND am.user_id    = auth.uid()
        AND am.role       = 'admin'
    )
  );

-- Reject account_id / user_id changes via trigger (RLS USING/WITH CHECK
-- can't compare OLD to NEW in policy expressions).
CREATE OR REPLACE FUNCTION public.account_members_lock_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'account_id cannot be changed';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_members_lock_identity ON public.account_members;
CREATE TRIGGER account_members_lock_identity
  BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.account_members_lock_identity();


-- ── categories ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "categories: members can update" ON public.categories;
CREATE POLICY "categories: members can update"
  ON public.categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = categories.account_id
        AND am.user_id    = auth.uid()
        AND (am.role = 'admin' OR (am.role = 'parent' AND am.finance_access = 'write'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = categories.account_id
        AND am.user_id    = auth.uid()
        AND (am.role = 'admin' OR (am.role = 'parent' AND am.finance_access = 'write'))
    )
  );


-- ── notifications: only allow toggling read_at ──────────────────────────────

CREATE OR REPLACE FUNCTION public.notifications_lock_immutable_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id    IS DISTINCT FROM OLD.user_id    THEN RAISE EXCEPTION 'user_id is immutable';    END IF;
  IF NEW.type       IS DISTINCT FROM OLD.type       THEN RAISE EXCEPTION 'type is immutable';       END IF;
  IF NEW.title      IS DISTINCT FROM OLD.title      THEN RAISE EXCEPTION 'title is immutable';      END IF;
  IF NEW.body       IS DISTINCT FROM OLD.body       THEN RAISE EXCEPTION 'body is immutable';       END IF;
  IF NEW.data       IS DISTINCT FROM OLD.data       THEN RAISE EXCEPTION 'data is immutable';       END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_lock_immutable_columns ON public.notifications;
CREATE TRIGGER notifications_lock_immutable_columns
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_lock_immutable_columns();
