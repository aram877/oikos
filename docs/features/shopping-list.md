# Shopping List

A real-time shared shopping list. **Check-off state is shared** across the
household — when one member ticks an item, everyone else sees the
strikethrough and the "Got it · Alice" attribution. The trash button
remains a separate intent for actually removing the row.

## Routes

| Path        | File                            | Purpose |
|-------------|---------------------------------|---------|
| `/shopping` | `src/app/shopping/page.tsx`     | The list with add form + per-row remove button + sync indicator. |

## Database

### `public.shopping_items`
Defined in `supabase/add_shopping_and_calendar.sql`.

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `account_id` | uuid FK     | → `accounts.id` |
| `name`       | text        | non-empty |
| `quantity`   | text?       | free-text ("2 kg", "1 dozen", …) |
| `added_by`   | uuid FK?    | → `auth.users.id` |
| `done_at`    | timestamptz? | NULL = still to-buy; non-null = checked off |
| `done_by`    | uuid FK?    | → `auth.users.id` (cleared back to NULL on uncheck) |
| `created_at` | timestamptz | |

**RLS** — Account members can SELECT / INSERT / DELETE.

**Realtime publication** — yes; the hook subscribes for live updates.

## Repository — `src/db/repositories/shoppingRepo.ts`

| Function | Purpose |
|----------|---------|
| `listItems()` | All items, oldest first. |
| `insertItem({ name, quantity? })` | Create with `added_by = auth.uid()`. |
| `setItemDone(id, done)` | Toggle the shared check-off state — sets/clears `done_at` + `done_by`. |
| `deleteItem(id)` | Hard delete (used by the trash button only). |

Exposed on `dbClient.shopping` as `list`, `insert`, `setDone`, `delete`.

## React layer

- `src/app/shopping/_hooks/useShoppingList.ts` — load + realtime subscribe;
  optimistic add / remove; 10s connection timeout with a retry button.
- `src/app/shopping/_components/AddItemForm.tsx` — name + optional quantity
  input.
- `src/app/shopping/_components/ShoppingItem.tsx` — single row with the
  member-name badge (resolved via `useMemberNames()`).

## How it works

1. **Mount.** The hook calls `listItems()` and subscribes to a realtime
   channel listening for `INSERT`, `UPDATE`, and `DELETE` events on
   `shopping_items`.
2. **Add.** User submits the form → optimistic state push → `insertItem`.
   The realtime INSERT eventually reconciles (no-op if already in state).
3. **Check off.** User ticks the checkbox → optimistic state update
   (`done_at = now`) → `setItemDone(id, true)`. Realtime UPDATE replays
   on every other household member's open page; the row re-renders with a
   strikethrough and a "Got it · {member}" attribution line. Unchecking
   clears both `done_at` and `done_by`.
4. **Remove.** Trash button → two-click confirm → `deleteItem`. Realtime
   DELETE replays for everyone.
5. **Sync indicator.** A small pill shows "Live" once the realtime channel
   subscribes; if it doesn't connect within 10 seconds, the pill flips to
   "Sync error — retry" and clicking re-subscribes.

## Notable details

- **Shared check-off state.** Ticking an item flips `done_at` for every
  member of the household via realtime — same row, same state, no
  per-user view. This was changed in May 2026 (was previously local-only,
  with a misleading "Only visible to you" hint).
- **Hard delete on the trash button.** Two-click confirm. Removing a row
  is destructive (no undo) and propagates to everyone via the DELETE
  channel.
- **Quantity is free-text.** No structured units; users write whatever.
- **`added_by`** drives the small avatar / name on each row so the household
  can see who put what on the list.
- **Optimistic UI.** Both add and remove are optimistic; the hook is
  idempotent against the realtime echo.
- **Used by [meal-plan](./meal-plan.md)** — "Add this week's ingredients to
  shopping list" diffs the unique meal ingredients against existing items
  and inserts only the missing ones.

## Permissions

`abilities.shopping`. Children typically have `write` (parents want them on
the list).
