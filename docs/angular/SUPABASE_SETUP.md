# Supabase Setup

Everything you need to configure a fresh Supabase project for this app.

---

## Project Settings

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Note your `Project URL` and `anon` key from **Settings → API**
3. Note your `service_role` key (keep this server-side only — Edge Functions)

---

## Database Tables

Run this SQL in the Supabase **SQL Editor**:

```sql
-- ── Accounts ──────────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  currency   text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ── Account Members ───────────────────────────────────────────────────────────
CREATE TABLE account_members (
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'parent', 'child')),
  joined_at        timestamptz NOT NULL DEFAULT now(),
  finance_access   text NOT NULL DEFAULT 'write' CHECK (finance_access  IN ('none', 'read', 'write')),
  shopping_access  text NOT NULL DEFAULT 'write' CHECK (shopping_access IN ('none', 'read', 'write')),
  calendar_access  text NOT NULL DEFAULT 'write' CHECK (calendar_access IN ('none', 'read', 'write')),
  settings_access  text NOT NULL DEFAULT 'write' CHECK (settings_access IN ('none', 'read', 'write')),
  ai_access        text NOT NULL DEFAULT 'write' CHECK (ai_access       IN ('none', 'read', 'write')),
  PRIMARY KEY (account_id, user_id)
);

-- ── Categories ────────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX categories_account_idx ON categories(account_id);

-- ── Transactions ──────────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount_cents  integer NOT NULL,    -- negative = expense, positive = income
  currency      text NOT NULL DEFAULT 'EUR',
  date          date NOT NULL,
  description   text NOT NULL DEFAULT '',
  notes         text,
  import_hash   text,                -- FNV-1a dedup key for CSV importer
  is_transfer   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (account_id, import_hash)   -- prevents duplicate CSV imports
);
CREATE INDEX transactions_account_date_idx ON transactions(account_id, date DESC);

-- ── Shopping Items ────────────────────────────────────────────────────────────
CREATE TABLE shopping_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   text,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
  -- NO soft-delete: checked items are hard-deleted
);

-- ── Calendar Events ───────────────────────────────────────────────────────────
CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  start_date  date NOT NULL,
  end_date    date,                  -- NULL = single-day event
  all_day     boolean NOT NULL DEFAULT true,
  color       text,                  -- hex e.g. '#3b82f6'
  source_uid  text,                  -- RFC 5545 UID from ICS import (dedup key)
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (account_id, source_uid)    -- prevents duplicate ICS imports
);

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  date_of_birth date,
  avatar_url    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,          -- 'invitation' | future types
  title      text NOT NULL,
  body       text,
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Invitations ───────────────────────────────────────────────────────────────
CREATE TABLE invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invited_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('parent', 'child')),
  token           uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  finance_access  text NOT NULL DEFAULT 'write',
  shopping_access text NOT NULL DEFAULT 'write',
  calendar_access text NOT NULL DEFAULT 'write',
  settings_access text NOT NULL DEFAULT 'none',
  ai_access       text NOT NULL DEFAULT 'none',
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz
);
```

---

## RPC Functions (SECURITY DEFINER)

