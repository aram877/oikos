# Decision Log

## 2026-02-21

Decision: No recurring transactions in MVP.
Reason: Reduces complexity significantly.

## 2026-02-21 — Local-first storage is SQLite

Decision: Use SQLite as the local database for MVP. No backend/auth in MVP.
Implementation target: SQLite WASM in browser with persistent storage (OPFS).
Reason: Strong data integrity + fast summaries + offline + single-user tool.
Consequence: Export/restore is the “sync” mechanism for MVP.

## 2026-02-21

“MVP uses SQLite WASM + OPFS (verified by spike on 2026-02-21)”

“No auth/backend in MVP”

“If pre-migration backup fails → block migration (default)”
