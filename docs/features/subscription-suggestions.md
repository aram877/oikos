# Subscription Suggestions (Smart Detector)

A pure-TS pass that scans the last 12 months of transactions for recurring
patterns the user **isn't tracking yet** and surfaces them as suggestions.
One click on "Track this" creates the subscription, saves a default match
pattern, and bulk-links the historical charges.

Builds on top of [subscriptions](./subscriptions.md) — same data model,
same matcher library; this feature only adds the detection pass + a
small dismissals table so users can hide suggestions they don't want.

## Routes

| Path                       | File                                                          | Purpose |
|----------------------------|---------------------------------------------------------------|---------|
| `/subscriptions/discover`  | `src/app/subscriptions/discover/page.tsx`                     | List of all detected suggestions; per-card "Track this" / "Dismiss". |
| `/subscriptions`           | `src/app/subscriptions/page.tsx`                              | Shows a banner at the top when there are pending suggestions. |

## Database

### `public.subscription_suggestion_dismissals`
Defined in `supabase/add_subscription_suggestions.sql`.

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `account_id`   | uuid PK     | → `accounts.id` (cascade) |
| `fingerprint`  | text PK     | stable hash of (normalized description + amount bucket) |
| `dismissed_by` | uuid FK?    | → `auth.users.id` (set null on user delete) |
| `dismissed_at` | timestamptz | |

PK is `(account_id, fingerprint)` — dismissals are **account-wide**, so
hiding a suggestion on one device hides it for everyone in the household.

**RLS** — same gating as the rest of the subscriptions feature:
read = `finance_access ∈ {read, write}`, write = `finance_access = 'write'`.

## Detector — `src/lib/subscriptionDetector.ts`

Pure, deterministic, no deps.

```ts
detectSuggestions({ transactions, existingPatterns, dismissedFingerprints })
  → SubscriptionSuggestion[]
```

Algorithm:

1. **Filter candidates.** Outflows only, not transfers, not already
   linked, not matching any existing subscription pattern (those would be
   auto-linked after the next "apply patterns" pass).
2. **Group by fingerprint** — `fnv1a32(normalizedDescription + '|' + amountBucket)`.
   Bucket width is €1 to absorb minor FX drift.
3. **Cadence check** — sort the group by date, compute median interval
   between charges, and snap it to a known cadence:
   - `5–9 days   → weekly`
   - `12–16      → biweekly`
   - `26–34      → monthly`
   - `85–95      → quarterly`
   - `355–375    → yearly`
   - else → reject the group.
4. **Variance check** — `(maxInterval - minInterval) / median < 0.4`.
   Drops "recurring-looking" noise like a thrice-touched merchant with
   wildly different gaps.
5. **Min charges** — `≥ 3`.
6. **Skip if dismissed** — fingerprint is in the dismissed set.

Each surviving group becomes a `SubscriptionSuggestion`:

```ts
interface SubscriptionSuggestion {
  fingerprint:        string
  suggestedName:      string         // pretty-cased (e.g. "Netflix.Com")
  sampleDescription:  string         // raw bank label of the latest charge
  amountCents:        number         // signed; median over the group
  cadence:            'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  chargeCount:        number
  firstSeen:          string
  lastSeen:           string
  intervalDaysMedian: number
  intervalVariance:   number
  transactions:       TransactionListRow[]   // for the expandable preview
}
```

Sorted by `lastSeen DESC, chargeCount DESC` — the most recently active
suggestions appear first.

### Description normalization

```
"SEPA NETFLIX.COM 12345678"           → "netflix.com"
"Lastschrift Spotify ABC123XYZ"       → "spotify"
"PayPal *Apple.com/Bill 99887766"     → "apple.com/bill"
```

Trailing reference codes (uppercase alphanumeric ≥ 6 chars or 4+ digits)
are stripped **before** lowercasing — otherwise the case-sensitive regex
would never match.

## Repository additions — `src/db/repositories/subscriptionsRepo.ts`

| Function | Purpose |
|----------|---------|
| `listDismissedFingerprints()` | Loads every dismissed fingerprint for the active account. |
| `dismissSuggestion(fingerprint)` | Upserts a dismissal. |
| `undismissSuggestion(fingerprint)` | Deletes a dismissal. |

