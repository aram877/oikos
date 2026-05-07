# Invitations

Email-based invitations with two flows: **magic link** for already-registered
users, and **sign-up link** for brand-new users. Acceptance copies the
invitation's role + access columns into a new `account_members` row, and
removes the user from any prior household (1 user = 1 household).

## Routes / API

| Method | Path                                                | File |
|--------|-----------------------------------------------------|------|
| client | `/invite/accept?token=…`                            | `src/app/invite/accept/page.tsx` |
| GET    | `/api/invitations`                                  | `src/app/api/invitations/route.ts` — list pending invitations for the admin's account |
| POST   | `/api/invitations`                                  | Create invitation + send email |
| DELETE | `/api/invitations?token=…`                          | Revoke a pending invitation |

## Database

### `public.invitations`
Defined in `schema.sql`; access columns added by `update_roles.sql` and
`add_settings_ai_access.sql`.

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `id`           | uuid PK     | |
| `account_id`   | uuid FK     | → `accounts.id` |
| `invited_by`   | uuid FK     | → `auth.users.id` |
| `email`        | text        | invitee's email |
| `role`         | text        | `admin` (rare) / `parent` / `child` |
| `token`        | uuid        | random; the URL slug |
| `created_at`   | timestamptz | |
| `accepted_at`  | timestamptz | NULL = pending |
| `*_access`     | text        | preset access columns copied to `account_members` on accept |

## RPCs / Triggers

- **`accept_invitation(p_token uuid)`** (`update_accept_invitation.sql`,
  extended in `update_roles.sql`, `add_settings_ai_access.sql`).
  `SECURITY DEFINER`. Steps:
  1. Find a non-accepted invitation by token.
  2. **Delete every existing `account_members` row for the calling user**
     — enforces 1-user-1-household.
  3. Insert a new membership in the invited account, copying role + access
     columns.
  4. Delete the in-app invitation notification (so the bell doesn't dangle).
  5. Mark `accepted_at = now()`.
- **`get_invitation_by_token(p_token uuid)`** — `SECURITY DEFINER`. Returns
  account name + inviter display name. Any authenticated user with the token
  can call it; the accept page uses it to render the confirmation prompt.
- **`handle_invitation_notification`** trigger (`add_notifications.sql`).
  After INSERT on `invitations`, if the invitee already has an `auth.users`
  row, inserts a `'invitation'` notification row for them so the bell lights
  up immediately. Brand-new invitees get an email instead.

## Hook — `src/app/settings/_hooks/useInvite.ts`

Used inside the household page (and Settings).

| Method | Purpose |
|--------|---------|
| `invite(email, role)` | POST `/api/invitations`. |
| `revoke(token)` | DELETE `/api/invitations?token=…`. |
| `fetchPending()` | GET `/api/invitations`. |

State holds `loading`, `error`, success feedback, and the pending list.

## React layer

- `src/app/invite/accept/page.tsx` — unauthenticated landing page. Calls
  `get_invitation_by_token`, renders the household name + inviter, warns
  the user they'll lose any prior membership, and on confirm calls
  `accept_invitation(token)`. **Hard-navigates** to `/transactions`
  afterwards to clear the cached `account_id`.
- `src/app/api/invitations/route.ts`:
  - **POST**: validates input, verifies the caller is admin, inserts an
    invitation row pre-populated with `getDefaultAccessLevels(role)`, then
    sends email via the Supabase Admin API.
    - Already-registered invitee → magic link to `/invite/accept?token=…`.
    - New invitee → sign-up link to `/auth/callback?invite_token=…`.
  - **GET**: lists pending invitations for the admin's account.
  - **DELETE**: revokes a pending row.

## How it works

1. **Admin sends an invite** from `/household` with email + role. POST
   `/api/invitations` validates, creates the row (which fires the
   `handle_invitation_notification` trigger), then dispatches the email.
2. **New user flow.** They click the email's sign-up link →
   `/auth/callback?code=…&invite_token=…`. The callback exchanges the code
   (creates the `auth.users` row) and immediately calls
   `accept_invitation(token)`. They're redirected to `/transactions`.
3. **Existing user flow.** They get a magic link to `/invite/accept?token=…`.
   The page shows "Alice invited you to join the Smith household — you'll
   leave your current household to accept", they confirm, the page calls
   `accept_invitation(token)`, and hard-navigates to `/transactions`.
4. **Pending list / revoke** — the household page lists rows where
   `accepted_at IS NULL` so the admin can revoke before they're claimed.

## Notable details

- **1 user = 1 household.** `accept_invitation` deletes the user from every
  prior membership before adding them to the new one. Acceptance is
  destructive — the warning on the accept page is real.
- **Notification cleanup** — `accept_invitation` deletes the bell entry
  (`update_notifications_delete.sql` switched the legacy "mark read" to a
  hard delete). The household admin doesn't see ghost invites either,
  because the realtime DELETE flushes the bell on their side too.
- **Already-registered detection.** The `handle_invitation_notification`
  trigger only fires the in-app notification if `auth.users.email = NEW.email`
  exists; otherwise the user gets an email-only nudge. They get the in-app
  one *after* sign-up.
- **Token in URL.** Tokens are random uuids and live in the URL — short-lived
  and not enumerable.
