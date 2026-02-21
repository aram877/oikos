# Repository: [Entity]Repository

## Purpose

One sentence. Owns all DB access for the `[entity]` table.

## Queries Implemented

```typescript
class [Entity]Repository {
  async findById(id: string): Promise<[Entity] | null>
  async findAllByUser(userId: string, filters: [Entity]Filters): Promise<[Entity][]>
  async countByUser(userId: string, filters: [Entity]Filters): Promise<number>
  async insert(data: Insert[Entity]): Promise<[Entity]>
  async update(id: string, data: Partial<Insert[Entity]>): Promise<[Entity]>
  async softDelete(id: string): Promise<void>
}
```

## Index Usage

| Query | Index used | Notes |
|-------|-----------|-------|
| `findById` | `PRIMARY KEY (id)` | |
| `findAllByUser` | `idx_[entity]_user_id_date` | Covers user_id + date filter |
| Monthly summary | `idx_[entity]_user_id_date` | Range scan on date |

## Performance Notes

- All list queries are paginated — never return unbounded result sets
- Use `LIMIT` + `OFFSET` for simple pagination; keyset for high-volume tables
- Avoid `SELECT *` — always select only needed columns

## Edge Cases

- `findById` returns `null` (not an error) when not found — caller decides
- Soft-deleted records: filtered out by default via `WHERE deleted_at IS NULL`
- `insert` returns the full inserted row (use `RETURNING *` in Postgres)

## Raw SQL or Query Builder

Prefer parameterized queries. Never interpolate user input directly into SQL.

```typescript
// Good
await db.query('SELECT * FROM transactions WHERE id = $1', [id]);

// Bad — SQL injection risk
await db.query(`SELECT * FROM transactions WHERE id = '${id}'`);
```
