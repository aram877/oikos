-- =============================================================================
-- Migration: message_reads (per-user-per-conversation read tracking)
--
-- Replaces the localStorage-based unread tracking with a server-side source
-- of truth.  Powers conversation-list unread badges, the nav-bar message
-- badge, and read receipts.
--
-- Also rewrites notify_members_on_message() to coalesce notifications:
--   • only one unread bell entry per (recipient, conversation) at a time
--   • opening a conversation deletes those entries automatically (via the
--     on_message_read trigger), so old chats no longer "keep notifying".
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. message_reads table
--    PK = (user_id, account_id, conversation_id)
--    conversation_id is the literal string 'group' OR a partner user_id (uuid as text)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reads (
  user_id         uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  account_id      uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id text        NOT NULL,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS message_reads_account_conv_idx
  ON public.message_reads (account_id, conversation_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Account members can read each other's read timestamps (needed for read receipts).
CREATE POLICY "members read account reads"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users insert own reads"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = message_reads.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "users update own reads"
  ON public.message_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;


-- -----------------------------------------------------------------------------
-- 2. Trigger: when a user marks a conversation read, drop their unread
--    'message' notifications for that conversation.  This is what kills the
--    "old chat keeps notifying" bug.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_message_notifications_on_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE user_id = NEW.user_id
     AND type    = 'message'
     AND (data->>'conversation_id') = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_read ON public.message_reads;
CREATE TRIGGER on_message_read
  AFTER INSERT OR UPDATE ON public.message_reads
  FOR EACH ROW EXECUTE FUNCTION public.clear_message_notifications_on_read();


-- -----------------------------------------------------------------------------
-- 3. Replace notify_members_on_message() to coalesce per (recipient, conv).
--    Also stamps `data.conversation_id` so the trigger above can target it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  conv_id     TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(NULLIF(trim(display_name), ''), 'A member')
    INTO sender_name
    FROM public.profiles
   WHERE id = NEW.user_id;

  IF NEW.recipient_id IS NULL THEN
    -- Group message
    conv_id := 'group';
    FOR m IN
      SELECT user_id FROM public.account_members
       WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
    LOOP
      DELETE FROM public.notifications
       WHERE user_id = m.user_id
         AND type    = 'message'
         AND read_at IS NULL
         AND (data->>'conversation_id') = conv_id;

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (m.user_id, 'message', sender_name, left(NEW.body, 100),
              jsonb_build_object(
                'message_id',      NEW.id,
                'sender_id',       NEW.user_id,
                'conversation_id', conv_id,
                'is_dm',           false
              ));
    END LOOP;
  ELSE
    -- DM: recipient sees this as a conversation keyed by the sender's id
    conv_id := NEW.user_id::text;
    DELETE FROM public.notifications
     WHERE user_id = NEW.recipient_id
       AND type    = 'message'
       AND read_at IS NULL
       AND (data->>'conversation_id') = conv_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_id, 'message', sender_name, left(NEW.body, 100),
            jsonb_build_object(
              'message_id',      NEW.id,
              'sender_id',       NEW.user_id,
              'conversation_id', conv_id,
              'is_dm',           true
            ));
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. RPC: total unread message count for the active user across all
--    conversations in the account.  Powers the nav-bar badge.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_message_count(p_account_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH my_reads AS (
    SELECT conversation_id, last_read_at
      FROM public.message_reads
     WHERE user_id    = auth.uid()
       AND account_id = p_account_id
  ),
  group_read AS (
    SELECT COALESCE(
             (SELECT last_read_at FROM my_reads WHERE conversation_id = 'group'),
             'epoch'::timestamptz
           ) AS ts
  )
  SELECT COUNT(*)::bigint
    FROM public.messages m
   WHERE m.account_id = p_account_id
     AND m.user_id   <> auth.uid()
     AND (
       (m.recipient_id IS NULL AND m.created_at > (SELECT ts FROM group_read))
       OR
       (m.recipient_id = auth.uid() AND m.created_at > COALESCE(
         (SELECT last_read_at FROM my_reads WHERE conversation_id = m.user_id::text),
         'epoch'::timestamptz
       ))
     );
$$;
