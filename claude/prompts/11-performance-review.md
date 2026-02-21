# Prompt: Performance Review

Review this implementation for performance issues.

## Focus Areas

- Transaction list scalability (10 000+ rows)
- Query efficiency and index usage
- N+1 query detection
- Memory footprint (especially in CSV import)
- API response times under realistic load
- Frontend rendering performance for large datasets

## How to Use

Paste the relevant code (service layer, repository queries, or component) after this prompt, then ask:

> "Review this for performance issues using the focus areas above."

## Deliver

1. Top bottlenecks ranked by severity
2. Quick wins (low effort, high impact)
3. Refactor plan for each bottleneck
4. Estimated risk if left unaddressed
5. Suggested indexes or query rewrites with before/after examples
