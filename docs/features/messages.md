# Messages — Group chat + DMs

Real-time household messaging with iMessage-style bubble grouping, server-side
read tracking, and read receipts. One **group chat** (visible to every account
member) plus **1-to-1 DMs** between any two members.

## Routes

| Path                  | File                                  | Purpose |
|-----------------------|---------------------------------------|---------|
| `/messages`           | `src/app/messages/page.tsx`           | Conversation list (group + every other member) |
| `/messages/group`     | `src/app/messages/group/page.tsx`     | Group chat |
| `/messages/[userId]`  | `src/app/messages/[userId]/page.tsx`  | DM with one partner; partner's id is the slug |

## Tech & libraries

- **Supabase Realtime** — Postgres `INSERT` / `UPDATE` / `DELETE` events on
  `messages`, `message_reads`, and `notifications` are streamed to the browser
  through Supabase's WebSocket channel.
- **React 19** — bubble enter animations via `tw-animate-css`
  (`animate-in fade-in slide-in-from-bottom-1 duration-200`).
- **Tailwind v4** — all styling, no styled-components.
- **No client state library** — local `useState` + a couple of refs is enough.

## Database

### `public.messages`
Defined in `supabase/add_messages.sql`, extended in `supabase/add_dm_messages.sql`.

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `id`           | uuid PK     | `gen_random_uuid()` |
| `account_id`   | uuid FK     | → `accounts.id`, cascade on delete |
| `user_id`      | uuid FK     | → `auth.users.id`, sender |
| `recipient_id` | uuid FK?    | NULL = group message; otherwise → `auth.users.id` |
| `body`         | text        | CHECK 1..2000 chars |
| `created_at`   | timestamptz | default `now()` |

**RLS** — members of the account can SELECT group messages and DMs they sent
or received. Members can INSERT messages they author. Realtime publication
includes the table.

### `public.message_reads` (added 2026-05-04)
Defined in `supabase/add_message_reads.sql`. Replaces the old
`localStorage`-based unread tracking with a server-side source of truth that
also powers read receipts.

| Column            | Type        | Notes |
|-------------------|-------------|-------|
| `user_id`         | uuid FK     | PK part 1 |
| `account_id`      | uuid FK     | PK part 2 |
| `conversation_id` | text        | PK part 3 — `'group'` OR a partner user id |
| `last_read_at`    | timestamptz | default `now()` |

**RLS**
- Account members can SELECT every member's read rows (needed for read
  receipts).
- Users can INSERT/UPDATE only their own row.

**Realtime publication** — yes; the client subscribes for live receipts.

### `public.notifications` (the bell)
Defined in `supabase/add_notifications.sql`, modified by
`supabase/update_notifications_delete.sql` and again by
`supabase/add_message_reads.sql`. Message-type rows now carry a
`data.conversation_id` field so they can be cleaned up on chat-open.

## Triggers / RPCs

- **`notify_members_on_message`** (`AFTER INSERT ON messages`)
  — Coalesces: deletes the recipient's existing unread `type='message'`
  notification for that conversation, then inserts a fresh one. Result: one
  bell entry per `(recipient, conversation)` at any time, regardless of how
  many messages the sender fires off.
- **`clear_message_notifications_on_read`** (`AFTER INSERT OR UPDATE ON message_reads`)
  — When a user marks a conversation read, deletes their unread message-type
  notification rows for that conversation. Kills the "old chats keep
  notifying" issue.
- **`get_unread_message_count(p_account_id uuid) → bigint`**
  — Server-side aggregate of unread messages across all conversations for the
  current user. Powers the nav-bar badge.

## Repository — `src/db/repositories/messagesRepo.ts`

| Function | Purpose |
|----------|---------|
| `listMessages({ recipientId, limit })` | Load messages for one conversation (group if `recipientId === null`). |
| `insertMessage({ body, recipient_id })` | Insert a new message; returns the row (used for the optimistic-update reconcile). |
| `listConversationPreviews(partnerIds)` | Last message for the group chat + each DM partner. |
| `markConversationRead(conversationId)` | Upsert `message_reads`; trigger drops bell entries. |
| `listAccountReads()` | All read rows for the account — used for read receipts. |
| `getMyLastRead(conversationId)` | Single-conversation read timestamp; epoch if never read. |
| `getUnreadMessageCount()` | Calls the RPC for the nav badge. |

Exposed on `dbClient.messages` in `src/db/db.client.ts` as `list`, `insert`,
`previews`, `markRead`, `listReads`, `myLastRead`, `unreadCount`.

## Hooks

### `useMessages(conversationId)` — `src/app/messages/_hooks/useMessages.ts`
Drives a single conversation.

- Loads history + the account-wide read map in parallel.
- Subscribes to two realtime channels: one for `messages` INSERTs (filtered
  client-side to the current conversation), one for `message_reads` events
  (powers live read receipts).
- Marks the conversation read on mount, on every incoming message while the
  tab is visible, and on each successful send.
- Re-marks on `visibilitychange` so coming back from another tab clears the
  bell.
- Returns:
  - `messages`, `status`, `error`
  - `rtStatus` (connecting | connected | error), `reconnectKey`, `reconnect()`
  - `currentUserId`
  - `partnerReadAt` (DM only) — for read receipts under your last bubble
  - `groupReads` — `{ user_id → last_read_at }` for the group chat
  - `send(body)` — optimistic insert with rollback on failure

### `useConversationList()` — `src/app/messages/_hooks/useConversationList.ts`
Drives the inbox.