Exposed on `dbClient.subscriptions` as `listDismissed`, `dismiss`,
`undismiss`.

## Hook — `src/app/subscriptions/_hooks/useSubscriptionSuggestions.ts`

```ts
const { items, status, error, reload, track, dismiss }
  = useSubscriptionSuggestions()
```

- Loads transactions, patterns, dismissals in parallel; runs the
  detector locally.
- `track(suggestion, overrides?)` — creates the subscription, inserts a
  default match pattern (a long uppercase token from the description, or
  the first 30 chars; ±50¢ amount range), and bulk-links every
  transaction in the group. Returns the new subscription id so the
  caller can navigate to its detail page.
- `dismiss(suggestion)` — optimistic local removal + DB upsert.
- The default pattern token comes from `pickPatternToken()`: it prefers
  a long uppercase token (likely the merchant) over the first 30 chars
  of the raw description.

## React layer

- `_components/SuggestionsBanner.tsx` — top banner on the list page.
  Shows a sparkle icon, the count, a comma-joined preview of up to 3
  names ("Netflix, Spotify, Adobe Cloud, and 2 more"), and a primary
  "Review →" link to `/subscriptions/discover`.
- `discover/page.tsx` — full review list. Each card has:
  - Inline-editable name (so the user can rename before tracking).
  - Cadence badge, per-charge amount, charge count, last-seen date,
    median interval.
  - Expandable list of the matching transactions (last 8 + a "+ N
    earlier" line).
  - **Track this** (primary) → `track()` → navigate to the new
    subscription's detail page for fine-tuning.
  - **Dismiss** (two-step confirm) → `dismiss()`.

## How it works end-to-end

1. **You open `/subscriptions`.** The hook fires in the background and
   returns N suggestions. If `N > 0`, a banner appears under the
   header.
2. **Click the banner** → `/subscriptions/discover`. Each card shows
   what was detected with full transparency (intervals, sample
   transactions).
3. **Track this** → the hook:
   - Creates the subscription with the detected name + cadence +
     median amount.
   - Inserts a default match pattern using a sensible substring + a
     ±50¢ amount window. (For aggregator descriptions like
     `APPLE.COM/BILL`, the amount narrowing is what disambiguates
     Spotify from Netflix.)
   - Bulk-links the historical charges via
     `linkTransactionsBulk`.
   - Removes the suggestion from the local list.
   - Navigates to the subscription's detail page so you can refine the
     pattern, add more (e.g. a separate `NETFLIX.COM` pattern alongside
     the `APPLE.COM/BILL` one), or change the cadence.
4. **Dismiss** → fingerprint is upserted into
   `subscription_suggestion_dismissals`. The detector skips it on
   subsequent runs.

## Testing

`src/lib/subscriptionDetector.test.ts` covers:

- Description normalization (prefix and reference-code stripping).
- Cadence detection edge cases.
- Stable fingerprint across small amount drift.
- Clean monthly subscription detection.
- Skipping when an existing pattern already matches.
- Respecting dismissed fingerprints.
- High-variance interval rejection.
- Skipping transfers, incomes, and already-linked rows.

Run with `npm test`.

## Notable details

- **No new infra for the detection pass.** The matcher and existing
  spend RPC do the heavy lifting; this feature is mostly a clever scan
  + a tiny dismissals table.
- **First-match-wins-by-specificity** in the matcher means a tracked
  subscription's pattern will win over the detector's view of "this is
  unlinked" the next time the page loads — the suggestion vanishes
  automatically once you track it.
- **Account-wide dismissals.** Dismissals don't go through the bell or
  realtime — the detector reads them on every load. Trade-off: simpler
  code, one round-trip, no live update if a household member dismisses
  while you're staring at the page (rare).
- **No automatic backfill into the past on dismissal.** Dismissing a
  suggestion doesn't tag those transactions — they stay
  uncategorized/unlinked. You can always come back and track later if
  you change your mind (use `undismiss` from the DB or clear the
  fingerprint manually — UI to undismiss is a future polish).
- **Detector is stateless.** Every page load re-runs the scan. Cheap
  enough on a year of household-scale transactions; not designed for
  100k+ rows.
