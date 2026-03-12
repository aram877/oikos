# API Reference

The app has three server-side API routes. In the Next.js version these live in `src/app/api/`. In Angular (a pure SPA), you'll need to replace them with **Supabase Edge Functions** since they require the `SERVICE_ROLE_KEY` which must never be in the browser.

> **Note:** All Supabase DB operations (select, insert, update, delete) go directly from Angular to Supabase using the JS client — no API layer needed. Only the invitation routes below need a backend.

---

## Invitations API

These three endpoints manage household invitations. They require admin role and use the Supabase Admin API (`service_role` key) to send auth emails.

---

### POST /api/invitations

Creates an invitation and sends an email to the invitee.

**Auth required:** Yes (JWT cookie / Bearer token)
**Role required:** Admin

**Request body:**
```json
{
  "email": "user@example.com",
  "role": "parent"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | `string` | Email address of the person to invite |
| `role` | `'parent' \| 'child'` | Role to assign on joining |

**Success response `200`:**
```json
{ "ok": true }
```

**Error responses:**
```json
{ "error": "Unauthorized" }          // 401 — not authenticated
{ "error": "Forbidden" }             // 403 — not admin
{ "error": "email and role required" } // 400 — missing fields
{ "error": "<message>" }             // 500 — DB or email error
```

**What it does internally:**
1. Resolves caller's `account_id` from `account_members` (earliest joined row)
2. Computes default access levels for the given role (see `getDefaultAccessLevels()` in `ROLES_AND_PERMISSIONS.md`)
3. Inserts row in `invitations` table with a random UUID token
4. Determines if invitee is new or existing user:
   - **New user:** calls Supabase Admin `inviteUserByEmail(email, { redirectTo: '/auth/callback?invite_token=TOKEN' })`
   - **Existing user:** calls Admin `generateLink({ type: 'magiclink', email, options: { redirectTo: '/auth/callback?next=/invite/accept?token=TOKEN' } })`
5. Sends email via Supabase Auth

**Angular replacement:** Create a Supabase Edge Function `invite-member` with the same logic. Call it from `HouseholdService.sendInvite(email, role)`.

---

### GET /api/invitations

Lists all pending (not yet accepted) invitations for the caller's household.

**Auth required:** Yes
**Role required:** Admin

**Response `200`:**
```json
{
  "invitations": [
    {
      "token":      "uuid",
      "email":      "user@example.com",
      "role":       "parent",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**What it does internally:**
1. Resolves caller's `account_id`
2. Queries `invitations` table where `account_id = ? AND accepted_at IS NULL`

**Angular replacement:** Query Supabase directly — the `invitations` table has RLS policies allowing admins to read. No Edge Function needed here.

```ts
// In Angular service
const { data } = await supabase
  .from('invitations')
  .select('token, email, role, created_at')
  .is('accepted_at', null)
  .order('created_at', { ascending: false })
```

---

### DELETE /api/invitations?token=UUID

Revokes a pending invitation.

**Auth required:** Yes
**Role required:** Admin
**Query param:** `token` (UUID)

**Response `200`:**
```json
{ "ok": true }
```

**What it does internally:**
1. Resolves caller's `account_id`
2. Deletes from `invitations` where `token = ? AND account_id = ?`

**Angular replacement:** Also a direct Supabase call (RLS covers it):
```ts
await supabase
  .from('invitations')
  .delete()
  .eq('token', token)
```

---

## Auth Routes (handled by Supabase redirect)

These are not traditional API endpoints — they're pages that handle Supabase Auth redirects.

### GET /auth/callback

Handles Supabase Auth redirect after email confirmation, magic link, or OAuth.

**Query params:**
- `code` — auth code from Supabase (exchanged for session)
- `invite_token` — (optional) invitation UUID; if present, calls `accept_invitation(token)` RPC
- `next` — (optional) redirect path after success (default: `/transactions`)

**Flow:**
```
User clicks email link
  → /auth/callback?code=...&invite_token=...
  → exchangeCodeForSession(code)
  → if invite_token: supabase.rpc('accept_invitation', { p_token: invite_token })
  → navigate to `next` or /transactions
```

**Angular implementation:** Create an `AuthCallbackComponent` at route `/auth/callback`. In `ngOnInit`, read query params and call `supabase.auth.exchangeCodeForSession(code)`. See `AUTH_FLOW.md` for full details.

### GET /invite/accept?token=UUID

Shows invitation details (household name, inviter, role) and a confirm button.

**Flow:**
```
User visits /invite/accept?token=UUID
  → calls supabase.rpc('get_invitation_by_token', { p_token: token })
  → displays: "You're invited to join [HouseholdName] as [Role] by [Inviter]"
  → on confirm: supabase.rpc('accept_invitation', { p_token: token })
  → hard navigate to /transactions (to clear account cache)
```

---

## Direct Supabase Operations (no API layer)

Everything else is a direct Supabase JS call. Reference:

| Operation | Supabase call |
|-----------|---------------|
| List transactions (month) | `.from('transactions').select('*, categories(...)').eq('account_id', id).gte('date', start).lte('date', end).is('deleted_at', null)` |
| Add transaction | `.from('transactions').insert(input)` |
| Update transaction | `.from('transactions').update(input).eq('id', id)` |
| Soft-delete transaction | `.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)` |
| Monthly summary | `.rpc('get_monthly_summary', { p_account_id, p_year_month: 'YYYY-MM' })` |
| List categories | `.from('categories').select('*').eq('account_id', id).is('deleted_at', null)` |
| Add category | `.from('categories').insert({ account_id, name, parent_id })` |
| Delete category | `.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)` |
| List shopping items | `.from('shopping_items').select('*').eq('account_id', id).order('created_at')` |
| Add shopping item | `.from('shopping_items').insert({ account_id, name, quantity, added_by: userId })` |
| Delete shopping item (hard) | `.from('shopping_items').delete().eq('id', id)` |
| List calendar events (month) | `.from('calendar_events').select('*').eq('account_id', id).is('deleted_at', null)` + overlap filter |
| Add calendar event | `.from('calendar_events').insert(input)` |
| Update calendar event | `.from('calendar_events').update(input).eq('id', id)` |
| Delete calendar event (soft) | `.from('calendar_events').update({ deleted_at: now }).eq('id', id)` |
| Get members | `.rpc('get_account_members', { p_account_id })` |
| Update member permissions | `.from('account_members').update(input).eq('account_id', id).eq('user_id', memberId)` |
| Remove member | `.rpc('remove_account_member', { p_account_id, p_member_id })` |
| Get/upsert profile | `.from('profiles').upsert(input).eq('id', userId)` |
| Get notifications | `.from('notifications').select('*').eq('user_id', userId).is('read_at', null)` |
| Mark notification read | `.from('notifications').update({ read_at: now }).eq('id', id)` |
