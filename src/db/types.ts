// ── Row types (mirror Supabase column names exactly) ─────────────────────── //

export interface AccountRow {
  id:         string
  name:       string
  currency:   string        // always 'EUR' in MVP
  created_at: string        // ISO-8601 datetime
  deleted_at: string | null // NULL = active
}

export interface CategoryRow {
  id:         string
  account_id: string
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
  is_transfer:  boolean       // true = internal transfer, excluded from income/expense summaries
  created_at:   string        // ISO-8601 datetime
  updated_at:   string        // ISO-8601 datetime
  deleted_at:   string | null
}

/** TransactionRow enriched with joined category fields — returned by list queries. */
export interface TransactionListRow extends TransactionRow {
  category_name:        string | null
  category_parent_id:   string | null
  parent_category_name: string | null
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
  account_id:    string
  category_id:   string | null
  amount_cents:  number
  date:          string        // YYYY-MM-DD
  description:   string
  notes?:        string | null
  import_hash?:  string | null
  is_transfer?:  boolean
}

export interface UpdateTransactionInput {
  category_id?:  string | null
  amount_cents?: number
  date?:         string
  description?:  string
  notes?:        string | null
  is_transfer?:  boolean
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

export interface AccountBalance {
  cashflow_cents:  number  // income − expenses (non-transfers) = net worth
  transfers_cents: number  // net of transfer transactions (negative = moved to savings)
  balance_cents:   number  // checking account balance (all transactions)
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
  schema_version: number
  contents:       BackupContents
  metadata:       BackupMetadata
}

export interface ValidationResult {
  valid:  boolean
  errors: string[]
}

// ── Account member types ─────────────────────────────────────────────────── //

export type AccessLevel = 'none' | 'read' | 'write'

export interface AccountMemberRow {
  user_id:          string
  email:            string
  display_name:     string | null  // resolved via RPC (profiles join); never actually null
  role:             'admin' | 'parent' | 'child'
  joined_at:        string
  finance_access:   AccessLevel
  shopping_access:  AccessLevel
  calendar_access:  AccessLevel
  settings_access:  AccessLevel
  ai_access:        AccessLevel
  messaging_access: AccessLevel
}

export interface UpdateMemberPermissionsInput {
  finance_access?:  AccessLevel
  shopping_access?: AccessLevel
  calendar_access?: AccessLevel
  settings_access?: AccessLevel
  ai_access?:       AccessLevel
}

// ── Shopping list types ───────────────────────────────────────────────────── //

export interface ShoppingItemRow {
  id:         string
  account_id: string
  name:       string
  quantity:   string | null
  added_by:   string | null
  created_at: string
}

export interface InsertShoppingItemInput {
  name:      string
  quantity?: string | null
}

// ── Profile types ─────────────────────────────────────────────────────────── //

export interface ProfileRow {
  id:            string
  display_name:  string | null
  date_of_birth: string | null  // YYYY-MM-DD
  avatar_url:    string | null
  updated_at:    string
}

export interface UpdateProfileInput {
  display_name?:  string | null
  date_of_birth?: string | null
  avatar_url?:    string | null
}

// ── Messages types ────────────────────────────────────────────────────────── //

export interface MessageRow {
  id:           string
  account_id:   string
  user_id:      string
  recipient_id: string | null   // null = group message
  body:         string
  created_at:   string
}

export interface InsertMessageInput {
  body:         string
  recipient_id: string | null   // null = group message
}

// ── Calendar event types ──────────────────────────────────────────────────── //

export interface CalendarEventRow {
  id:          string
  account_id:  string
  title:       string
  description: string | null
  start_date:  string
  end_date:    string | null
  all_day:     boolean
  color:       string | null
  source_uid:  string | null
  created_by:  string | null
  updated_by:  string | null
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

export interface InsertCalendarEventInput {
  title:        string
  description?: string | null
  start_date:   string
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

export interface BulkInsertCalendarEventInput {
  title:       string
  description: string | null
  start_date:  string        // YYYY-MM-DD
  end_date:    string | null
  all_day:     boolean
  color:       string | null
  source_uid:  string        // required for dedup
}

// ── Meal plan types ───────────────────────────────────────────────────────── //

export interface MealRow {
  id:         string
  account_id: string
  name:       string
  created_at: string
}

export interface MealIngredientRow {
  id:      string
  meal_id: string
  name:    string
}

/** A MealRow with its ingredients pre-joined */
export interface MealWithIngredients extends MealRow {
  ingredients: MealIngredientRow[]
}

export type SlotName = 'breakfast' | 'lunch' | 'dinner'

export interface MealPlanSlotRow {
  id:          string
  account_id:  string
  week_start:  string   // YYYY-MM-DD (always Monday)
  day_of_week: number   // 0=Mon … 6=Sun
  slot:        SlotName
  meal_id:     string | null
}

/** Slot enriched with the assigned meal name (for display) */
export interface MealPlanSlotWithMeal extends MealPlanSlotRow {
  meal_name: string | null
}

export interface InsertMealInput {
  name:        string
  ingredients: string[]   // list of ingredient names
}

export interface UpdateMealInput {
  name?:        string
  ingredients?: string[]  // full replacement — old rows deleted, new inserted
}

export interface UpsertSlotInput {
  week_start:  string
  day_of_week: number
  slot:        SlotName
  meal_id:     string | null  // null = clear the slot
}

// ── Categorization rule types ─────────────────────────────────────────────── //

export interface CategorizationRuleRow {
  id:                   string
  account_id:           string
  description_contains: string
  amount_min_cents:     number | null  // null = no lower bound  (|amount| >= min)
  amount_max_cents:     number | null  // null = no upper bound  (|amount| <= max)
  category_id:          string
  note:                 string | null  // optional note applied to matched transactions
  created_at:           string
}

export interface InsertCategorizationRuleInput {
  description_contains: string
  amount_min_cents:     number | null
  amount_max_cents:     number | null
  category_id:          string
  note:                 string | null
}
