# Password Vault (E2E encrypted)

A shared household password vault. Wi-Fi, Netflix, gym membership, kids'
school portal, the iCloud account everyone uses — every household has them
and every household ends up with a sticky note. This is the sticky note,
encrypted **end-to-end** before it leaves the browser.

## What "end-to-end" means here

- The server **never sees plaintext passwords, usernames, or notes.**
- Every entry is AES-GCM-256 encrypted client-side with a key derived from
  a household master passphrase via PBKDF2-SHA256 (600 000 iterations,
  per-account random salt). The server stores only the ciphertext + IV.
- Browse-only fields stay plaintext: the entry **name** and optional
  **URL**. This makes the list useful before unlocking and lets you search
  without decrypting everything.
- Loss of the master passphrase = total data loss. There is no recovery.
  The setup form makes the user explicitly acknowledge this.

## Routes

| Path     | File                            | Purpose |
|----------|---------------------------------|---------|
| `/vault` | `src/app/vault/page.tsx`        | Setup → unlock → list → entry dialog (add/view/edit/delete). |

## Database

### `public.password_vaults` (per-account metadata)
Defined in `supabase/add_password_vault.sql`. One row per account.

| Column        | Type        | Notes |
|---------------|-------------|-------|
| `account_id`  | uuid PK     | → `accounts.id` (cascade) |
| `kdf`         | text        | algorithm name; `'PBKDF2-SHA256'` in MVP |
| `kdf_iters`   | int         | 600 000 default |
| `salt_b64`    | text        | base64 16-byte random salt |
| `verifier_ct` | text        | base64 ciphertext of a fixed plaintext, encrypted with the derived key |
| `verifier_iv` | text        | base64 12-byte IV |
| `setup_by`    | uuid FK?    | the user who first set up the vault |
| `created_at`, `updated_at` | timestamptz | |

**RLS**
- SELECT: members with `vault_access ∈ {read, write}`.
- INSERT / UPDATE / DELETE: `role = 'admin'` (vault setup + reset are
  admin-only operations).

### `public.password_entries`

| Column       | Type     | Notes |
|--------------|----------|-------|
| `id`         | uuid PK  | |
| `account_id` | uuid FK  | → `accounts.id` |
| `name`       | text     | 1..200 chars; **plaintext** label for the list |
| `url`        | text?    | optional plaintext URL |
| `ciphertext` | text     | base64 AES-GCM ciphertext of the secret JSON |
| `iv`         | text     | base64 12-byte IV |
| `created_by` | uuid FK? | |
| `created_at`, `updated_at` | timestamptz | |

The encrypted blob is `JSON.stringify({ username, password, notes,
totp_secret })`. TOTP is plumbed in the type but the UI is left for a
later iteration.

**RLS**
- SELECT: members with `vault_access ∈ {read, write}`.
- INSERT / UPDATE / DELETE: members with `vault_access = 'write'`.

### `account_members.vault_access` (new column)

Added by the same migration. Default `'none'`; admin gets `'write'`
(backfilled). `getDefaultAccessLevels()` in `src/lib/abilities.ts` now
returns:

| Role   | Default `vault_access` |
|--------|------------------------|
| admin  | `write`                |
| parent | `read`                 |
| child  | `none`                 |

Admins grant per-member from `/household` (existing access-radio UI).

### `get_account_members` RPC

Updated to include `vault_access` in the returned shape so the household
page can render the new permission column. Existing migrations that defined
this RPC are superseded by the version in `add_password_vault.sql`.

## Crypto module — `src/lib/vaultCrypto.ts`

Pure WebCrypto, no deps.

| Function | Purpose |
|----------|---------|
| `deriveKey(passphrase, salt, iters)` | PBKDF2 → AES-GCM `CryptoKey`. |
| `encryptJson(key, value)` | Serializes, encrypts; returns `{ ciphertext_b64, iv_b64 }`. |
| `decryptJson(key, blob)` | Inverse. Throws on AEAD failure. |
| `buildVerifier(key)` | Encrypts a fixed plaintext to use as the unlock verifier. |
| `verifyKey(key, verifier)` | Returns true iff decryption round-trips to the expected plaintext. |
| `buildSetupBundle(passphrase)` | Generates salt, derives key, builds verifier — used by the admin setup flow. |
| `bytesToBase64`, `base64ToBytes`, `randomBytes` | Encoding helpers. |

Key handling: the derived `CryptoKey` lives **only in memory** in a `useRef`
in the page-level hook. Reload, navigate away, click "Lock" → the key is
gone, and you re-enter the passphrase. No localStorage / sessionStorage.

## Repository — `src/db/repositories/vaultRepo.ts`

| Function | Purpose |
|----------|---------|
| `getVaultMeta()` | Returns the vault row or `null`. |
| `setupVault(input)` | Inserts the vault row (admin-only via RLS). |
| `resetVault()` | Deletes every entry then the vault row. Irreversible. |
| `listEntries()` / `insertEntry` / `updateEntry` / `deleteEntry` | CRUD. |

