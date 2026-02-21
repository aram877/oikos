# Review Checklist

Use this before every PR or major feature merge.

## Code Quality
- [ ] No `any` types in TypeScript (use `unknown` + narrowing if needed)
- [ ] All functions have explicit return types
- [ ] No commented-out code committed
- [ ] No `console.log` left in production paths
- [ ] No TODO comments without a linked issue

## Architecture
- [ ] Feature follows the established layer structure (route → service → repository)
- [ ] No business logic in route handlers
- [ ] No raw SQL outside repository layer
- [ ] No direct DB access from React components or API routes (must go through service)

## Security
- [ ] All user inputs validated and sanitized
- [ ] No sensitive data logged
- [ ] Auth middleware applied to all protected routes
- [ ] No secrets or credentials in code or comments
- [ ] CSV import validated against injection

## Database
- [ ] Migrations are reversible (`up` and `down`)
- [ ] New queries use existing indexes where possible
- [ ] No N+1 queries introduced
- [ ] Transactions used where data consistency is required

## API
- [ ] All endpoints return consistent error format
- [ ] HTTP status codes are semantically correct
- [ ] Pagination applied to list endpoints
- [ ] Input validation errors return 400 with field details

## Frontend
- [ ] Loading, error, and empty states handled for every async operation
- [ ] No unhandled promise rejections
- [ ] Forms reset correctly after submission
- [ ] Large lists use virtualization or pagination (not full render)

## Tests
- [ ] Business logic in services has unit tests
- [ ] Happy path and at least one error path covered
- [ ] No test depends on ordering or shared mutable state
- [ ] Mocks are realistic (not just `jest.fn()` with no behavior)

## Performance
- [ ] No synchronous blocking in request handlers
- [ ] CSV import streams or batches — does not load full file into memory
- [ ] Expensive queries are not called in a loop

## Maintainability
- [ ] File and function names are self-descriptive
- [ ] No function longer than ~50 lines without justification
- [ ] No file longer than ~300 lines without justification
- [ ] New env vars documented in `.env.example`