- Pulls the member list (via `useMemberProfiles`), then fetches previews +
  the account read map in parallel.
- Computes per-conversation `unreadCount`. Cheap optimisation: if the last
  message is mine or already read, count = 0 (no extra round-trip). For
  conversations that *might* have unread, fires one targeted COUNT query.
- Realtime: reloads on any `messages` INSERT or `message_reads` change so
  unread badges update live across the app.
- Sort order: most recent first; conversations with no messages fall to the
  bottom; group chat is the default for empty inbox.

## Components

| File | Role |
|------|------|
| `_components/Avatar.tsx` | Gradient-fallback avatar (8-color palette hashed by `user_id`); plus `GroupAvatar`. |
| `_components/ConnectionPill.tsx` | Tiny realtime status pill — hidden when connected, "Connecting" with pulsing dot, or "Reconnect" button on error. |
| `_components/ConversationRow.tsx` | Inbox row with unread count badge, "You: …" prefix on own last message, primary-tinted timestamp when unread. |
| `_components/MessageBubble.tsx` | Single bubble with `position` (`single`/`first`/`middle`/`last`) for grouping-aware corner radii, hover-tooltip with full timestamp, optional read-receipt slot. |
| `_components/MessageList.tsx` | Computes grouping (same sender within 4 min on the same day = one run), renders day separators, auto-scroll behavior, scroll-to-latest pill, and the receipt under the last own bubble. |
| `_components/MessageInput.tsx` | Pill-rail textarea with auto-resize (max 140px), send button with disabled/active states, focus ring. |

## How it works

1. **Inbox load** — `useConversationList` fetches `previews` (last message per
   conversation) + `listReads()` (the user's own read map). For each
   conversation it computes `unreadCount` from `lastReadAt` vs the last
   message's `created_at`. If a conversation might have unread, it issues a
   single COUNT query with `gt('created_at', lastReadAt)` to refine.

2. **Open a conversation** — page mounts → `useMessages(id)` runs:
   - Loads message history (oldest first, capped at 200).
   - Loads `message_reads` for the account.
   - Subscribes to `messages` and `message_reads` realtime channels.
   - Calls `markConversationRead(id)` immediately. The DB trigger drops the
     bell rows for that conversation.

3. **Send a message** — `send(body)` inserts an optimistic bubble (`id`
   prefixed `optimistic-…`), then awaits the actual insert. On success the
   row is reconciled by id; on failure the optimistic bubble is removed and
   the input re-enabled. Sending also re-marks the conversation read.

4. **Receive a message** — Realtime payload arrives. `useMessages` filters
   by conversation client-side (same `recipient_id` rules), appends if not
   already present (idempotent against the optimistic ack), and re-marks
   read if the tab is visible.

5. **Read receipts** — When the partner upserts their `message_reads` row,
   the realtime channel pushes an event. The hook updates `partnerReadAt` (or
   the `groupReads` map). The list renders `Sent` / `Read · N` under the last
   own message based on whether the partner's `last_read_at >= msg.created_at`.

6. **Notification cleanup** — Two paths keep the bell honest:
   - On chat open / message arrival → `markConversationRead` fires the
     `clear_message_notifications_on_read` trigger.
   - On every new message INSERT → the `notify_members_on_message` trigger
     deletes any prior unread message notifications for the same
     `(recipient, conversation)` before inserting the new one.
   So at any point, each conversation contributes at most one bell entry per
   recipient.

7. **Nav badge** — `MessagesNavBadge` calls
   `dbClient.messages.unreadCount()` (the RPC) on mount and on every
   `messages` INSERT or `message_reads` change.

## Time formatting — `src/lib/messageTime.ts`

| Function | Output |
|----------|--------|
| `bubbleTime(iso)` | `"10:42"`, `"Yesterday 10:42"`, `"Mon 10:42"`, `"Mar 14"` (in-bubble) |
| `dayLabel(iso)` | `"Today"` / `"Yesterday"` / `"Friday"` / `"March 14"` (separator) |
| `listTime(iso)` | Inbox right-side timestamp |
| `fullTimestamp(iso)` | Hover tooltip on bubbles |
| `isActiveNow(iso, threshold=2min)` | Presence dot |
| `lastSeenLabel(iso)` | `"Active now"` / `"Active 5m ago"` / `"Last seen Mon"` |

## Permissions

`account_members.messaging_access` (none / read / write) gates the feature in
`src/lib/abilities.ts`. The header nav links and pages should hide / disable
based on `useAbilities().messaging`.

## Notable details

- **No localStorage anywhere.** All read state is server-side; works across
  devices, survives cache clears, and the bell stays consistent.
- **Optimistic IDs** are detected by the `optimistic-` prefix. They show
  `Sending…` instead of a timestamp and a `opacity-70` bubble.
- **Bubble grouping window** is 4 minutes (`GROUP_GAP_MS` in
  `MessageList.tsx`). Same sender within that window on the same day collapses
  into one run; the avatar/name only render on the last bubble; corner radii
  shrink on the run-internal sides for the iMessage stack effect.
- **Message body limit**: 2000 chars (DB CHECK).
- **Connection pill** is invisible on the happy path. Premium chat apps don't
  shout "Live!"; they only surface state when something's wrong.

## Bootstrap (fresh project)

Apply migrations in chronological order from `supabase/build_full_schema.sh`,
or paste `supabase/full_schema.sql` into a blank Supabase SQL editor. Order
matters: `add_messages.sql` → `add_dm_messages.sql` → `add_message_reads.sql`.
