# Push Notifications (Web Push)

Browser push notifications powered by VAPID keys + the standard Web Push
Protocol (RFC 8291). The user opts in once per device; subscriptions are
stored server-side and a webhook endpoint can fan a notification out to
every subscription for a given user.

## Files

| File                                     | Purpose |
|------------------------------------------|---------|
| `src/components/PwaInit.tsx`             | Registers the service worker, prompts for notification permission, creates the VAPID subscription, POSTs it. |
| `src/app/api/push/subscribe/route.ts`    | `POST` saves a subscription; `DELETE` removes it by `endpoint`. |
| `src/app/api/push/send/route.ts`         | Webhook (`x-webhook-secret`) → fans out a `web-push` notification to a user's subscriptions. |
| `public/sw.js`                           | Service worker — handles `push` events and notification clicks. |

## Database

### `public.push_subscriptions`
Defined in `supabase/add_push_subscriptions.sql`.

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `user_id`    | uuid FK     | → `auth.users.id` |
| `endpoint`   | text        | unique per browser/device |
| `p256dh`     | text        | encryption public key |
| `auth`       | text        | auth secret |
| `created_at` | timestamptz | |

**RLS** — Users can SELECT / INSERT / DELETE only their own rows.

## Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | client | Embedded in `PwaInit` to create the subscription. |
| `VAPID_PRIVATE_KEY`            | server | Used by `web-push` to sign push payloads. |
| `WEBHOOK_SECRET`               | server | Required `x-webhook-secret` header on `/api/push/send`. |

Generate a VAPID key pair with `npx web-push generate-vapid-keys`.

## How it works

1. **App load.** `PwaInit` checks `'serviceWorker' in navigator` and
   `'PushManager' in window`. If both are available, the user hasn't
   dismissed the prompt (`localStorage.push_dismissed`), and notification
   permission isn't `granted`, a small banner asks the user to enable
   notifications.
2. **Opt-in.** User clicks "Enable" → `Notification.requestPermission()` →
   `serviceWorker.register('/sw.js')` → `pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })`.
   The resulting `PushSubscription` is POSTed to `/api/push/subscribe`,
   which inserts a row.
3. **Send a push.** A trusted external service (Supabase webhook, cron,
   anything) calls `POST /api/push/send` with the `x-webhook-secret`
   header and a JSON body `{ user_id, title, body, url? }`. The route
   loads the user's subscriptions and iterates `webpush.sendNotification`.
   If the upstream returns `404`/`410` the subscription is stale and the
   row is deleted.
4. **Receive.** The service worker (`public/sw.js`) listens for `push` →
   `self.registration.showNotification(title, { body, icon, data })`.
5. **Click.** `notificationclick` → focus an existing tab if available, else
   open `data.url` (defaults to `/`).

## Notable details

- **Per device, per browser.** Same user on Firefox and on Safari = two
  subscription rows. That's by design.
- **Stale subscriptions auto-pruned.** Web Push returns 410 Gone for
  retired endpoints; the send route catches this and deletes the row.
- **`urlBase64ToUint8Array`** converts the VAPID public key from URL-safe
  base64 to the `Uint8Array` shape `pushManager.subscribe` expects.
- **No auth check on `/api/push/send`** beyond the shared secret.
  Production should also validate the `user_id` against an allow-list.
- **Service worker scope** is the site root because `sw.js` is served from
  `public/`. Don't move it without re-scoping.
- **The bell ([notifications](./notifications.md)) is independent.** Push
  is the OS notification; the bell is the in-app feed. A real production
  setup wires them together — when a `notifications` row is INSERTed, an
  edge function calls `/api/push/send`. This isn't fully wired in MVP.
