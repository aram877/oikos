Design the local-first storage approach using SQLite.

Constraints:

- Next.js web/PWA
- Single-user, single-device MVP
- No backend/auth in MVP
- Must persist locally across browser restarts
- Must support export/restore and schema migrations safely

Deliver:

1. SQLite approach choice (WASM + OPFS vs alternatives) and why
2. DB initialization flow (where it runs, when it opens, how it’s shared)
3. Migration/versioning mechanism (PRAGMA user_version + migration table)
4. Data access layer boundaries (db module, repositories, services)
5. Backup/export/restore design (versioned JSON format + validation)
6. Failure modes and recovery steps (corruption, partial writes, interrupted migrations)
