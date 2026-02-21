# Prompt: Migrations & Versioning

Design a minimal migration/versioning system for local-first storage.

## Context

- Storage may be IndexedDB or SQLite-WASM
- Migrations run at app startup before anything else
- There is no server to coordinate — migrations must be self-contained
- Users may not open the app for weeks, so multiple migrations may stack

## Deliver

1. **How schema versions are tracked**
   - Where the current version number is stored (metadata table / IDB version / key-value store)
   - Format: integer version or timestamp — justify choice

2. **How migrations are applied**
   - Migration registry: array of `{ from, to, up }` objects
   - Startup sequence: read version → find pending migrations → run in order → update version
   - Each migration runs inside a transaction (atomicity)

3. **Rollback strategy**
   - Is rollback feasible in IndexedDB? (honest answer: mostly not)
   - Recommended safety alternative: auto-backup before any migration runs
   - How the user is notified if a migration fails

4. **Testing approach**
   - How to seed a database at version N and assert state after migration to N+1
   - Testing with missing/null fields (realistic old data)
   - Testing idempotency (running migration twice should be safe)

5. **Worked example: v1 → v2**
   - Scenario: add `notes` field (nullable string) to `transactions`
   - Migration code
   - Backfill rule (set `notes = null` for existing rows)
   - Before/after assertions

6. **Worked example: v2 → v3**
   - Scenario: split `amount` into `amountCents` (integer) + `currency` (string)
   - Migration code
   - Backfill rule (convert existing float amounts, assume EUR)
   - Before/after assertions
