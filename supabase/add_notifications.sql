-- =============================================================================
-- Migration: notifications table + invitation notification trigger
--
-- Run in: Supabase dashboard → SQL Editor
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. notifications table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,   -- 'invitation' | future types
  title      text        NOT NULL,
  body       text,
  data       jsonb,                  -- type-specific payload
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "user reads own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "user updates own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add to Realtime publication so clients get pushed updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- -----------------------------------------------------------------------------
-- 2. Trigger: create notification when an invitation is created
--    Only fires for already-registered invitees (new users have no auth.users row yet).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_invitation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitee_id   uuid;
  inviter_name text;
  acct_name    text;
BEGIN
  -- Look up the invitee by email; skip if not yet registered
  SELECT id INTO invitee_id
  FROM auth.users
  WHERE email = NEW.email
  LIMIT 1;

  IF invitee_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve inviter display name and account name
  SELECT
    COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1)),
    a.name
  INTO inviter_name, acct_name
  FROM auth.users        u
  LEFT JOIN public.profiles p ON p.id = u.id
  JOIN  public.accounts  a ON a.id = NEW.account_id
  WHERE u.id = NEW.invited_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    invitee_id,
    'invitation',
    'Household invitation',
    inviter_name || ' invited you to join ' || acct_name,
    jsonb_build_object(
      'invite_token',    NEW.token,
      'account_name',    acct_name,
      'invited_by_name', inviter_name
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_invitation_created
  AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_notification();
