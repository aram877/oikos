# Categories

Transaction categories with a single level of parent / child nesting,
seeded with sensible defaults on account creation, soft-deletable, managed
inside Settings.

## Routes

UI inside Settings: `src/app/settings/page.tsx` →
`_components/CategorySection.tsx`.

## Database

### `public.categories`
Defined in `schema.sql`. Defaults seeded by `supabase/fix_default_categories.sql`.

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `account_id` | uuid FK     | → `accounts.id` |
| `name`       | text        | non-empty |
| `parent_id`  | uuid FK?    | NULL = top-level; otherwise → another category |
| `created_at`, `deleted_at` | timestamptz | soft delete |

**Defaults seeded on signup** by `handle_new_user`:
Housing, Utilities, Food and Groceries, Transportation, Healthcare,
Entertainment, Travel, Children Expenses, Income, Transfers.

`fix_default_categories.sql` includes a backfill block so accounts created
before the defaults migration also get them.

**RLS** — Account members manage their account's categories.

## Repository — `src/db/repositories/categoryRepo.ts`

| Function | Purpose |
|----------|---------|
| `listCategories()` | Active rows; sorted top-level first then by name. |
| `getCategory(id)` | Single row or null. |
| `insertCategory({ name, parent_id })` | Create. |
| `updateCategory(id, { name?, parent_id? })` | Rename / reparent. |
| `softDeleteCategory(id)` | Sets `deleted_at`. |

Exposed on `dbClient.categories` as `list`, `get`, `insert`, `update`,
`softDelete`.

## React layer

- `src/app/settings/_components/CategorySection.tsx` — flat list with
  inline edit / delete / move modals.
- `src/app/settings/_hooks/useCategories.ts` — load + CRUD + reload.
- `src/app/settings/_utils/categoryUtils.ts` — `buildDisplayList(categories)`
  flattens the parent/child structure into rows with an `indent` flag, with
  orphans (parent soft-deleted) appearing at the end.

## How it works

1. Settings page loads categories on mount via `useCategories`.
2. `buildDisplayList` produces an indented flat list: each parent followed
   immediately by its children. Orphans (parent soft-deleted) get pushed to
   the bottom and rendered indented.
3. **Add** — pick optional parent, type name, submit → `insertCategory` →
   reload.
4. **Rename** — inline edit on a row → `updateCategory({ name })` → reload.
5. **Move** — modal picks a new parent → `updateCategory({ parent_id })` →
   reload.
6. **Delete** — disabled if the category has children. Otherwise
   `softDeleteCategory` and reload.

## Notable details

- **One level of nesting in UI.** The schema allows arbitrary nesting (any
  uuid as parent), but the component prevents grandchildren. Keep it shallow
  for sanity.
- **Soft delete only.** Old categories linger in the DB so historical
  transactions retain their label; the `category_name` join still resolves
  for read-only display.
- **Defaults seeded once.** New accounts get the 10-item set. Renaming a
  default category is just a regular update; no special flag.
- **No referential cleanup on delete.** Transactions referencing a deleted
  category still hold its `category_id`; the join produces NULL `category_name`
  on reads (acceptable, the UI shows "Uncategorized").

## Permissions

`abilities.settings` (write) gates the Settings page itself. Children with
`settings_access = 'none'` don't see this section.