Exposed on `dbClient.vault`.

## Hook — `src/app/vault/_hooks/useVault.ts`

`useVault()` orchestrates the lifecycle:

- On mount → `getVaultMeta()` → `status` becomes `not-set-up`, `locked`, or
  `error`.
- `setup(passphrase)` → derives key, builds verifier, inserts vault row,
  drops to `unlocked`.
- `unlock(passphrase)` → derives key, verifies, loads entries; updates
  `status` to `unlocked`. Wrong passphrase returns `false` and surfaces an
  error message.
- `lock()` → discards the in-memory key + entries and returns to
  `locked`.
- `decryptEntry(entry)` → returns the decrypted `PasswordEntrySecret`.
- `addEntry({ name, url, secret })` / `saveEntry(id, …)` → encrypt
  client-side, then insert/update.
- `removeEntry(id)` → optimistic delete with rollback on failure.
- `resetVault()` → wipe everything (admin-only via RLS).

## React layer

- `_components/SetupForm.tsx` — shown to admins on the empty-state page;
  twin passphrase inputs, mandatory "I understand losing this means total
  data loss" checkbox.
- `_components/UnlockForm.tsx` — passphrase entry post-setup.
- `_components/EntryDialog.tsx` — modal for add / view / edit / delete.
  Has copy buttons for username + password, a reveal toggle, and a
  one-click password generator (16 chars, ambiguity-free alphabet, via
  `crypto.getRandomValues`).
- `page.tsx` — search filter, "+ Add", "Lock", danger-zone Reset (admin
  only).

The `Vault` link in the header nav (`src/components/HeaderNav.tsx`) routes
here.

## Permissions

| Action | Required |
|--------|----------|
| See `/vault` link | always shown; the page itself gates by `vault_access` |
| Read entries | `vault_access ∈ {read, write}` (RLS) |
| Add / edit / delete entries | `vault_access = 'write'` (RLS) |
| Setup / reset vault | `role = 'admin'` (RLS) |

## How it works (end-to-end)

1. **First visit** as admin → empty state. Admin enters a master
   passphrase twice + checks the "no recovery" warning. Client generates a
   16-byte salt, derives an AES-GCM-256 key (PBKDF2-SHA256, 600k iters),
   encrypts a fixed plaintext as the verifier. Salt + verifier are
   `INSERT`ed into `password_vaults`. Vault is unlocked in the same
   session.
2. **Subsequent visit** by any member with `vault_access` → unlock form.
   Client fetches `salt + verifier`, derives the candidate key, decrypts
   the verifier. AES-GCM authenticates → wrong passphrase fails the tag.
   Plaintext-equality check is a belt-and-braces guard against accidental
   collisions.
3. **Add an entry** → user fills in name (plaintext), URL (plaintext), and
   the secret fields (username, password, notes). Client encrypts the
   secret JSON with the in-memory key. Row is inserted with the
   ciphertext + IV.
4. **View an entry** → client fetches the row, decrypts, populates the
   modal. Decryption happens lazily — only the entry the user actually
   opens is decrypted.
5. **Edit / delete** → re-encrypt on save, send patch. Delete is a hard
   row delete.
6. **Lock / reload** → in-memory key is gone, user must re-enter
   passphrase. The lock button is one click; no auto-lock timer in MVP.
7. **Reset** (admin only) → wipes every entry + the vault row. Irreversible.

## Notable details

- **Browse without unlocking.** Names + URLs are plaintext on purpose so
  the entry list is useful before the user has decided to unlock. The
  trade-off is that someone with DB access can see *that* you have a
  Netflix entry — they just can't see the password.
- **No passphrase rotation in MVP.** Adding it requires re-encrypting
  every entry and rotating the verifier. Easy enough but not done yet.
- **No auto-lock.** The vault stays unlocked until the page reloads, you
  navigate away, or you click Lock. Auto-lock-after-N-minutes would be a
  small polish.
- **Per-entry visibility scoping is not modelled.** All entries are
  visible to anyone with `vault_access`. Splitting "kids can see Netflix
  but not the bank" requires either separate vaults or a per-entry
  visibility column — left for a future iteration.
- **TOTP is plumbed but inactive.** `PasswordEntrySecret` has a
  `totp_secret` field; the UI doesn't render TOTP codes yet.
- **Crypto choices.** PBKDF2-SHA256 600k iters is OWASP 2023's
  recommended floor; ~1s on a modern laptop. AES-GCM gives authenticated
  encryption with a 128-bit auth tag in the ciphertext. 12-byte IV per
  blob, never reused (each encryption generates a fresh one).
- **No new third-party dependencies.** Everything uses browser-native
  WebCrypto.
