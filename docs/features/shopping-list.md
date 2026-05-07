# Shopping List

A real-time shared shopping list. Items are **hard-deleted** on check-off
(no soft delete) and synced live across every household browser via Supabase
Realtime.

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
| `created_at` | timestamptz | |

**RLS** — Account members can SELECT / INSERT / DELETE.

**Realtime publication** — yes; the hook subscribes for live updates.

## Repository — `src/db/repositories/shoppingRepo.ts`

| Function | Purpose |
|----------|---------|
| `listItems()` | All items, oldest first. |
| `insertItem({ name, quantity? })` | Create with `added_by = auth.uid()`. |
| `deleteItem(id)` | Hard delete. |

Exposed on `dbClient.shopping` as `list`, `insert`, `delete`.

## React layer

- `src/app/shopping/_hooks/useShoppingList.ts` — load + realtime subscribe;
  optimistic add / remove; 10s connection timeout with a retry button.
- `src/app/shopping/_components/AddItemForm.tsx` — name + optional quantity
  input.
- `src/app/shopping/_components/ShoppingItem.tsx` — single row with the
  member-name badge (resolved via `useMemberNames()`).

## How it works

1. **Mount.** The hook calls `listItems()` and subscribes to a realtime
   channel listening for `INSERT` and `DELETE` events on
   `shopping_items`.
2. **Add.** User submits the form → optimistic state push → `insertItem`.
   The realtime INSERT eventually reconciles (no-op if already in state).
3. **Check off.** User clicks the remove button → optimistic filter →
   `deleteItem`. Realtime DELETE replays for other devices.
4. **Sync indicator.** A small pill shows "Live" once the realtime channel
   subscribes; if it doesn't connect within 10 seconds, the pill flips to
   "Sync error — retry" and clicking re-subscribes.

## Notable details

- **Hard delete.** No undo. Once you tap the X, it's gone for everyone.
  Trade-off: simpler UX, tighter sync. The list is always "what's left to
  buy".
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
