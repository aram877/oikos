# Categorization Rules

Deterministic, user-defined rules that match transactions by description
substring + optional amount range and tag them with a category (and
optional note).

## Routes

UI lives in **Settings**: `src/app/settings/page.tsx` →
`_components/CategorizationRulesSection.tsx`. No standalone route.

## Database

### `public.categorization_rules`
Defined in `supabase/add_categorization_rules.sql`, modified by
`alter_categorization_rules_amount_range.sql` and
`alter_categorization_rules_add_note.sql`.

| Column                  | Type     | Notes |
|-------------------------|----------|-------|
| `id`                    | uuid PK  | |
| `account_id`            | uuid FK  | → `accounts.id` |
| `description_contains`  | text     | substring match, **case-insensitive** |
| `amount_min_cents`      | int?     | NULL = no lower bound; matches `|amount| >=` |
| `amount_max_cents`      | int?     | NULL = no upper bound; matches `|amount| <=` |
| `category_id`           | uuid FK  | → `categories.id` |
| `note`                  | text?    | optional; applied to matched transaction |
| `created_at`            | timestamptz | |

**RLS** — Account members can manage their account's rules.

## Repository — `src/db/repositories/categorizationRulesRepo.ts`

| Function | Purpose |
|----------|---------|
| `listRules()` | All rules for the active account, ordered by `created_at`. |
| `insertRule(input)` | Create. |
| `deleteRule(id)` | Hard delete. |

Exposed on `dbClient.categorizationRules` as `list`, `insert`, `delete`.

## React layer

- `src/app/settings/_components/CategorizationRulesSection.tsx` — the rule
  list with a delete button per row, an inline form to add a rule, and a
  **Re-categorize** button.
- `src/app/settings/_hooks/useCategorizationRules.ts`:
  - `addRule(input)` / `removeRule(id)`.
  - `recategorize()` — the batch applier. Loads all active transactions and
    rules; iterates each transaction; tests rules in creation order; applies
    the **first match** (sets `category_id`, sets `notes` if `rule.note` is
    provided); shows live progress (current / total / applied count).

## How it works

1. **Create a rule.** "Netflix · 0–€15 · Entertainment · note: Streaming".
   Submit → `insertRule` → list refreshes.
2. **Manual application.** No automatic application during CSV/bank
   import. The user clicks **Re-categorize** in settings; the hook iterates
   every active transaction and for each one finds the first matching rule.
3. **Match logic** (per row):
   - `description_contains` → case-insensitive `String#includes`.
   - Amount range tested against `|amount_cents|`. Both nulls = always
     matches; one set = open bound; both set = closed range (inclusive).
4. **First-match wins.** Rules are tested in `created_at` order. To prefer a
   specific rule, create it first.
5. **Note application.** If `rule.note` is set, it overrides the
   transaction's `notes` field. (If you want to preserve existing notes,
   leave `note` null.)
6. **Future imports.** Rules are *not* applied automatically during CSV or
   bank import. The user runs Re-categorize after the import to apply them
   in bulk.

## Notable details

- **Substring match, not regex.** Keep it boring; it's predictable.
- **Absolute amount.** A €100 expense and €100 income are both matched by
  `min/max` filters that bracket 10 000.
- **No audit trail.** Which rule matched is not persisted on the
  transaction; you can't filter "rows tagged by rule X" later.
- **Hard delete.** Removing a rule doesn't undo its prior categorizations —
  those rows keep their `category_id` until you re-categorize manually.
- **Why not auto-apply on import?** It's deliberately a batch operation —
  applying rules during the CSV review step would force the user to commit
  to category mappings *before* they've reviewed each row, which is
  surprising. Today the rule engine is best run after import, at the user's
  discretion.

## Permissions

`abilities.settings` controls the Settings page; `abilities.finance` (write)
is required to actually mutate transaction categories.
