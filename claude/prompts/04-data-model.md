# Prompt: Data Model

Turn the data model draft into a SQLite schema.

Deliver:

- SQLite DDL (tables + indexes + foreign keys)
- Migrations:
  - 000_init.sql
  - 001_add_notes.sql (example)
- How PRAGMA foreign_keys is enforced
- How schema version is tracked and validated at runtime
- 5 key queries:
  1. transactions by month
  2. monthly income/expense totals
  3. totals by category for month
  4. search description
  5. duplicate candidates for CSV import
