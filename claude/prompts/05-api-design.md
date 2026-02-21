# Prompt: API Design

Design the REST API for the MVP.

## Requirements

- CRUD for transactions
- CRUD for categories
- CRUD for accounts
- Get monthly summary (income, expenses, balance per category)
- CSV import endpoint

## Deliver

1. Full route list with HTTP methods and paths
2. Request/response examples for each route (JSON)
3. Validation strategy (what library, what rules)
4. Consistent error response format
5. Pagination strategy for list endpoints
6. Idempotency considerations for CSV import
7. Auth header convention

## Constraints

- REST only (no GraphQL)
- Strict TypeScript
- No over-engineering — MVP routes only
- All amounts in cents (integer) to avoid float precision issues
- Dates as ISO 8601 strings
