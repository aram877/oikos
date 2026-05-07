# Privacy Mode

A toggleable mask over every monetary amount in the app. Hashes the cents
value into a stable seeded pseudo-random string so the same amount always
renders the same way (preserves visual structure for shoulder-comparison)
without leaking the real number.

## Files

| File                                  | Purpose |
|---------------------------------------|---------|
| `src/lib/privacy.tsx`                 | `PrivacyProvider`, `usePrivacy`, `useFormatMoney`, `<Money />`, masking algorithm. |
| `src/components/PrivacyToggle.tsx`    | Eye-icon toggle in the header. |
| `src/app/auth/login/page.tsx`         | Checkbox to flip the flag *before* sign-in (so `/transactions` first paint is already masked). |

Persistence: `localStorage['oikos:privacy']` ∈ `{ '0', '1' }`. Synced across
tabs via the `storage` event listener.

## How it works

1. **`PrivacyProvider`** wraps the app in `src/app/layout.tsx`. It reads the
   localStorage value on mount, and exposes `{ isPrivate, toggle, setPrivate }`
   via context. A `storage` event listener mirrors changes from other tabs in
   real time.
2. **`<Money cents={…} />`** is the only money-rendering component the rest
   of the app uses. Internally it calls `useFormatMoney(cents)` which returns
   the formatted string — masked when `isPrivate` is true.
3. **Masking algorithm** (`maskAmount`):
   - Format the amount as a EUR string (currency symbol + grouping +
     separator preserved).
   - Hash the cents value with FNV-1a-32 (`hashCents`) to seed a tiny LCG.
   - Walk the formatted string; replace each digit with a character drawn
     from `MASK_CHARS` using the seeded RNG.
   - Non-digit characters (`€`, `,`, `.`, `-`, space) pass through.
   - Same input → same output, deterministic and flicker-free.
4. **Toggle.** The header button + the login-page checkbox flip the flag.
   Update is synchronous in React state and persisted to localStorage.

## Notable details

- **Not cryptography.** This is shoulder-surf protection. A patient observer
  who sees the same masked output twice can tell those two amounts are
  equal — that's the *point* (you can still compare your January and
  February at a glance) but it isn't security.
- **Stable per amount** — same cents always masks to the same string. No
  flicker on re-renders.
- **Pre-auth toggle.** The login page checkbox writes to localStorage
  *before* sign-in, so the post-login dashboard's first paint is already
  masked. No flash of real numbers.
- **Graceful degradation.** Pages outside `PrivacyProvider` (e.g. login)
  treat `isPrivate` as `false` instead of crashing.
- **Storage failures are silently caught.** State stays in memory if
  localStorage is unavailable.

## Permissions

None. Per-device, per-user setting.
