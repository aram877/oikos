# Prompt: CSV Import Design

Design a robust CSV import flow for German bank exports.

## Constraints

- Unknown bank formats (DKB, ING, Sparkasse, N26 all differ)
- Date format inconsistencies (DD.MM.YYYY, YYYY-MM-DD, etc.)
- Decimal inconsistencies (German: 1.234,56 vs international: 1,234.56)
- Duplicate detection required (same transaction imported twice)
- File size can be large (1–2 years of history = 1 000–3 000 rows)

## Deliver

1. UX step-by-step flow (upload → preview → map columns → validate → confirm → import)
2. Column mapping strategy (how to let user map CSV columns to our fields)
3. Validation rules (what gets rejected and why)
4. Two duplicate detection algorithm options with trade-offs:
   - Option A: Hash-based (fast, exact)
   - Option B: Fuzzy match (slower, catches near-duplicates)
5. Normalization rules for amounts, dates, and text fields
6. Failure scenarios and how each is handled
7. Rollback strategy if import partially fails
