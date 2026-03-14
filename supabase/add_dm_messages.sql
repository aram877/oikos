-- Migration: add DM support to messages
-- Run this in the Supabase SQL editor before deploying the app update.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS: members can read group messages and their own DMs
DROP POLICY IF EXISTS "account members read messages"                ON public.messages;
DROP POLICY IF EXISTS "messages: members can read group and own DMs" ON public.messages;
CREATE POLICY "messages: members can read group and own DMs"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
    AND (
      messages.recipient_id IS NULL
      OR messages.user_id      = auth.uid()
      OR messages.recipient_id = auth.uid()
    )
  );

-- Update RLS: members can insert their own messages (group or DM)
-- Note: no recipient membership check needed — the SELECT policy enforces DM visibility
DROP POLICY IF EXISTS "account members insert own messages"       ON public.messages;
DROP POLICY IF EXISTS "messages: members can insert own messages" ON public.messages;
CREATE POLICY "messages: members can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

-- Replace trigger function to handle both group and DM notifications
-- (The trigger itself is unchanged — it already calls this function by name)
CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(display_name, 'A member') INTO sender_name
  FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.recipient_id IS NULL THEN
    -- Group message: notify all other members
    FOR m IN
      SELECT user_id FROM public.account_members
      WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (m.user_id, 'message', sender_name, left(NEW.body, 100),
        jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id, 'is_dm', false));
    END LOOP;
  ELSE
    -- DM: notify only the recipient
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_id, 'message', sender_name, left(NEW.body, 100),
      jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id, 'is_dm', true));
  END IF;

  RETURN NEW;
END;
$$;
