# Feature Specifications

Detailed breakdown of every feature — what it does, what data it uses, and what interactions exist.

---

## 1. Dashboard (`/dashboard`)

**Purpose:** Monthly snapshot — income, expenses, savings rate, and category breakdown.

**Data:**
- Calls RPC `get_monthly_summary(account_id, 'YYYY-MM')` for the current month
- Returns grouped totals by category (with parent category info)

**Display:**
- Total income (positive transactions, excluding transfers)
- Total expenses (negative transactions, excluding transfers)
- Net (income + expenses)
- Savings rate (net / income as %)
- Category breakdown list: each category with its expense total

**Interactions:**
- Month navigation (prev/next)
- Clicking a category could navigate to filtered `/transactions` (optional)

**Access:** Requires `finance` read access

---

## 2. Transactions (`/transactions`)

**Purpose:** Full transaction list for the selected month with filtering and summary.

**Data:**
- Query `transactions` joined with `categories` for the selected month
- Filter: `date >= YYYY-MM-01` and `date <= YYYY-MM-{last}`
- Exclude soft-deleted: `deleted_at IS NULL`

**Display:**
- Month navigator (prev/next)
- Filter bar: by sign (income/expense/all) and by category
- Grouped: transfers are shown in a collapsible section separate from regular transactions
- Each row: date, description, category, amount (colored by sign)
- Summary bar: total income, total expenses, net for filtered view

**Interactions:**
- Click transaction → `/transactions/:id` (edit)
- "+ New" button → `/transactions/new`
- Filter dropdowns (sign, category) update list in real-time
- "Import CSV" button → `/import`
- "Auto-categorize" button → triggers AI batch categorization (Ollama)

**Access:** Requires `finance` read access; write operations require `finance` write

---

## 3. Transaction Form — New (`/transactions/new`)

**Purpose:** Create a new transaction.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Date | date picker | Defaults to today |
| Sign | toggle | Income (+) / Expense (−) |
| Amount | text | Parsed as decimal; stored as cents |
| Category | select | Grouped by parent; shows flat list |
| Description | text | Required |
| Notes | textarea | Optional |
| Is transfer | checkbox | Marks as internal transfer (excluded from summaries) |

**Submit:** `INSERT` into `transactions` with `amount_cents = sign * amount * 100`

**Access:** `finance` write

---

## 4. Transaction Form — Edit (`/transactions/:id`)

**Purpose:** Edit or delete an existing transaction.

**Load:** Fetch transaction by `id` on init; pre-fill all fields

**Submit:** `UPDATE transactions SET ... WHERE id = ?`

**Delete:** Two-step confirm → soft-delete (`UPDATE SET deleted_at = now()`)

**Access:** `finance` write (for editing/deleting)

---

## 5. CSV Import (`/import`)

**Purpose:** Bulk import transactions from a bank CSV export.

**3-step wizard:**

**Step 1 — Upload:**
- File input (accept `.csv`)
- Auto-detects: column separator (`,` `;` `\t`), date format (DD.MM.YYYY, YYYY-MM-DD, etc.), decimal separator (`,` or `.`)
- Parses preview rows

**Step 2 — Column Mapping:**
- User maps CSV columns → app fields (date, description, amount, optional: notes, category)
- Supports "amount as two columns" (debit/credit split)
- Shows live preview of parsed rows

**Step 3 — Review & Import:**
- Shows parsed transactions with auto-detected categories (optional)
- Highlights duplicates (matched via `import_hash` = FNV-1a of `date+description`)
- User can uncheck rows to skip
- "Import" button: bulk INSERT with `ON CONFLICT (account_id, import_hash) DO NOTHING`

**Access:** `finance` write

---

## 6. Analyst (`/analyst`)

**Purpose:** AI-generated written report on spending patterns.

**Data:** Reads all non-transfer transactions for the last 6+ months

**Report sections:**
1. **Cash flow summary** — average monthly income/expense/savings
2. **Expense breakdown** — top categories by spend
3. **Fixed vs variable** — recurring predictable costs vs irregular
4. **Recurring patterns** — subscriptions and regular merchants
5. **Anomalies** — months with unusual spending spikes
6. **Merchant tracking** — most frequent payees

**Implementation:** Pure TypeScript — no external AI needed. All analysis done client-side in `src/lib/analyst.ts`. Results rendered as formatted text/cards.

**Access:** Requires `ai` read access

---

## 7. Shopping List (`/shopping`)

**Purpose:** Real-time shared shopping list for the household.

**Data:** `shopping_items` table — hard-deleted (no soft-delete)

**Display:**
- Flat list of items with quantity
- "Added by" name (resolved via member names map)
- Real-time status indicator (connected / connecting / error)

