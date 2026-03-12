# Data Models

All TypeScript interfaces. Copy these into `src/app/shared/models/` in your Angular project.

---

## Primitive Types

```ts
export type AccessLevel = 'none' | 'read' | 'write'
export type Role        = 'admin' | 'parent' | 'child'
export type Feature     = 'finance' | 'shopping' | 'calendar' | 'settings' | 'ai'
export type Action      = 'read' | 'write' | 'delete'
```

---

## Database Row Types

These mirror Supabase table columns exactly. Use these as the return types when querying.

```ts
// accounts table
export interface AccountRow {
  id:         string        // UUID
  name:       string
  currency:   string        // always 'EUR'
  created_at: string        // ISO-8601
  deleted_at: string | null
}

// categories table (hierarchical — parent_id is self-referential)
export interface CategoryRow {
  id:         string
  account_id: string
  name:       string
  parent_id:  string | null  // null = top-level category
  created_at: string
  deleted_at: string | null
}

// transactions table
export interface TransactionRow {
  id:           string
  account_id:   string
  category_id:  string | null
  amount_cents: number        // negative = expense, positive = income
  currency:     string        // always 'EUR'
  date:         string        // YYYY-MM-DD
  description:  string
  notes:        string | null
  import_hash:  string | null // dedup key for CSV importer (FNV-1a hash)
  is_transfer:  boolean       // true = excluded from income/expense summaries
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
}

// transactions joined with category info (from get query with nested select)
export interface TransactionListRow extends TransactionRow {
  category_name:        string | null
  category_parent_id:   string | null
  parent_category_name: string | null
}

// shopping_items table (hard-deleted, no soft-delete)
export interface ShoppingItemRow {
  id:         string
  account_id: string
  name:       string
  quantity:   string | null
  added_by:   string | null  // user_id of creator
  created_at: string
}

// calendar_events table
export interface CalendarEventRow {
  id:          string
  account_id:  string
  title:       string
  description: string | null
  start_date:  string        // YYYY-MM-DD
  end_date:    string | null // null = single-day event
  all_day:     boolean
  color:       string | null // hex color e.g. '#3b82f6'
  source_uid:  string | null // RFC 5545 UID from ICS import (dedup key)
  created_by:  string | null // user_id
  updated_by:  string | null // user_id
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

// profiles table (one row per auth user, user_id = auth.users.id)
export interface ProfileRow {
  id:            string        // = auth.users.id
  display_name:  string | null
  date_of_birth: string | null // YYYY-MM-DD
  avatar_url:    string | null
  updated_at:    string
}

// account_members — returned by RPC get_account_members (includes email + display_name via join)
export interface AccountMemberRow {
  user_id:         string
  email:           string
  display_name:    string | null // from profiles join
  role:            Role
  joined_at:       string
  finance_access:  AccessLevel
  shopping_access: AccessLevel
  calendar_access: AccessLevel
  settings_access: AccessLevel
  ai_access:       AccessLevel
}

// notifications table
export interface NotificationRow {
  id:         string
  user_id:    string        // recipient
  type:       string        // 'invitation' | future types
  title:      string
  body:       string | null
  data:       Record<string, unknown> // JSONB — type-specific payload
  read_at:    string | null
  created_at: string
}

// invitations table (pending invites)
export interface InvitationRow {
  id:          string
  account_id:  string
  invited_by:  string        // user_id of admin who sent invite
  email:       string
  role:        Role
  token:       string        // UUID, unique — used in /invite/accept?token=...
  created_at:  string
  accepted_at: string | null
  // access level columns also stored:
  finance_access:  AccessLevel
  shopping_access: AccessLevel
  calendar_access: AccessLevel
  settings_access: AccessLevel
  ai_access:       AccessLevel
}
```

---

## Input / Mutation Types

```ts
export interface InsertTransactionInput {
  account_id:   string
  category_id:  string | null
  amount_cents: number
  date:         string  // YYYY-MM-DD
  description:  string
  notes?:       string | null
  import_hash?: string | null
  is_transfer?: boolean
}

export interface UpdateTransactionInput {
  category_id?:  string | null
  amount_cents?: number
  date?:         string
  description?:  string
  notes?:        string | null
  is_transfer?:  boolean
}

export interface InsertCategoryInput {
  name:      string
  parent_id: string | null
}

export interface InsertShoppingItemInput {
  name:      string
  quantity?: string | null
}

export interface InsertCalendarEventInput {
  title:        string
  description?: string | null
  start_date:   string  // YYYY-MM-DD
  end_date?:    string | null
  all_day?:     boolean
  color?:       string | null
}

export interface UpdateCalendarEventInput {
  title?:       string
  description?: string | null
  start_date?:  string
  end_date?:    string | null
  all_day?:     boolean
  color?:       string | null
}

export interface UpdateProfileInput {
  display_name?:  string | null
  date_of_birth?: string | null
  avatar_url?:    string | null
}

export interface UpdateMemberPermissionsInput {
  finance_access?:  AccessLevel
  shopping_access?: AccessLevel
  calendar_access?: AccessLevel
  settings_access?: AccessLevel
  ai_access?:       AccessLevel
}
```

---

## Query Result Types

```ts
// Returned by RPC get_monthly_summary
export interface MonthlySummaryRow {
  category_id:   string | null
  category_name: string | null
  parent_id:     string | null
  income_cents:  number
  expense_cents: number        // always <= 0
}

export interface MonthlySummary {
  total_income_cents:  number
  total_expense_cents: number  // always <= 0
  net_cents:           number
  by_category:         MonthlySummaryRow[]
}

// Returned by RPC get_invitation_by_token
export interface InvitationDetails {
  account_name:     string
  invited_by_name:  string  // display_name or email of inviter
  role:             Role
}

// Shape of exported backup JSON
export interface BackupFile {
  version:        1
  exported_at:    string  // ISO-8601
  app_version:    string
  schema_version: number
  contents: {
    accounts:     AccountRow[]
    categories:   CategoryRow[]
    transactions: TransactionRow[]
  }
  metadata: {
    account_count:     number
    category_count:    number
    transaction_count: number
    date_range: { earliest: string; latest: string } | null
  }
}
```

---

## Supabase RPC Reference

| RPC Function | Parameters | Returns | Notes |
|---|---|---|---|
| `get_monthly_summary` | `p_account_id uuid, p_year_month text` | `MonthlySummaryRow[]` | Excludes `is_transfer=true` rows |
| `get_account_members` | `p_account_id uuid` | `AccountMemberRow[]` | Joins auth.users + profiles; SECURITY DEFINER to avoid RLS recursion |
| `get_invitation_by_token` | `p_token uuid` | `InvitationDetails` | Public — no auth needed |
| `accept_invitation` | `p_token uuid` | `void` | Moves user to invited account, marks token accepted |
| `remove_account_member` | `p_account_id uuid, p_member_id uuid` | `void` | Admin-only; SECURITY DEFINER |
| `get_or_create_account` | — | `AccountRow` | Returns existing account or creates fresh personal one |
