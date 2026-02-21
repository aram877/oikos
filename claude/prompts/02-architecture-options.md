# Prompt: Architecture Options

Propose 2 architecture options for this project.

For each option provide:
- Stack
- Pros/cons
- Complexity level (1–5)
- Failure modes
- Scalability impact
- Migration risks

Then recommend one based on:
- Solo developer
- Speed to build
- Maintainability
- Future sync potential (e.g. bank import, mobile)

## Context

- Germany / EUR context
- Manual transaction entry (no bank sync in MVP)
- Single user per deployment in MVP
- Postgres as the database
- Must support CSV import from common German bank exports
