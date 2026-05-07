# Household Members & Permissions

Multi-user access to one shared account. Each member has a **role**
(`admin` / `parent` / `child`) — a hard ceiling on what they can do — plus
five **per-feature access columns** (`none` / `read` / `write`) that fine-tune
within that ceiling.

## Routes

| Path         | File                              | Purpose |
|--------------|-----------------------------------|---------|
| `/household` | `src/app/household/page.tsx`      | Member list with role badges; admin sees per-feature radios per member; pending invitations + invite form. |

## Database

### `public.account_members`
Defined in `schema.sql`. Access columns added by `add_household_permissions.sql`,
`add_settings_ai_access.sql`, and the messaging access added by
`add_messages.sql`. Roles redesigned by `update_roles.sql`.

| Column            | Type / values | Notes |
|-------------------|---------------|-------|
| `account_id`      | uuid FK       | → `accounts.id` (cascade) |
| `user_id`         | uuid FK       | → `auth.users.id` (cascade) |
| `role`            | `'admin' | 'parent' | 'child'` | role ceiling |
| `joined_at`       | timestamptz   | |
| `finance_access`  | `'none' | 'read' | 'write'` | |
| `shopping_access` | `'none' | 'read' | 'write'` | |
| `calendar_access` | `'none' | 'read' | 'write'` | |
| `settings_access` | `'none' | 'read' | 'write'` | |
| `ai_access`       | `'none' | 'read' | 'write'` | |
| `messaging_access`| `'none' | 'read' | 'write'` | |

PK `(account_id, user_id)`.

### Realtime
The table is in the realtime publication
(`supabase/add_account_members_realtime.sql`). The `NotificationBell`
subscribes to `DELETE` events on this table for the current user — if the
admin removes the user, they get instantly redirected to `/`.

## RPCs

- **`get_or_create_account()`** — `SECURITY DEFINER`. Bootstrap on first
  login: creates an account, an admin membership for the user with full
  access, and seeds default categories.
- **`get_account_members(p_account_id uuid)`** — `SECURITY DEFINER`. Returns
  all members joined with `auth.users.email` and `profiles.display_name`.
  Bypasses RLS (which is intentionally simple — see "Notable details").
- **`remove_account_member(p_account_id uuid, p_member_id uuid)`** —
  `SECURITY DEFINER`. Admin-only; refuses to delete the admin (would orphan
  the account).

## Library — `src/lib/abilities.ts`

The single source of truth for "can user X do Y in feature Z?".

- **Role ceilings**: hard-coded matrix that says, for example, a `child`
  can never *write* finance, regardless of their access column. An `admin`
  bypasses access columns entirely.
- **Access columns**: applied within the ceiling. A parent with
  `finance_access = 'read'` can see but not edit transactions.
- **Delete is admin-only** for every feature, regardless of access columns.
- `getDefaultAccessLevels(role)` returns sensible defaults used by the
  invitation flow.

`src/lib/abilities.test.ts` has thorough coverage of the ceiling × access
matrix.

## Hook — `src/hooks/useAbilities.ts`

Loads the current user's `account_members` row and returns a typed map
`{ finance: 'none'|'read'|'write', shopping: …, calendar: …, settings: …,
ai: …, messaging: …, role, can(feature, action) }`. Used everywhere the UI
needs to gate.

## React layer

- `src/app/household/_hooks/useHouseholdMembers.ts` — calls the
  `get_account_members` RPC; returns `{ members, updatePermissions, removeMember }`.
  Uses optimistic state updates.
- `src/app/household/page.tsx`:
  - **Admin view**: `AdminMemberCard` per member with five `AccessRadio`
    components (one per feature). Each click optimistically updates the
    state and calls `dbClient.accounts.updateMemberPermissions`.
  - **Non-admin view**: read-only list of member cards.
  - Pending invitations list (with revoke) — see
    [invitations](./invitations.md).
  - Inline invite form (admin only).

## How it works

1. **Bootstrap.** On first login, `get_or_create_account()` creates the
   account, makes the user the admin with full access, and seeds default
   categories. Subsequent logins resolve the membership directly.
2. **Display.** The page calls `get_account_members(p_account_id)` (the
   `SECURITY DEFINER` RPC) to read every member with their email + display
   name + access columns.
3. **Edit a permission.** Admin clicks an `AccessRadio` → optimistic state
   update → `dbClient.accounts.updateMemberPermissions(userId, partial)`
   issues an `UPDATE` against `account_members` with RLS allowing only
   admins.
4. **Removing a member.** Admin clicks the trash icon → confirms →
   `remove_account_member(account_id, member_id)` deletes the row inside the
   RPC. The realtime subscription on the affected member's browser fires the
   `DELETE` event → their `NotificationBell` `clearAccountCache()`s and
   redirects to `/`.
5. **Permission gating in the UI.** Every page that mutates data calls
   `useAbilities()` to gate buttons / forms. The same checks are enforced at
   the DB layer via RLS.

## Notable details

- **RLS recursion fix** (`fix_rls_recursion.sql`). The original
  `account_members` SELECT policy was `WHERE account_id IN (SELECT account_id
  FROM account_members WHERE user_id = auth.uid())` — infinite recursion.
  Fixed by simplifying SELECT to `user_id = auth.uid()`. To list **all**
  members of an account the app uses the `get_account_members` RPC instead.
- **Ambiguous user_id fix** (`fix_get_account_members_ambiguous_user_id.sql`).
  The RPC's `RETURNS TABLE (... user_id uuid ...)` shadowed the table's
  `user_id` column inside the body's `EXISTS` guard. Aliasing the table as
  `_am` and qualifying every reference unambiguously fixes it.
- **Account-removal kick-out.** Realtime DELETE on `account_members`
  immediately redirects the booted user — UX-sensitive and security-relevant
  (their cached `account_id` becomes invalid).
- **Default access matrix** (`getDefaultAccessLevels`):
  - admin → `write` everywhere.
  - parent → `write` finance / shopping / calendar / messaging; `none` settings / ai.
  - child → `none` finance; `write` shopping / calendar / messaging; `none` settings / ai.
- **Settings access controls Settings sections.** Categories,
  Categorization rules, AI config, etc., are all under one switch.

## Permissions

`abilities.role` is the master gate. `useAbilities()` is called on every
gated page. RLS enforces the same rules server-side.
