# Migration: v[old] → v[new]

## Purpose

What changed in the data model and why was this change needed?

## Steps

1. [First operation — e.g. add column `notes` to `transactions`]
2. [Second operation — e.g. backfill `notes = null` for all existing rows]
3. [Third operation — e.g. update schema version record to `v[new]`]

All steps run inside a single transaction. If any step fails, the entire migration is rolled back and the version number is not updated.

## Data Backfill

| Field | Rule | Edge cases |
|-------|------|-----------|
| `notes` | Set to `null` for all pre-existing rows | None — nullable field |
| `amountCents` | Convert float `amount * 100`, round to nearest integer | Negative amounts, zero amounts |

## Safety

- **Idempotent?** Yes — running this migration twice produces the same result / No — guard with version check
- **Auto-backup before run?** Yes — a snapshot export is created before this migration starts
- **What if interrupted mid-way?** The wrapping transaction ensures either full success or full rollback
- **Reversible?** No (typical for local-first) — the pre-migration backup serves as the rollback

## Tests

```typescript
describe('Migration v[old] → v[new]', () => {
  it('adds the notes field to all existing transactions', async () => {
    // seed: insert a v[old] transaction without notes
    // run: applyMigration(old, new)
    // assert: transaction now has notes === null
  })

  it('does not alter unrelated fields', async () => {
    // assert: amount, date, description unchanged after migration
  })

  it('updates the schema version to v[new]', async () => {
    // assert: getSchemaVersion() === new
  })

  it('is safe to run on an empty database', async () => {
    // no rows to migrate — should not throw
  })
})
```
