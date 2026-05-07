# Notifications (Bell)

Real-time in-app notifications. Two types in MVP:

- **`invitation`** — household invite for an already-registered user.
- **`message`** — incoming chat message (group or DM).

Plus a load-bearing realtime side-effect: a member who's removed from the
household is **kicked out of the app immediately** via a `DELETE` event on
`account_members`.

## Routes

The bell is rendered in the header by `src/components/HeaderNav.tsx`. There
is no standalone notifications route.

## Database

### `public.notifications`
Defined in `supabase/add_notifications.sql`. Modified by
`supabase/update_notifications_delete.sql` (DELETE policy + accept-invite
deletes the row) and `supabase/add_message_reads.sql` (message coalescing —
see [messages](./messages.md)).

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `user_id`    | uuid FK     | → `auth.users.id` (the *recipient*) |
| `type`       | text        | `'invitation' | 'message' | …` |
| `title`      | text        | shown in the dropdown |
| `body`       | text?       | one-line preview |
| `data`       | jsonb       | type-specific payload (invite_token, conversation_id, sender_id, …) |
| `read_at`    | timestamptz?| NULL = unread |
| `created_at` | timestamptz | |

**RLS** — Users can SELECT / UPDATE / DELETE only their own rows.

**Realtime publication** — yes.

## Triggers (related)

- `handle_invitation_notification` — fires after `INSERT ON invitations`;
  inserts an `invitation` row for the invitee if they're registered.
- `notify_members_on_message` — fires after `INSERT ON messages`;
  **coalesces** message notifications per conversation (see
  [messages](./messages.md) for the full mechanism).
- `clear_message_notifications_on_read` — fires after `INSERT/UPDATE ON
  message_reads`; deletes the user's unread message notifications for that
  conversation. Together with the coalesce trigger, this guarantees the bell
  has at most one entry per conversation, ever.

## Component — `src/components/NotificationBell.tsx`

- **Initial fetch**: last 30 rows for the user, ordered by `created_at` desc.
- **Realtime**: subscribes to `INSERT` / `UPDATE` / `DELETE` on
  `notifications` filtered to `user_id=eq.${userId}`.
- **Auto mark-as-read**: when the dropdown opens, every unread row gets
  `read_at = now()` in one batched UPDATE.
- **Dismiss**: per-row `×` button hard-deletes (RLS allows users to delete
  their own rows). Invitations don't show a dismiss button — they're
  removed automatically by `accept_invitation`.
- **Type-specific deeplinks**:
  - `invitation` → `/invite/accept?token=…`
  - `message` → uses `data.conversation_id` to navigate to
    `/messages/group` or `/messages/<userId>`, **and immediately calls
    `dbClient.messages.markRead(convId)`** so the bell stays consistent.
- **Unread badge**: count of `read_at IS NULL` rows; capped at "9+".
- **Account-removal kick-out**: a separate channel listens for
  `DELETE ON account_members` filtered by the current `user_id`. On hit it
  clears the cached `account_id` and `window.location.replace('/')` —
  preventing the user from continuing on stale data after an admin boots
  them.

## How it works

1. **Server emits.** Triggers / RPCs insert rows. Examples:
   - Invitation created → `handle_invitation_notification` inserts.
   - Message inserted → `notify_members_on_message` either inserts or
     coalesces.
2. **Client receives.** Realtime channel pushes the new row; the bell
   updates state and the unread badge increments.
3. **User opens the bell.** Auto-mark-as-read flips every unread row to
   read in one batched UPDATE; the badge clears.
4. **User dismisses or follows the link.** Dismiss → DELETE.
   Follow → navigate + (for messages) `markRead` so the chat side also
   clears the bell entry via the trigger.
5. **Member removal.** Admin removes → realtime DELETE on `account_members`
   → the booted user gets redirected to `/`.

## Notable details

- **Auto-mark-read is on dropdown open, not on mount.** The unread badge
  gets to do its job before being silenced.
- **Hard delete on dismiss.** No "trash bin" for notifications.
- **Coalesced message notifications.** A conversation can never produce
  more than one unread bell entry at a time — see
  [messages](./messages.md) for the trigger detail.
- **`data` is the source of truth for deeplinks.** New notification types
  should namespace their payload there (`conversation_id`, `invite_token`,
  etc.).
- **The bell is the *in-app* surface.** The push-notification feature is
  separate — see [push-notifications](./push-notifications.md).
