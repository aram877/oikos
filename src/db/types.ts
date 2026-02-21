// ── Row types (mirror SQLite column names exactly) ───────────────────────── //

export interface AccountRow {
  id:         string
  name:       string
  currency:   string        // always 'EUR' in MVP
  created_at: string        // ISO-8601 datetime
  deleted_at: string | null // NULL = active
}

export interface CategoryRow {
  id:         string
  name:       string
  parent_id:  string | null // NULL = top-level
  created_at: string
  deleted_at: string | null
}

export interface TransactionRow {
  id:           string
  account_id:   string
  category_id:  string | null // NULL = uncategorized
  amount_cents: number        // negative = expense, positive = income
  currency:     string        // always 'EUR' in MVP
  date:         string        // YYYY-MM-DD
  description:  string
  notes:        string | null
  import_hash:  string | null // opaque dedup key set by CSV importer
  created_at:   string        // ISO-8601 datetime
  updated_at:   string        // ISO-8601 datetime
  deleted_at:   string | null
}

// ── Input types ──────────────────────────────────────────────────────────── //

export interface InsertAccountInput {
  name:     string
  currency: string
}

export interface UpdateAccountInput {
  name?: string
}

export interface InsertCategoryInput {
  name:      string
  parent_id: string | null
}

export interface UpdateCategoryInput {
  name?:      string
  parent_id?: string | null
}

export interface InsertTransactionInput {
  account_id:   string
  category_id:  string | null
  amount_cents: number
  date:         string        // YYYY-MM-DD
  description:  string
  notes?:       string | null
  import_hash?: string | null
}

export interface UpdateTransactionInput {
  category_id?:  string | null
  amount_cents?: number
  date?:         string
  description?:  string
  notes?:        string | null
}

// ── Query result types ───────────────────────────────────────────────────── //

export interface MonthlySummaryRow {
  category_id:   string | null
  category_name: string | null
  parent_id:     string | null
  income_cents:  number
  expense_cents: number // always <= 0
}

export interface MonthlySummary {
  total_income_cents:  number
  total_expense_cents: number // always <= 0
  net_cents:           number
  by_category:         MonthlySummaryRow[]
}

// ── Backup format ────────────────────────────────────────────────────────── //

/** Bump this when the backup JSON shape changes incompatibly. */
export const BACKUP_VERSION = 1 as const

export interface BackupContents {
  accounts:     AccountRow[]
  categories:   CategoryRow[]
  transactions: TransactionRow[]
}

export interface BackupMetadata {
  account_count:     number
  category_count:    number
  transaction_count: number
  /** null when there are no transactions */
  date_range: { earliest: string; latest: string } | null
}

export interface BackupFile {
  version:        typeof BACKUP_VERSION
  exported_at:    string // ISO-8601 datetime
  app_version:    string // e.g. "0.1.0"
  schema_version: number // PRAGMA user_version at export time
  contents:       BackupContents
  metadata:       BackupMetadata
}

export interface ValidationResult {
  valid:  boolean
  errors: string[]
}

// ── Worker message protocol ──────────────────────────────────────────────── //

export interface WorkerRequest {
  id:     string
  method: string
  args?:  unknown
}

export interface WorkerResponse {
  id:      string
  result?: unknown
  error?:  string
}
