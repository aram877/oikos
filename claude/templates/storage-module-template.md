# Storage Module: [Name]

## Responsibility

One sentence. What entity or domain does this module own?

## Public API

```typescript
interface [Name]Storage {
  getById(id: string): Promise<[Entity] | null>
  list(filters: [Name]Filters): Promise<[Entity][]>
  upsert(data: [Entity]): Promise<[Entity]>
  delete(id: string): Promise<void>
}
```

All methods are async. Never expose the underlying storage engine to callers.

## Data Integrity Rules

- Uniqueness: `id` must be unique within the store
- Required fields: list which fields must always be present
- Constraints enforced at this layer (not just in the UI):
  - Example: `amount` must be a non-zero integer
  - Example: `accountId` must reference an existing account

## Versioning / Migrations

- **Current schema version this module targets:** `v[N]`
- **Migration notes:**
  - v1 → v2: [what changed]
  - v2 → v3: [what changed]

## Failure Handling

| Scenario | Behaviour |
|----------|-----------|
| Partial write interrupted | Wrap in a transaction; rollback on error |
| Storage quota exceeded | Throw `StorageQuotaError`; surface to user with export prompt |
| Read of missing record | Return `null` — do not throw |
| Unexpected schema version | Throw `SchemaMismatchError`; block further writes |

## Tests

- [ ] `upsert` creates a new record when ID does not exist
- [ ] `upsert` updates an existing record when ID exists
- [ ] `getById` returns `null` for unknown ID
- [ ] `delete` removes the record; subsequent `getById` returns `null`
- [ ] Data roundtrip: write then read returns identical data
- [ ] Integrity rule violations throw and do not persist bad data
