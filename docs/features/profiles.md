# Profiles

Per-user display name, date of birth, and avatar. Auto-created on signup,
publicly readable across the household so member lists / chat avatars work.

## Routes

| Path       | File                            | Purpose |
|------------|---------------------------------|---------|
| `/profile` | `src/app/profile/page.tsx`      | Edit display name, DOB, avatar; view email (read-only). |

## Database

### `public.profiles`
Defined in `supabase/add_profiles.sql`. Backfilled by
`supabase/backfill_existing_users.sql`.

| Column          | Type        | Notes |
|-----------------|-------------|-------|
| `id`            | uuid PK     | also FK → `auth.users.id` |
| `display_name`  | text?       | optional |
| `date_of_birth` | date?       | optional |
| `avatar_url`    | text?       | public Supabase Storage URL |
| `updated_at`    | timestamptz | |

**RLS** — Authenticated users can SELECT every profile (needed so member
lists / DM headers / message bubbles can show names + avatars). Users can
UPDATE only their own row.

### Storage

Public bucket **`avatars`** (created in `add_profiles.sql`). Files are stored
at `{user_id}/avatar`; storage RLS allows the user to write only inside
their own folder.

### Bootstrap trigger

`handle_new_user` (in `schema.sql` / `update_roles.sql`) inserts a blank
`profiles` row when an `auth.users` row is created, so `getProfile()` never
returns `null` for a freshly-signed-up user.

## Repository — `src/db/repositories/profileRepo.ts`

| Function | Purpose |
|----------|---------|
| `getProfile()` | Loads the current user's row. |
| `upsertProfile({ display_name?, date_of_birth?, avatar_url? })` | Update; on the off chance the bootstrap trigger missed, this also inserts. |
| `uploadAvatar(file)` | Uploads to `avatars/{user_id}/avatar`, returns a public URL with `?t=<timestamp>` for cache-busting. |

Exposed on `dbClient.profile` as `get`, `upsert`, `uploadAvatar`.

## React layer

- `src/app/profile/_hooks/useProfile.ts` — load on mount, save action, avatar
  upload action.
- `src/app/profile/page.tsx` — form. Avatar button opens a file picker; on
  upload it stores the new URL and re-renders. Save submits the rest.

## How it works

1. **Sign-up.** Trigger creates a blank profile row keyed by the new user
   id.
2. **Open `/profile`.** `getProfile()` loads the row; the form pre-fills.
   Email is rendered from `supabase.auth.getUser()` (read-only — auth owns
   email).
3. **Pick an avatar.** Selecting a file → `uploadAvatar` puts it in
   `avatars/{user_id}/avatar` (overwriting the prior file). The returned
   public URL is appended `?t=<now>` so cached references invalidate. The
   URL is then `upsert`ed onto the profile row.
4. **Save.** Display name + DOB → `upsertProfile`.
5. **Display elsewhere.** `useMemberProfiles()` reads `profiles.avatar_url`
   for every member of the active account; `Avatar` and `MessageBubble`
   render either the image or a hashed gradient initial.

## Notable details

- **Cache-busting URL** — without `?t=…`, replacing the avatar would still
  serve the cached image to other tabs / devices.
- **Public-readable profiles.** Required by member lists. There's no
  privacy mode for names / avatars; only the finance numbers are masked.
- **No deletion.** Profiles are removed only via auth account deletion
  (cascade).
- **No upload validation in the client** beyond the file picker's `accept`.
  Supabase Storage enforces the bucket's max size; large images will fail
  the upload.
