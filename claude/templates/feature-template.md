# Feature: [Name]

## Goal

What problem does this feature solve for the user?

## User Flow

Step-by-step interaction from the user's perspective:

1. User does X
2. System responds with Y
3. User confirms / cancels
4. Result is Z

## API Impact

New or modified endpoints:

| Method | Path | Change |
|--------|------|--------|
| POST | /api/... | New |
| PATCH | /api/... | Modified |

## Data Impact

New tables, columns, or indexes:

```sql
-- Example: new column
ALTER TABLE transactions ADD COLUMN ...;
```

## Edge Cases

- What happens if the user submits an empty form?
- What happens if the network fails mid-operation?
- What happens with concurrent requests?
- What happens with invalid/unexpected input?

## Tests Required

- [ ] Unit: [service method] with valid input
- [ ] Unit: [service method] with invalid input
- [ ] Unit: edge case — [describe]
- [ ] Integration: [endpoint] returns correct response
- [ ] Integration: [endpoint] rejects unauthorized request

## Risks

- Risk 1 and mitigation
- Risk 2 and mitigation