**Interactions:**
- Add item: text input + optional quantity → INSERT
- Check item: immediately hard-deletes the row (no "mark done" state)
- Real-time: Supabase Realtime subscription on `shopping_items` for INSERT and DELETE events → update local list without refetch

**Realtime setup:**
```ts
supabase
  .channel('shopping-items')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'shopping_items',
    filter: `account_id=eq.${accountId}`,
  }, (payload) => {
    if (payload.eventType === 'INSERT') addToList(payload.new)
    if (payload.eventType === 'DELETE') removeFromList(payload.old.id)
  })
  .subscribe()
```

**Access:** `shopping` read to view; `shopping` write to add/delete

---

## 8. Calendar (`/calendar`)

**Purpose:** Shared household event calendar.

**Views:**
- **Month grid** — 6-week grid showing event chips on days
- **List view** — chronological list of events for the month

**Data:** `calendar_events` table, filtered by month overlap:
```sql
start_date <= YYYY-MM-last AND (end_date >= YYYY-MM-01 OR (end_date IS NULL AND start_date >= YYYY-MM-01))
```

**Event fields:**
| Field | Type | Notes |
|-------|------|-------|
| Title | text | Required |
| Description | text | Optional |
| Start date | date | YYYY-MM-DD |
| End date | date | Optional (null = single day) |
| All day | boolean | Default true |
| Color | color picker | Hex string e.g. `#3b82f6` |

**Interactions:**
- Click day → open "Add event" modal pre-filled with that date
- Click event chip → open "Edit event" modal
- Delete: soft-delete (`deleted_at = now()`)
- ICS import: parse `.ics` file, bulk insert, dedup via `source_uid`

**Realtime:** Subscription on `calendar_events` for INSERT, UPDATE, DELETE

**Access:** `calendar` read to view; `calendar` write to add/edit/delete

---

## 9. Household (`/household`)

**Purpose:** Manage household members and permissions.

**Data:** RPC `get_account_members(account_id)` → list of `AccountMemberRow`

### Non-admin view
Simple member list showing:
- Avatar (initials-based circle)
- Display name + "(you)" badge for self
- Email (if display name is set)
- Role badge (Admin / Parent / Child)

### Admin view
Full card per member showing:
- Same header as non-admin
- Remove button (two-step confirm) — cannot remove self or other admins
- Permission radios for each feature (Finance, Shopping, Calendar, Settings, AI)
  - Each radio: `none | read | write`
  - Disabled if role ceiling doesn't allow (e.g. Finance for Child is always disabled)
  - Save immediately on change (optimistic update)

### Invite panel (admin only)
- Role selector (Parent / Child) with description text
- Email input
- "Send invite" → POST to invitations API/Edge Function
- Pending invitations list with Revoke button

**Access:** All members can view; admin-only for editing permissions and inviting

---

## 10. Settings (`/settings`)

**Purpose:** Account-level configuration.

### Categories section
- List all categories (grouped by parent)
- Add category (name + optional parent)
- Soft-delete category
- Renamed categories: inline edit

### Backup / Restore section
- **Export:** Download JSON backup of all account data (accounts, categories, transactions)
- **Import:** Upload a JSON backup file → validates schema → bulk upsert

### Danger zone
- Sign out button (two-step confirm)

**Access:** `settings` write for editing; `settings` read to view

---

## 11. Profile (`/profile`)

**Purpose:** User-level profile (not household-scoped).

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Display name | text | Shown in household member lists |
| Date of birth | date | YYYY-MM-DD |
| Avatar | image | Uploaded to Supabase Storage bucket `avatars/{user_id}/avatar` |

**Data:** `profiles` table — keyed by `auth.users.id`, not `account_id`

**Avatar upload:**
1. User selects image file
2. Upload to Storage: `supabase.storage.from('avatars').upload('{userId}/avatar', file, { upsert: true })`
3. Get public URL: `supabase.storage.from('avatars').getPublicUrl('{userId}/avatar')`
4. Append `?t={timestamp}` as cache-buster
5. Update `profiles.avatar_url` with the public URL

**Access:** Own profile only; all household members can read any profile (for avatars in household page)

---

## 12. Notifications

**Purpose:** In-app bell icon showing unread notifications.

**Current notification types:**
- `invitation` — "You've been invited to join [Household]"

**Realtime:** Subscribe to `notifications` table filtered by `user_id = auth.uid()`

**Interactions:**
- Bell icon shows unread count badge
- Click → opens panel with notifications list
- Mark as read: `UPDATE notifications SET read_at = now() WHERE id = ?`
- Click notification → navigate to relevant page (e.g. `/invite/accept?token=...`)

**Data:** `notifications` table with `type`, `title`, `body`, `data` (JSONB), `read_at`
