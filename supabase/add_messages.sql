-- ── Phase 1a: messages table ─────────────────────────────────────────────── --

CREATE TABLE IF NOT EXISTS public.messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account members read messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "account members insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.account_members
      WHERE account_id = messages.account_id AND user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ── Phase 1b: notification trigger ───────────────────────────────────────── --

CREATE OR REPLACE FUNCTION public.notify_members_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  m           RECORD;
BEGIN
  SELECT COALESCE(display_name, 'A member') INTO sender_name
  FROM public.profiles WHERE id = NEW.user_id;

  FOR m IN
    SELECT user_id FROM public.account_members
    WHERE account_id = NEW.account_id AND user_id <> NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      m.user_id, 'message',
      sender_name,
      left(NEW.body, 100),
      jsonb_build_object('message_id', NEW.id, 'sender_id', NEW.user_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_members_on_message();

-- ── Phase 1c: messaging_access column ────────────────────────────────────── --

ALTER TABLE public.account_members
  ADD COLUMN IF NOT EXISTS messaging_access text NOT NULL DEFAULT 'write'
    CHECK (messaging_access IN ('none', 'read', 'write'));