```sql
-- ── get_monthly_summary ───────────────────────────────────────────────────────
-- Returns income/expense grouped by category for a month. Excludes transfers.
CREATE OR REPLACE FUNCTION get_monthly_summary(p_account_id uuid, p_year_month text)
RETURNS TABLE (
  category_id   uuid,
  category_name text,
  parent_id     uuid,
  income_cents  bigint,
  expense_cents bigint
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    c.id            AS category_id,
    c.name          AS category_name,
    c.parent_id     AS parent_id,
    SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END) AS income_cents,
    SUM(CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END) AS expense_cents
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE
    t.account_id  = p_account_id
    AND t.deleted_at IS NULL
    AND t.is_transfer = false
    AND to_char(t.date, 'YYYY-MM') = p_year_month
  GROUP BY c.id, c.name, c.parent_id;
$$;

-- ── get_account_members ───────────────────────────────────────────────────────
-- Returns members with email (from auth.users) and display_name (from profiles).
-- SECURITY DEFINER avoids RLS recursion on account_members.
CREATE OR REPLACE FUNCTION get_account_members(p_account_id uuid)
RETURNS TABLE (
  user_id         uuid,
  email           text,
  display_name    text,
  role            text,
  joined_at       timestamptz,
  finance_access  text,
  shopping_access text,
  calendar_access text,
  settings_access text,
  ai_access       text
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    am.user_id,
    u.email,
    p.display_name,
    am.role,
    am.joined_at,
    am.finance_access,
    am.shopping_access,
    am.calendar_access,
    am.settings_access,
    am.ai_access
  FROM account_members am
  JOIN auth.users u ON u.id = am.user_id
  LEFT JOIN profiles p ON p.id = am.user_id
  WHERE am.account_id = p_account_id
  ORDER BY am.joined_at ASC;
$$;

-- ── get_invitation_by_token ───────────────────────────────────────────────────
-- Public (no auth needed) — returns invitation details for the accept page.
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token uuid)
RETURNS TABLE (account_name text, invited_by_name text, role text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    a.name AS account_name,
    COALESCE(p.display_name, u.email) AS invited_by_name,
    i.role
  FROM invitations i
  JOIN accounts a ON a.id = i.account_id
  JOIN auth.users u ON u.id = i.invited_by
  LEFT JOIN profiles p ON p.id = i.invited_by
  WHERE i.token = p_token AND i.accepted_at IS NULL;
$$;

-- ── accept_invitation ─────────────────────────────────────────────────────────
-- Moves the calling user into the invited household.
CREATE OR REPLACE FUNCTION accept_invitation(p_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv      invitations%ROWTYPE;
  v_old_acct uuid;
BEGIN
  SELECT * INTO v_inv FROM invitations WHERE token = p_token AND accepted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or already-accepted invitation token'; END IF;

  -- Find current account of this user
  SELECT account_id INTO v_old_acct
  FROM account_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at LIMIT 1;

  -- Remove from current account (if any)
  IF v_old_acct IS NOT NULL THEN
    DELETE FROM account_members WHERE account_id = v_old_acct AND user_id = auth.uid();
    -- Optionally clean up empty accounts here
  END IF;

  -- Join the invited account
  INSERT INTO account_members (account_id, user_id, role, joined_at,
    finance_access, shopping_access, calendar_access, settings_access, ai_access)
  VALUES (v_inv.account_id, auth.uid(), v_inv.role, now(),
    v_inv.finance_access, v_inv.shopping_access, v_inv.calendar_access,
    v_inv.settings_access, v_inv.ai_access)
  ON CONFLICT (account_id, user_id) DO NOTHING;

  -- Mark invitation accepted
  UPDATE invitations SET accepted_at = now() WHERE token = p_token;

  -- Delete in-app notification
  DELETE FROM notifications WHERE user_id = auth.uid() AND type = 'invitation'
    AND (data->>'token')::uuid = p_token;
END;
$$;

-- ── remove_account_member ─────────────────────────────────────────────────────
-- Admin-only member removal. SECURITY DEFINER to avoid RLS recursion.
CREATE OR REPLACE FUNCTION remove_account_member(p_account_id uuid, p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM account_members
    WHERE account_id = p_account_id AND user_id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  DELETE FROM account_members WHERE account_id = p_account_id AND user_id = p_member_id;
END;
$$;

-- ── get_or_create_account ─────────────────────────────────────────────────────
-- Returns the user's current account, or creates a personal one if none exists.
CREATE OR REPLACE FUNCTION get_or_create_account()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_account_id uuid;
BEGIN
  SELECT account_id INTO v_account_id
  FROM account_members WHERE user_id = auth.uid() ORDER BY joined_at LIMIT 1;

  IF v_account_id IS NULL THEN
    INSERT INTO accounts (name) VALUES ('My Household') RETURNING id INTO v_account_id;
    INSERT INTO account_members (account_id, user_id, role) VALUES (v_account_id, auth.uid(), 'admin');
  END IF;

  RETURN v_account_id;
END;
$$;
```

---

## Triggers

```sql
-- ── handle_new_user ───────────────────────────────────────────────────────────
-- Fires after a new auth user is created. Creates personal account unless they
-- have an invite_token in their metadata (invited users skip account creation).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_id uuid;
  v_invite_token text;
BEGIN
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';

  IF v_invite_token IS NULL THEN
    -- Create personal account with default categories
    INSERT INTO accounts (name) VALUES ('My Household') RETURNING id INTO v_account_id;
    INSERT INTO account_members (account_id, user_id, role) VALUES (v_account_id, NEW.id, 'admin');

    -- Insert default top-level categories
    INSERT INTO categories (account_id, name) VALUES
      (v_account_id, 'Housing'),
      (v_account_id, 'Food & Groceries'),
      (v_account_id, 'Transport'),
      (v_account_id, 'Health'),
      (v_account_id, 'Entertainment'),
      (v_account_id, 'Shopping'),
      (v_account_id, 'Utilities'),
      (v_account_id, 'Savings'),
      (v_account_id, 'Income'),
      (v_account_id, 'Other');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── handle_invitation_notification ───────────────────────────────────────────
-- Fires after invitation INSERT. Creates in-app notification if invitee is already registered.
CREATE OR REPLACE FUNCTION handle_invitation_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invitee_id   uuid;
  v_account_name text;
  v_inviter_name text;
BEGIN
  SELECT id INTO v_invitee_id FROM auth.users WHERE email = NEW.email;

  IF v_invitee_id IS NOT NULL THEN
    SELECT name INTO v_account_name FROM accounts WHERE id = NEW.account_id;
    SELECT COALESCE(p.display_name, u.email) INTO v_inviter_name
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = NEW.invited_by;

    INSERT INTO notifications (user_id, type, title, body, data) VALUES (
      v_invitee_id,
      'invitation',
      'Household invitation',
      v_inviter_name || ' invited you to join ' || v_account_name,
      jsonb_build_object('token', NEW.token, 'account_name', v_account_name, 'invited_by', v_inviter_name)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_invitation_created
  AFTER INSERT ON invitations
  FOR EACH ROW EXECUTE FUNCTION handle_invitation_notification();
```

