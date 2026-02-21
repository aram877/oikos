# Prompt: UI Structure

Design the UI structure for the MVP.

## Screens Required

- Dashboard (monthly overview, income vs expenses, category breakdown)
- Transactions list (filterable, sortable, paginated)
- Add / edit transaction form
- Categories management (create, edit, nest, delete)
- CSV import wizard (multi-step)

## Deliver

1. Route structure (paths and component names)
2. State ownership per screen — what lives in server state vs local state
3. Loading / error / empty state handling strategy for each screen
4. Large list handling strategy (10 000+ rows in transaction list)
5. Form state management approach (controlled, library, or server action)
6. Where React Query / SWR fits vs plain fetch

## Constraints

- No UI library preference imposed — justify your choice
- Mobile-responsive is a nice-to-have, not a requirement
- No real-time updates needed in MVP
