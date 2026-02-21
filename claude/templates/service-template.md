# Service: [Name]Service

## Purpose

One sentence. What domain does this service own?

## Public Methods

```typescript
class [Name]Service {
  async getById(id: string, userId: string): Promise<[Entity]>
  async list(filters: [Name]Filters): Promise<PaginatedResult<[Entity]>>
  async create(data: Create[Name]Input, userId: string): Promise<[Entity]>
  async update(id: string, data: Update[Name]Input, userId: string): Promise<[Entity]>
  async delete(id: string, userId: string): Promise<void>
}
```

## Business Rules

- Rule 1: e.g. "A transaction amount must not be zero."
- Rule 2: e.g. "Split amounts must sum to the total transaction amount."
- Rule 3: e.g. "Soft delete only — never hard delete financial records."

## Error Strategy

| Scenario | Error thrown |
|----------|--------------|
| Entity not found | `NotFoundError` |
| Unauthorized access | `ForbiddenError` |
| Validation failure | `ValidationError` |
| DB error | Re-throw as `InternalError` after logging |

Do not expose raw DB errors to callers.

## Dependencies

- `[Name]Repository` — for all DB access
- `[Other]Service` — for [reason]

## Test Coverage

- [ ] `getById` returns entity for valid id + owner
- [ ] `getById` throws `NotFoundError` for unknown id
- [ ] `getById` throws `ForbiddenError` for wrong user
- [ ] `create` persists entity with correct fields
- [ ] `create` throws `ValidationError` for invalid input
- [ ] `delete` soft-deletes, does not hard-delete