---

## Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations       ENABLE ROW LEVEL SECURITY;

-- ── accounts ──────────────────────────────────────────────────────────────────
CREATE POLICY "members can read their account" ON accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = id AND user_id = auth.uid()));

-- ── account_members ───────────────────────────────────────────────────────────
-- (Most reads happen via SECURITY DEFINER RPC to avoid recursion)
CREATE POLICY "users can read own membership" ON account_members FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "admins can update member permissions" ON account_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM account_members am2 WHERE am2.account_id = account_id AND am2.user_id = auth.uid() AND am2.role = 'admin'));
CREATE POLICY "users can delete own membership" ON account_members FOR DELETE
  USING (user_id = auth.uid());

-- ── categories ────────────────────────────────────────────────────────────────
CREATE POLICY "members with finance access can read categories" ON categories FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = categories.account_id AND user_id = auth.uid() AND finance_access IN ('read', 'write')));
CREATE POLICY "members with finance write can insert categories" ON categories FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM account_members WHERE account_id = categories.account_id AND user_id = auth.uid() AND finance_access = 'write'));
CREATE POLICY "members with finance write can update categories" ON categories FOR UPDATE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = categories.account_id AND user_id = auth.uid() AND finance_access = 'write'));

-- ── transactions ──────────────────────────────────────────────────────────────
CREATE POLICY "members with finance access can read transactions" ON transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = transactions.account_id AND user_id = auth.uid() AND finance_access IN ('read', 'write')));
CREATE POLICY "members with finance write can insert transactions" ON transactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM account_members WHERE account_id = transactions.account_id AND user_id = auth.uid() AND finance_access = 'write'));
CREATE POLICY "members with finance write can update transactions" ON transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = transactions.account_id AND user_id = auth.uid() AND finance_access = 'write'));
CREATE POLICY "admins can delete transactions" ON transactions FOR DELETE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = transactions.account_id AND user_id = auth.uid() AND role = 'admin'));

-- ── shopping_items ────────────────────────────────────────────────────────────
CREATE POLICY "members with shopping access can read" ON shopping_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = shopping_items.account_id AND user_id = auth.uid() AND shopping_access IN ('read', 'write')));
CREATE POLICY "members with shopping write can insert" ON shopping_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM account_members WHERE account_id = shopping_items.account_id AND user_id = auth.uid() AND shopping_access = 'write'));
CREATE POLICY "members with shopping write can delete" ON shopping_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = shopping_items.account_id AND user_id = auth.uid() AND shopping_access = 'write'));

-- ── calendar_events ───────────────────────────────────────────────────────────
CREATE POLICY "members with calendar access can read" ON calendar_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = calendar_events.account_id AND user_id = auth.uid() AND calendar_access IN ('read', 'write')));
CREATE POLICY "members with calendar write can insert" ON calendar_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM account_members WHERE account_id = calendar_events.account_id AND user_id = auth.uid() AND calendar_access = 'write'));
CREATE POLICY "members with calendar write can update" ON calendar_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = calendar_events.account_id AND user_id = auth.uid() AND calendar_access = 'write'));
CREATE POLICY "admins can delete calendar events" ON calendar_events FOR DELETE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = calendar_events.account_id AND user_id = auth.uid() AND role = 'admin'));

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE POLICY "authenticated users can read any profile" ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "users can insert own profile" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "users can update own profile" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE POLICY "users can read own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "users can update own notifications" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "users can delete own notifications" ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- ── invitations ───────────────────────────────────────────────────────────────
CREATE POLICY "admins can read invitations" ON invitations FOR SELECT
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = invitations.account_id AND user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admins can insert invitations" ON invitations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM account_members WHERE account_id = invitations.account_id AND user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admins can delete invitations" ON invitations FOR DELETE
  USING (EXISTS (SELECT 1 FROM account_members WHERE account_id = invitations.account_id AND user_id = auth.uid() AND role = 'admin'));
```

---

## Realtime

Enable realtime on the tables that need live sync:

```sql
-- In Supabase Dashboard: Database → Replication → supabase_realtime
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE account_members;
```

---

## Storage

```
Bucket name: avatars
Public: true

Policies (SQL):
```

```sql
-- Public read
CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Users can upload/update their own avatar
CREATE POLICY "users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Avatar path structure: `{user_id}/avatar` (no file extension — overwrite on update)

---

## Auth Settings

In Supabase Dashboard → **Authentication → URL Configuration**:
- Site URL: `http://localhost:4200` (dev) or your prod domain
- Redirect URLs: add `http://localhost:4200/auth/callback`

In **Authentication → Email Templates**: customize the invitation email template if desired.
